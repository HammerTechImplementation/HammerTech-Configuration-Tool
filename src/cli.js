#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { stdin as input, stdout as output } from "node:process";
import { resolveAuthOptions } from "./config.js";
import { HammerTechClient } from "./http.js";
import { readSpreadsheetRows } from "./spreadsheet.js";
import { clientFromSession, loadSession, saveSession } from "./session.js";
import { executeUserOperations, listAllUsers, planUserOperations } from "./users.js";
import { printOperationResults, toCsv, writeJson } from "./output.js";

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  if (process.env.DEBUG) process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});

async function main() {
  const { command, subcommand, flags, positional } = parseArgs(process.argv.slice(2));

  if (!command || flags.help || flags.h) {
    printHelp();
    return;
  }

  if (command === "auth" && subcommand === "token") return authToken(flags);
  if (command === "auth" && subcommand === "cookie-login") return authCookieLogin(flags);
  if (command === "users") return usersCommand(subcommand, flags);
  if (command === "request") return rawRequest(subcommand, positional, flags);

  throw new Error(`Unknown command. Run "node ./src/cli.js --help".`);
}

async function authToken(flags) {
  const auth = resolveAuthOptions(flags);
  const password = auth.password || await promptPassword("HammerTech password: ");
  const client = await HammerTechClient.authenticate({
    region: auth.region,
    tenant: required(auth.tenant, "tenant"),
    email: required(auth.email, "email"),
    password
  });

  if (flags["save-session"]) {
    await saveSession(auth.sessionPath, client.toSession({ tenant: auth.tenant, email: auth.email }));
    process.stdout.write(`Saved bearer token session to ${auth.sessionPath}\n`);
  }

  if (!flags["save-session"] || flags["print-token"]) {
    writeJson({
      region: client.region,
      token: client.token,
      cookies: client.cookieJar.toJSON()
    });
  }
}

async function authCookieLogin(flags) {
  const auth = resolveAuthOptions(flags);
  const password = auth.password || await promptPassword("HammerTech password: ");
  const session = await loadSession(auth.sessionPath);
  const client = session
    ? clientFromSession(session)
    : new HammerTechClient({ region: auth.region || "us", token: auth.token });

  const template = flags["body-template"] || '{"email":"{{email}}","password":"{{password}}","tenant":"{{tenant}}"}';
  const body = JSON.parse(renderTemplate(template, {
    email: required(auth.email, "email"),
    password,
    tenant: required(auth.tenant, "tenant")
  }));

  const response = await client.cookieLogin({
    url: required(flags.url, "url"),
    method: flags.method || "POST",
    body
  });

  if (flags["save-session"]) {
    await saveSession(auth.sessionPath, client.toSession({ tenant: auth.tenant, email: auth.email }));
    process.stdout.write(`Saved cookie session to ${auth.sessionPath}\n`);
  }

  if (!flags.quiet) {
    writeJson({
      response,
      cookies: client.cookieJar.toJSON()
    });
  }
}

async function usersCommand(subcommand, flags) {
  if (subcommand === "import") {
    const rows = await readSpreadsheetRows(required(flags.file, "file"), { sheet: flags.sheet });
    const plan = planUserOperations(rows, { defaultAction: flags.action || "create" });
    const client = flags.apply ? await authenticatedClient(flags) : null;
    const results = await executeUserOperations(client, plan.operations, {
      apply: Boolean(flags.apply),
      matchByEmail: Boolean(flags["match-by-email"]),
      continueOnError: Boolean(flags["continue-on-error"])
    });
    printOperationResults(results, { json: flags.format === "json" || flags.json });
    if (results.some((result) => result.status === "invalid" || result.status === "failed")) {
      process.exitCode = 1;
    }
    return;
  }

  const client = await authenticatedClient(flags);

  if (subcommand === "list") {
    const users = await listAllUsers(client, listUserQuery(flags));
    return outputData(users, flags);
  }

  if (subcommand === "get") {
    const user = await client.getUser(required(flags.id, "id"));
    return outputData(user, flags);
  }

  if (subcommand === "create") {
    const payload = await readJsonPayload(flags);
    const response = await client.createUser(payload);
    return writeJson(response);
  }

  if (subcommand === "update" || subcommand === "patch") {
    const payload = await readJsonPayload(flags);
    const response = await client.patchUser(required(flags.id, "id"), payload, {
      IsResetProjectPermissions: flags["reset-project-permissions"]
    });
    return writeJson(response);
  }

  if (subcommand === "delete") {
    const response = await client.deleteUser(required(flags.id, "id"));
    return writeJson(response);
  }

  throw new Error(`Unknown users command "${subcommand}".`);
}

async function rawRequest(method, positional, flags) {
  const actualMethod = String(method || "").toUpperCase();
  if (!actualMethod) throw new Error("Usage: request METHOD PATH_OR_URL [--body-json JSON]");
  const pathOrUrl = positional[0] || flags.url;
  const client = await authenticatedClient(flags);
  const body = flags["body-json"] ? JSON.parse(flags["body-json"]) : undefined;
  const response = await client.request(actualMethod, required(pathOrUrl, "path or url"), {
    body,
    bearer: flags["cookie-only"] ? false : true,
    cookies: flags["no-cookies"] ? false : true
  });
  writeJson(response);
}

