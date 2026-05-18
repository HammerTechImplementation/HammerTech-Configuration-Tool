import test from "node:test";
import assert from "node:assert/strict";
import {
  executeBulkLicenseTypeUpdate,
  executeLicenseTypeCreateOperations,
  extractCsrfToken,
  parseLicenseCategories,
  parseLicenseDetail,
  parseLicenseTypeList,
  planLicenseTypeCreateOperations
} from "../src/license-types.js";

const categoryHtml = `
  <input name="__RequestVerificationToken" type="hidden" value="csrf-create">
  <select name="Category">
    <option value="0">No Category</option>
    <option value="1">Training</option>
  </select>
`;

test("parseLicenseTypeList groups MVC table row links", () => {
  const html = `
    <a class="table-row-button" href="/company/Internal/Licenses/Edit/11111111-1111-1111-1111-111111111111">Training</a>
    <a class="table-row-button" href="/company/Internal/Licenses/Edit/11111111-1111-1111-1111-111111111111">Crane Operator</a>
    <a class="table-row-button" href="/company/Internal/Licenses/Edit/11111111-1111-1111-1111-111111111111">CRANE</a>
    <a class="table-row-button" href="/company/Internal/Licenses/Edit/11111111-1111-1111-1111-111111111111">Yes</a>
    <a class="table-row-button" href="/company/Internal/Licenses/Edit/11111111-1111-1111-1111-111111111111">No</a>
  `;

  assert.deepEqual(parseLicenseTypeList(html), [{
    id: "11111111-1111-1111-1111-111111111111",
    categoryName: "Training",
    name: "Crane Operator",
    code: "CRANE",
    IsPriority: true,
    IsCompulsoryForInduction: false
  }]);
});

test("parseLicenseCategories reads Category select options", () => {
  assert.deepEqual(parseLicenseCategories(categoryHtml), [
    { value: "0", label: "No Category" },
    { value: "1", label: "Training" }
  ]);
});

test("parseLicenseDetail reads edit form values", () => {
  const html = `
    <input name="__RequestVerificationToken" type="hidden" value="csrf-edit">
    <input name="Name" value="First Aid">
    <input name="Code" value="FIRSTAID">
    <select name="Category">
      <option value="0">No Category</option>
      <option value="1" selected>Training</option>
    </select>
    <input name="HasExpiryDate" type="checkbox" checked>
    <input name="HasIssueDate" type="checkbox">
  `;

  const detail = parseLicenseDetail(html, "abc");
  assert.equal(detail.id, "abc");
  assert.equal(detail.Name, "First Aid");
  assert.equal(detail.Code, "FIRSTAID");
  assert.equal(detail.Category, "1");
  assert.equal(detail.categoryName, "Training");
  assert.equal(detail.HasExpiryDate, true);
  assert.equal(detail.HasIssueDate, false);
  assert.equal(extractCsrfToken(html), "csrf-edit");
});

test("planLicenseTypeCreateOperations maps spreadsheet aliases", () => {
  const plan = planLicenseTypeCreateOperations([
    {
      "License Type Name": "Crane Operator",
      Code: "CRANE",
      Category: "Training",
      "Has Expiry Date": "Yes",
      "File Upload Required": "No"
    },
    { Code: "MISSING" }
  ]);

  assert.equal(plan.hasErrors, true);
  assert.equal(plan.operations[0].payload.Name, "Crane Operator");
  assert.equal(plan.operations[0].payload.HasExpiryDate, true);
  assert.equal(plan.operations[0].payload.IsFileUploadRequired, false);
  assert.match(plan.operations[1].errors.join(" "), /License Type Name/);
});

test("executeLicenseTypeCreateOperations skips existing names and posts MVC checkbox values", async () => {
  const calls = [];
  const client = {
    async request(method, url, options = {}) {
      const href = String(url);
      if (method === "GET" && href.endsWith("/company/Internal/Licenses")) {
        return `<a class="table-row-button" href="/company/Internal/Licenses/Edit/11111111-1111-1111-1111-111111111111">Training</a>
          <a class="table-row-button" href="/company/Internal/Licenses/Edit/11111111-1111-1111-1111-111111111111">Crane Operator</a>`;
      }
      if (method === "GET" && href.includes("/Licenses/Create")) return categoryHtml;
      if (method === "POST") {
        calls.push({ url: href, body: options.body });
        return "";
      }
      return "";
    }
  };
  const plan = planLicenseTypeCreateOperations([
    { "License Type Name": "Crane Operator" },
    { "License Type Name": "First Aid", Category: "Training", "Has Expiry Date": "Yes" }
  ]);

  const results = await executeLicenseTypeCreateOperations(client, "usademo", plan.operations, {
    apply: true,
    continueOnError: true
  });

  assert.deepEqual(results.map((result) => result.status), ["skipped", "success"]);
  assert.equal(calls.length, 1);
  assert.match(calls[0].body, /Name=First\+Aid/);
  assert.match(calls[0].body, /Category=1/);
  assert.match(calls[0].body, /HasExpiryDate=true&HasExpiryDate=false/);
});

test("executeBulkLicenseTypeUpdate preserves existing values and applies selected settings", async () => {
  const calls = [];
  const client = {
    async request(method, url, options = {}) {
      const href = String(url);
      if (method === "GET" && href.includes("/Licenses/Create")) return categoryHtml;
      if (method === "GET" && href.includes("/Licenses/Edit")) {
        return `
          <input name="__RequestVerificationToken" type="hidden" value="csrf-edit">
          <input name="Name" value="First Aid">
          <input name="Code" value="FIRSTAID">
          <select name="Category"><option value="0">No Category</option><option value="1" selected>Training</option></select>
          <input name="HasIssueDate" type="checkbox" checked>
        `;
      }
      if (method === "POST") {
        calls.push(options.body);
        return "";
      }
      return "";
    }
  };

  const results = await executeBulkLicenseTypeUpdate(client, "usademo", ["abc"], {
    HasExpiryDate: "true",
    HasIssueDate: "false"
  });

  assert.equal(results[0].status, "success");
  assert.match(calls[0], /Name=First\+Aid/);
  assert.match(calls[0], /HasExpiryDate=true&HasExpiryDate=false/);
  assert.doesNotMatch(calls[0], /HasIssueDate=true/);
  assert.match(calls[0], /HasIssueDate=false/);
});
