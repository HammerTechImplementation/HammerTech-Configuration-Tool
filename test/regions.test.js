import test from "node:test";
import assert from "node:assert/strict";
import {
  buildRegionFormBody,
  executeBulkRegionUpdate,
  executeRegionCreateOperations,
  extractCsrfToken,
  normalizeRegionItem,
  parseRegionDetail,
  planRegionCreateOperations
} from "../src/regions.js";

test("planRegionCreateOperations reads region names", () => {
  const plan = planRegionCreateOperations([
    { "Region Name": "2 - Northeast" },
    { ignored: "value" }
  ]);

  assert.equal(plan.hasErrors, true);
  assert.equal(plan.operations[0].name, "2 - Northeast");
  assert.match(plan.operations[1].errors.join(" "), /Region Name/);
});

test("normalizeRegionItem accepts public API region shapes", () => {
  assert.deepEqual(normalizeRegionItem({
    RegionId: "region-1",
    Name: "Northeast",
    ParentId: "parent-1",
    IsIncludedInFilterListOnPublicSite: true
  }), {
    id: "region-1",
    name: "Northeast",
    parentId: "parent-1",
    parentName: "parent-1",
    isIncludedInFilterListOnPublicSite: true
  });
});

test("parseRegionDetail reads edit form values", () => {
  const html = `
    <input name="__RequestVerificationToken" type="hidden" value="csrf-edit">
    <input name="Name" value="California">
    <select name="ParentId">
      <option value="">No Parent</option>
      <option value="parent-1" selected>Northeast</option>
    </select>
    <input name="IsIncludedInFilterListOnPublicSite" type="checkbox" checked>
    <input name="IsIncludedInFilterListOnPublicSite" type="hidden" value="false">
  `;

  const detail = parseRegionDetail(html, "region-1");
  assert.equal(detail.id, "region-1");
  assert.equal(detail.name, "California");
  assert.equal(detail.parentId, "parent-1");
  assert.equal(detail.isIncludedInFilterListOnPublicSite, true);
  assert.equal(extractCsrfToken(html), "csrf-edit");
});

test("buildRegionFormBody posts MVC checkbox values", () => {
  const body = buildRegionFormBody({
    name: "East Coast",
    parentId: "parent-1",
    isIncludedInFilterListOnPublicSite: true
  }, {
    token: "csrf",
    hiddenFields: [{ name: "Id", value: "region-1" }]
  });

  assert.match(body, /Id=region-1/);
  assert.match(body, /Name=East\+Coast/);
  assert.match(body, /ParentId=parent-1/);
  assert.match(body, /IsIncludedInFilterListOnPublicSite=true&IsIncludedInFilterListOnPublicSite=false/);
});

test("executeRegionCreateOperations skips existing names and posts create form", async () => {
  const calls = [];
  const client = {
    async listRegions({ skip }) {
      if (skip > 0) return [];
      return [{ id: "region-1", name: "Northeast" }];
    },
    async request(method, url, options = {}) {
      const href = String(url);
      if (method === "GET" && href.endsWith("/company/Internal/Regions/Create")) {
        return `<input name="__RequestVerificationToken" value="csrf-create">`;
      }
      if (method === "POST") {
        calls.push({ method, url: href, body: options.body });
        return "";
      }
      return "";
    }
  };
  const plan = planRegionCreateOperations([
    { "Region Name": "Northeast" },
    { "Region Name": "East Coast" }
  ]);

  const results = await executeRegionCreateOperations(client, "usademo", plan.operations, {
    apply: true,
    continueOnError: true,
    globalSettings: {
      parentId: "region-1",
      isIncludedInFilterListOnPublicSite: "true"
    }
  });

  assert.deepEqual(results.map((result) => result.status), ["skipped", "success"]);
  assert.equal(calls.length, 1);
  assert.match(calls[0].body, /Name=East\+Coast/);
  assert.match(calls[0].body, /ParentId=region-1/);
});

test("executeBulkRegionUpdate preserves existing name and clears parent", async () => {
  const calls = [];
  const client = {
    async listRegions({ skip }) {
      if (skip > 0) return [];
      return [{ id: "region-1", name: "Northeast" }];
    },
    async request(method, url, options = {}) {
      const href = String(url);
      if (method === "GET" && href.includes("/Regions/Edit")) {
        return `
          <input name="__RequestVerificationToken" type="hidden" value="csrf-edit">
          <input name="Name" value="California">
          <select name="ParentId"><option value="region-1" selected>Northeast</option></select>
          <input name="IsIncludedInFilterListOnPublicSite" type="checkbox" checked>
        `;
      }
      if (method === "POST") {
        calls.push(options.body);
        return "";
      }
      return "";
    }
  };

  const results = await executeBulkRegionUpdate(client, "usademo", ["region-2"], {
    parentId: "__clear",
    isIncludedInFilterListOnPublicSite: "false"
  });

  assert.equal(results[0].status, "success");
  assert.match(calls[0], /Name=California/);
  assert.match(calls[0], /ParentId=&/);
  assert.doesNotMatch(calls[0], /IsIncludedInFilterListOnPublicSite=true/);
  assert.match(calls[0], /IsIncludedInFilterListOnPublicSite=false/);
});
