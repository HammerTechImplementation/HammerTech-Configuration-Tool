import test from "node:test";
import assert from "node:assert/strict";
import {
  executeJobTitleCreateOperations,
  extractCsrfToken,
  parseJobTitleList,
  planJobTitleCreateOperations
} from "../src/job-titles.js";

test("parseJobTitleList scrapes MVC table rows", () => {
  const html = `
    <a class="table-row-button" href="/company/Internal/JobTitles/Details/abc-1">Safety Manager</a>
    <a class="table-row-button other" href="/company/Internal/JobTitles/Details/abc-2">Foreman &amp; Lead</a>
    <a href="/company/Internal/JobTitles/Details/abc-3" class="other table-row-button">Site Supervisor</a>
  `;

  assert.deepEqual(parseJobTitleList(html), [
    { id: "abc-1", name: "Safety Manager" },
    { id: "abc-2", name: "Foreman & Lead" },
    { id: "abc-3", name: "Site Supervisor" }
  ]);
});

test("extractCsrfToken reads MVC anti-forgery token", () => {
  const html = `<input name="__RequestVerificationToken" type="hidden" value="token-123">`;
  assert.equal(extractCsrfToken(html), "token-123");
});

test("planJobTitleCreateOperations reads spreadsheet rows", () => {
  const plan = planJobTitleCreateOperations([
    { "Job Title": "Safety Manager" },
    { ignored: "value" }
  ]);

  assert.equal(plan.hasErrors, true);
  assert.equal(plan.operations[0].name, "Safety Manager");
  assert.match(plan.operations[1].errors.join(" "), /Job Title/);
});

test("executeJobTitleCreateOperations skips existing titles", async () => {
  const calls = [];
  const client = {
    async request(method, url, options = {}) {
      if (method === "GET" && url.includes("/JobTitles/Create")) {
        return `<input name="__RequestVerificationToken" value="csrf">`;
      }
      if (method === "GET") {
        return `<a class="table-row-button" href="/company/Internal/JobTitles/Details/existing">Safety Manager</a>`;
      }
      calls.push({ method, url, body: options.body });
      return "";
    }
  };
  const plan = planJobTitleCreateOperations([
    { "Job Title": "Safety Manager" },
    { "Job Title": "Superintendent" }
  ]);

  const results = await executeJobTitleCreateOperations(client, "usademo", plan.operations, {
    apply: true,
    continueOnError: true
  });

  assert.deepEqual(results.map((result) => result.status), ["skipped", "success"]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, "POST");
  assert.match(calls[0].body, /Name=Superintendent/);
});