async function authenticatedClient(flags) {
  const auth = resolveAuthOptions(flags);
  const session = await loadSession(auth.sessionPath);
  if (session?.token || session?.cookies?.length) {
    return clientFromSession({
      ...session,
      token: auth.token || session.token
    });
  }

  if (auth.token) {
    return new HammerTechClient({ region: auth.region || "us", token: auth.token });
  }

  const password = auth.password || await promptPassword("HammerTech password: ");
  const client = await HammerTechClient.authenticate({
    region: auth.region,
    tenant: required(auth.tenant, "tenant"),
    email: required(auth.email, "email"),
    password
  });

  if (flags["save-session"]) {
    await saveSession(auth.sessionPath, client.toSession({ tenant: auth.tenant, email: auth.email }));
  }
  return client;
}

function listUserQuery(flags) {
  return {
    projectId: flags["project-id"],
    modifiedSince: flags["modified-since"],
    sortBy: flags["sort-by"],
    onlyInternalUsers: flags["only-internal-users"],
    userKind: flags["user-kind"],
    meOnly: flags["me-only"],
    includeDeleted: flags["include-deleted"],
    includeNotAssigned: flags["include-not-assigned"],
    internalIdentifier: flags["internal-identifier"],
    take: flags.take,
    skip: flags.skip
  };
}

async function readJsonPayload(flags) {
  if (flags.json) return JSON.parse(flags.json);
  if (flags["json-file"]) return JSON.parse(await readFile(flags["json-file"], "utf8"));
  throw new Error("Provide --json '{...}' or --json-file path.");
}

async function outputData(data, flags) {
  if (flags.output) {
    let text;
    if (String(flags.output).toLowerCase().endsWith(".csv")) {
      const rows = Array.isArray(data) ? data : [data];
      text = `${toCsv(rows)}\n`;
    } else {
      text = `${JSON.stringify(data, null, 2)}\n`;
    }
    await writeFile(flags.output, text, "utf8");
    process.stdout.write(`Wrote ${flags.output}\n`);
    return;
  }

  if (flags.format === "csv") {
    const rows = Array.isArray(data) ? data : [data];
    process.stdout.write(`${toCsv(rows)}\n`);
    return;
  }

  writeJson(data);
}

function parseArgs(args) {
  const positional = [];
  const flags = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") {
      positional.push(...args.slice(index + 1));
      break;
    }

    if (arg.startsWith("--no-")) {
      flags[arg.slice(5)] = false;
      continue;
    }

    if (arg.startsWith("--")) {
      const equals = arg.indexOf("=");
      if (equals !== -1) {
        flags[arg.slice(2, equals)] = arg.slice(equals + 1);
        continue;
      }

      const key = arg.slice(2);
      const next = args[index + 1];
      if (next === undefined || next.startsWith("-")) {
        flags[key] = true;
      } else {
        flags[key] = next;
        index += 1;
      }
      continue;
    }

    if (arg.startsWith("-") && arg.length > 1) {
      flags[arg.slice(1)] = true;
      continue;
    }

    positional.push(arg);
  }

  return {
    command: positional.shift(),
    subcommand: positional.shift(),
    positional,
    flags
  };
}

async function promptPassword(prompt) {
  if (!input.isTTY || !output.isTTY) {
    throw new Error("Password is required. Set HAMMERTECH_PASSWORD or pass --password in non-interactive shells.");
  }

  output.write(prompt);
  input.setRawMode(true);
  input.resume();
  let password = "";

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      input.setRawMode(false);
      input.pause();
      output.write("\n");
    };

    input.on("data", function onData(buffer) {
      const char = buffer.toString("utf8");
      if (char === "\u0003") {
        cleanup();
        input.off("data", onData);
        reject(new Error("Cancelled."));
        return;
      }
      if (char === "\r" || char === "\n") {
        cleanup();
        input.off("data", onData);
        resolve(password);
        return;
      }
      if (char === "\u007f" || char === "\b") {
        password = password.slice(0, -1);
        return;
      }
      password += char;
    });
  });
}

function required(value, name) {
  if (value === undefined || value === null || value === "") {
    throw new Error(`Missing required ${name}.`);
  }
  return value;
}

function renderTemplate(template, values) {
  return template.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_, key) => {
    if (!(key in values)) return "";
    return String(values[key]).replaceAll("\\", "\\\\").replaceAll("\"", "\\\"");
  });
}

function printHelp() {
  process.stdout.write(`HammerTech Configuration Tool

Usage:
  node ./src/cli.js auth token [--save-session]
  node ./src/cli.js auth cookie-login --url URL [--save-session]
  node ./src/cli.js users import --file users.xlsx [--sheet Users] [--apply]
  node ./src/cli.js users list
  node ./src/cli.js users get --id USER_ID
  node ./src/cli.js users create --json '{...}'
  node ./src/cli.js users update --id USER_ID --json '{...}'
  node ./src/cli.js users delete --id USER_ID
  node ./src/cli.js request METHOD PATH_OR_URL [--body-json '{...}']

Auth flags:
  --region us|au|eu
  --tenant TENANT
  --email EMAIL
  --password PASSWORD
  --token BEARER_TOKEN
  --session .hammertech/session.json

Environment:
  HAMMERTECH_REGION, HAMMERTECH_TENANT, HAMMERTECH_EMAIL,
  HAMMERTECH_PASSWORD, HAMMERTECH_BEARER_TOKEN, HAMMERTECH_SESSION_PATH

Spreadsheet imports are dry-run by default. Add --apply to change HammerTech.
`);
}
