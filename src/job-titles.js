import { tenantHost } from "./checklists.js";

const JOB_TITLES_LIST_PATH = "company/Internal/JobTitles";
const JOB_TITLES_CREATE_PATH = "company/Internal/JobTitles/Create";
const JOB_TITLES_DELETE_PATH = "company/Internal/JobTitles/Delete";

const HEADER_ALIASES = {
  jobtitle: "name",
  jobtitles: "name",
  title: "name",
  name: "name"
};

export function jobTitleUrl(tenant, path = JOB_TITLES_LIST_PATH) {
  return `https://${tenantHost(tenant)}/${String(path || "").replace(/^\/+/, "")}`;
}

export async function listJobTitles(client, tenant) {
  const html = await jobTitleRequest(client, tenant, "GET", JOB_TITLES_LIST_PATH);
  return parseJobTitleList(html)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function createJobTitle(client, tenant, name) {
  const token = await getCsrfTokenForPath(client, tenant, JOB_TITLES_CREATE_PATH);
  const body = new URLSearchParams({
    __RequestVerificationToken: token,
    Name: name
  }).toString();
  return jobTitleRequest(client, tenant, "POST", JOB_TITLES_CREATE_PATH, {
    body,
    refererPath: JOB_TITLES_CREATE_PATH
  });
}

export async function deleteJobTitle(client, tenant, id) {
  const path = `${JOB_TITLES_DELETE_PATH}/${encodeURIComponent(id)}`;
  const token = await getCsrfTokenForPath(client, tenant, path);
  const body = new URLSearchParams({
    __RequestVerificationToken: token
  }).toString();
  return jobTitleRequest(client, tenant, "POST", path, {
    body,
    refererPath: path
  });
}

export function planJobTitleCreateOperations(rows) {
  const operations = rows.map((row, index) => {
    const normalized = normalizeJobTitleRow(row);
    const operation = {
      clientId: `job-title-${index + 1}`,
      rowNumber: index + 2,
      action: "create",
      name: normalized.name,
      payload: normalized.name ? { name: normalized.name } : {},
      warnings: normalized.warnings,
      errors: []
    };
    if (!normalized.name) operation.errors.push("Job Title is required.");
    return operation;
  });

  return {
    operations,
    hasErrors: operations.some((operation) => operation.errors.length > 0)
  };
}

export async function executeJobTitleCreateOperations(client, tenant, operations, {
  apply = false,
  continueOnError = false,
  skipExisting = true
} = {}) {
  const existingNames = apply && skipExisting
    ? new Set((await listJobTitles(client, tenant)).map((item) => normalizeName(item.name)))
    : new Set();
  const createdNames = new Set();
  const results = [];

  for (const operation of operations || []) {
    if (operation.errors?.length) {
      results.push({ operation, status: "invalid", errors: operation.errors });
      if (!continueOnError) break;
      continue;
    }

    if (!operation.name) {
      results.push({ operation, status: "invalid", errors: ["Job Title is required."] });
      if (!continueOnError) break;
      continue;
    }

    const key = normalizeName(operation.name);
    if (existingNames.has(key) || createdNames.has(key)) {
      results.push({ operation, status: "skipped", message: "Job title already exists." });
      continue;
    }

    if (!apply) {
      results.push({ operation, status: "planned" });
      continue;
    }

    try {
      const response = await createJobTitle(client, tenant, operation.name);
      createdNames.add(key);
      results.push({ operation, status: "success", response });
    } catch (error) {
      results.push({
        operation,
        status: "failed",
        error: error.message,
        responseBody: error.responseBody
      });
      if (!continueOnError) break;
    }
  }

  return results;
}

export function parseJobTitleList(html) {
  const results = [];
  const seen = new Set();
  const anchorPattern = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = anchorPattern.exec(String(html || "")))) {
    const attrs = match[1] || "";
    if (!/\bclass=["'][^"']*\btable-row-button\b/i.test(attrs)) continue;
    const hrefMatch = attrs.match(/\bhref=["']([^"']+)["']/i);
    const href = decodeHtml(hrefMatch?.[1] || "");
    const idMatch = href.match(/\/Details\/([^/?#]+)/i);
    const name = stripHtml(match[2]).trim();
    const id = idMatch ? decodeURIComponent(idMatch[1]) : "";
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    results.push({ id, name });
  }
  return results;
}

export function extractCsrfToken(html) {
  const match = String(html || "").match(/<input\b[^>]*name=["']__RequestVerificationToken["'][^>]*>/i);
  if (!match) return "";
  const valueMatch = match[0].match(/\bvalue=["']([^"']*)["']/i);
  return valueMatch ? decodeHtml(valueMatch[1]) : "";
}

async function getCsrfTokenForPath(client, tenant, path) {
  const html = await jobTitleRequest(client, tenant, "GET", path);
  const token = extractCsrfToken(html);
  if (!token) throw new Error(`Could not find __RequestVerificationToken on ${path}.`);
  return token;
}

function jobTitleRequest(client, tenant, method, path, { body, refererPath } = {}) {
  const headers = {
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "x-requested-with": "XMLHttpRequest"
  };
  if (body !== undefined) {
    headers["content-type"] = "application/x-www-form-urlencoded";
    headers.referer = jobTitleUrl(tenant, refererPath || path);
  }
  return client.request(method, jobTitleUrl(tenant, path), {
    body,
    bearer: false,
    cookies: true,
    headers
  });
}

function normalizeJobTitleRow(row) {
  const normalized = { name: "", warnings: [] };
  for (const [header, value] of Object.entries(row || {})) {
    const text = String(value ?? "").trim();
    if (!text) continue;
    const key = normalizeHeader(header);
    const field = HEADER_ALIASES[key];
    if (!field) {
      normalized.warnings.push(`Unmapped column "${header}" was ignored.`);
      continue;
    }
    normalized[field] = text;
  }
  return normalized;
}

function normalizeHeader(header) {
  return String(header || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeName(name) {
  return String(name || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function stripHtml(html) {
  return decodeHtml(String(html || "").replace(/<[^>]*>/g, " "));
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&quot;/g, "\"")
    .replace(/&#039;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
