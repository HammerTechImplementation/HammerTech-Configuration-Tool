import { tenantHost } from "./checklists.js";

const REGIONS_LIST_PATH = "company/Internal/Regions";
const REGIONS_CREATE_PATH = "company/Internal/Regions/Create";
const REGIONS_EDIT_PATH = "company/Internal/Regions/Edit";
const REGIONS_DELETE_PATH = "company/Internal/Regions/Delete";

const HEADER_ALIASES = {
  region: "name",
  regionname: "name",
  name: "name"
};

const SETTING_ALIASES = {
  parent: "parentId",
  parentid: "parentId",
  parentregion: "parentId",
  parentregionid: "parentId",
  showregionasfilter: "isIncludedInFilterListOnPublicSite",
  showasfilter: "isIncludedInFilterListOnPublicSite",
  isshownasfilter: "isIncludedInFilterListOnPublicSite",
  isincludedinfilterlistonpublicsite: "isIncludedInFilterListOnPublicSite"
};

export function regionUrl(tenant, path = REGIONS_LIST_PATH) {
  return `https://${tenantHost(tenant)}/${String(path || "").replace(/^\/+/, "")}`;
}

export async function listAllRegions(client, query = {}) {
  const all = [];
  const take = Math.min(Number(query.take || 100), 100);
  let skip = Number(query.skip || 0);

  for (let page = 0; page < 1000; page += 1) {
    const response = await client.listRegions({
      ...query,
      skip,
      take
    });
    const items = extractRegionItems(response);
    all.push(...items.map(normalizeRegionItem).filter((item) => item.id || item.name));
    if (items.length < take || reachedTotal(response, skip, items.length)) break;
    skip += take;
  }

  return dedupeRegions(all)
    .sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));
}

export async function getRegion(client, tenant, id) {
  const html = await regionRequest(client, tenant, "GET", `${REGIONS_EDIT_PATH}/${encodeURIComponent(id)}`);
  return parseRegionDetail(html, id);
}

export async function createRegion(client, tenant, settings) {
  const html = await regionRequest(client, tenant, "GET", REGIONS_CREATE_PATH);
  const form = parseRegionFormContext(html);
  const payload = buildRegionPayload(settings);
  const body = buildRegionFormBody(payload, form);
  return regionRequest(client, tenant, "POST", REGIONS_CREATE_PATH, {
    body,
    refererPath: REGIONS_CREATE_PATH
  });
}

export async function updateRegion(client, tenant, id, settings, regions = []) {
  const existing = await getRegion(client, tenant, id);
  const payload = buildRegionPayload({
    ...existing,
    ...normalizeRegionSettings(settings, regions)
  });
  const body = buildRegionFormBody(payload, existing.form);
  return regionRequest(client, tenant, "POST", `${REGIONS_EDIT_PATH}/${encodeURIComponent(id)}`, {
    body,
    refererPath: `${REGIONS_EDIT_PATH}/${encodeURIComponent(id)}`
  });
}

export async function deleteRegion(client, tenant, id) {
  const path = `${REGIONS_DELETE_PATH}/${encodeURIComponent(id)}`;
  const html = await regionRequest(client, tenant, "GET", path);
  const token = extractCsrfToken(html);
  if (!token) throw new Error(`Could not find __RequestVerificationToken on ${path}.`);
  const body = new URLSearchParams({ __RequestVerificationToken: token }).toString();
  return regionRequest(client, tenant, "POST", path, {
    body,
    refererPath: path
  });
}

export function planRegionCreateOperations(rows) {
  const operations = rows.map((row, index) => {
    const normalized = normalizeRegionRow(row);
    const operation = {
      clientId: `region-${index + 1}`,
      rowNumber: index + 2,
      action: "create",
      name: normalized.name,
      payload: normalized.name ? { name: normalized.name } : {},
      warnings: normalized.warnings,
      errors: []
    };
    if (!normalized.name) operation.errors.push("Region Name is required.");
    return operation;
  });

  return {
    operations,
    hasErrors: operations.some((operation) => operation.errors.length > 0)
  };
}

export async function executeRegionCreateOperations(client, tenant, operations, {
  apply = false,
  continueOnError = false,
  globalSettings = {},
  regionSettings = {},
  skipExisting = true
} = {}) {
  const existingRegions = apply ? await listAllRegions(client) : [];
  const existingNames = apply && skipExisting
    ? new Set(existingRegions.map((item) => normalizeName(item.name)))
    : new Set();
  const createdNames = new Set();
  const results = [];

  for (const operation of operations || []) {
    const settings = {
      ...(globalSettings || {}),
      ...(regionSettings?.[operation.clientId] || {})
    };
    const payload = buildRegionPayload({
      name: operation.name || operation.payload?.name,
      ...normalizeRegionSettings(settings, existingRegions)
    });
    const errors = [...(operation.errors || [])];
    if (!payload.name) errors.push("Region Name is required.");
    const operationWithPayload = {
      ...operation,
      name: payload.name,
      payload,
      errors
    };

    if (errors.length) {
      results.push({ operation: operationWithPayload, status: "invalid", errors });
      if (!continueOnError) break;
      continue;
    }

    const key = normalizeName(payload.name);
    if (existingNames.has(key) || createdNames.has(key)) {
      results.push({ operation: operationWithPayload, status: "skipped", message: "Region already exists." });
      continue;
    }

    if (!apply) {
      results.push({ operation: operationWithPayload, status: "planned" });
      continue;
    }

    try {
      const response = await createRegion(client, tenant, payload);
      createdNames.add(key);
      results.push({ operation: operationWithPayload, status: "success", response });
    } catch (error) {
      results.push({
        operation: operationWithPayload,
        status: "failed",
        error: error.message,
        responseBody: error.responseBody
      });
      if (!continueOnError) break;
    }
  }

  return results;
}

export async function executeBulkRegionUpdate(client, tenant, ids, settings, {
  continueOnError = false
} = {}) {
  const regions = await listAllRegions(client);
  const payload = normalizeRegionSettings(settings, regions);
  const appliedFields = Object.keys(payload);
  if (!appliedFields.length) throw new Error("Choose at least one region setting to update.");

  const results = [];
  for (const id of ids || []) {
    try {
      const response = await updateRegion(client, tenant, id, payload, regions);
      results.push({ id, status: "success", appliedFields, response });
    } catch (error) {
      results.push({
        id,
        status: "failed",
        appliedFields,
        error: error.message,
        responseBody: error.responseBody
      });
      if (!continueOnError) break;
    }
  }
  return results;
}

export function normalizeRegionSettings(settings = {}, regions = []) {
  const normalized = {};
  for (const [rawKey, rawValue] of Object.entries(settings || {})) {
    const key = SETTING_ALIASES[normalizeHeader(rawKey)] || rawKey;
    const value = stringValue(rawValue);

    if (key === "parentId") {
      if (value === "") {
        normalized.parentId = "";
        continue;
      }
      normalized.parentId = resolveRegionId(value, regions, { allowClear: true });
      continue;
    }

    if (key === "isIncludedInFilterListOnPublicSite") {
      if (value === "") continue;
      normalized.isIncludedInFilterListOnPublicSite = Boolean(coerceBoolean(value));
    }
  }
  return normalized;
}

export function parseRegionDetail(html, id = "") {
  const form = parseRegionFormContext(html);
  const parentOptions = parseSelectOptions(html, "ParentId");
  const selectedParent = parentOptions.find((option) => option.selected) || {};
  return {
    id,
    name: inputValue(html, "Name"),
    parentId: selectedParent.value || inputValue(html, "ParentId") || "",
    isIncludedInFilterListOnPublicSite: inputChecked(html, "IsIncludedInFilterListOnPublicSite"),
    form
  };
}

export function extractCsrfToken(html) {
  const inputs = parseInputElements(html);
  const token = inputs.find((input) => input.name === "__RequestVerificationToken");
  return token ? decodeHtml(token.value || "") : "";
}

export function buildRegionFormBody(payload, form = {}) {
  const token = form.token || "";
  if (!token) throw new Error("Could not find __RequestVerificationToken on region form.");

  const params = new URLSearchParams();
  const explicitFields = new Set([
    "__RequestVerificationToken",
    "Name",
    "ParentId",
    "IsIncludedInFilterListOnPublicSite"
  ]);

  for (const hidden of form.hiddenFields || []) {
    if (!hidden.name || explicitFields.has(hidden.name)) continue;
    params.append(hidden.name, hidden.value || "");
  }

  params.append("__RequestVerificationToken", token);
  params.append("Name", payload.name || "");
  params.append("ParentId", payload.parentId || "");
  if (payload.isIncludedInFilterListOnPublicSite) {
    params.append("IsIncludedInFilterListOnPublicSite", "true");
  }
  params.append("IsIncludedInFilterListOnPublicSite", "false");
  return params.toString();
}

export function normalizeRegionItem(item = {}) {
  const id = stringValue(
    item.id || item.Id || item.regionId || item.RegionId || item.regionID || item.RegionID || item.value || item.Value
  );
  const parent = item.parent || item.Parent || {};
  const parentId = stringValue(
    item.parentId || item.ParentId || item.parentRegionId || item.ParentRegionId || parent.id || parent.Id
  );
  const included = item.isIncludedInFilterListOnPublicSite
    ?? item.IsIncludedInFilterListOnPublicSite
    ?? item.showRegionAsFilter
    ?? item.ShowRegionAsFilter
    ?? item.isShownAsFilter
    ?? item.IsShownAsFilter;

  return {
    id,
    name: stringValue(item.name || item.Name || item.regionName || item.RegionName || item.displayName || item.DisplayName || id),
    parentId,
    parentName: stringValue(
      item.parentName || item.ParentName || item.parentRegionName || item.ParentRegionName || parent.name || parent.Name || parentId
    ),
    isIncludedInFilterListOnPublicSite: included === undefined || included === null || included === ""
      ? null
      : Boolean(coerceBoolean(included))
  };
}

function buildRegionPayload(source = {}) {
  return {
    name: stringValue(source.name || source.Name),
    parentId: source.parentId === undefined || source.parentId === null
      ? ""
      : stringValue(source.parentId),
    isIncludedInFilterListOnPublicSite: Boolean(coerceBoolean(source.isIncludedInFilterListOnPublicSite))
  };
}

function parseRegionFormContext(html) {
  const hiddenFields = parseInputElements(html)
    .filter((input) => String(input.type || "").toLowerCase() === "hidden")
    .map((input) => ({ name: input.name || "", value: input.value || "" }))
    .filter((input) => input.name);
  return {
    token: extractCsrfToken(html),
    hiddenFields
  };
}

function normalizeRegionRow(row) {
  const normalized = { name: "", warnings: [] };
  for (const [header, value] of Object.entries(row || {})) {
    const text = stringValue(value);
    if (!text) continue;
    const field = HEADER_ALIASES[normalizeHeader(header)];
    if (!field) {
      normalized.warnings.push(`Unmapped column "${header}" was ignored.`);
      continue;
    }
    normalized[field] = text;
  }
  return normalized;
}

function regionRequest(client, tenant, method, path, { body, refererPath } = {}) {
  const headers = {
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "x-requested-with": "XMLHttpRequest"
  };
  if (body !== undefined) {
    headers["content-type"] = "application/x-www-form-urlencoded";
    headers.referer = regionUrl(tenant, refererPath || path);
  }
  return client.request(method, regionUrl(tenant, path), {
    body,
    bearer: false,
    cookies: true,
    headers
  });
}

function extractRegionItems(response) {
  if (Array.isArray(response)) return response;
  for (const key of ["regions", "Regions", "items", "Items", "data", "Data", "results", "Results"]) {
    if (Array.isArray(response?.[key])) return response[key];
  }
  return [];
}

function reachedTotal(response, skip, length) {
  const total = Number(response?.total || response?.Total || response?.totalCount || response?.TotalCount || NaN);
  return Number.isFinite(total) && skip + length >= total;
}

function dedupeRegions(items) {
  const seen = new Set();
  const results = [];
  for (const item of items) {
    const key = item.id || normalizeName(item.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    results.push(item);
  }
  return results;
}

function resolveRegionId(value, regions = [], { allowClear = false } = {}) {
  const text = stringValue(value);
  if (!text) return "";
  if (allowClear && text === "__clear") return "";
  const normalized = normalizeName(text);
  const match = (regions || []).find((region) => {
    return normalizeName(region.id) === normalized || normalizeName(region.name) === normalized;
  });
  return match ? match.id : text;
}

function parseInputElements(html) {
  const inputs = [];
  const inputPattern = /<input\b([^>]*)>/gi;
  let match;
  while ((match = inputPattern.exec(String(html || "")))) {
    inputs.push(parseAttrs(match[1] || ""));
  }
  return inputs;
}

function inputValue(html, name) {
  const input = parseInputElements(html).find((item) => {
    const type = String(item.type || "").toLowerCase();
    return item.name === name && type !== "checkbox";
  });
  return input ? decodeHtml(input.value || "") : "";
}

function inputChecked(html, name) {
  return parseInputElements(html).some((item) => {
    return item.name === name && String(item.type || "").toLowerCase() === "checkbox" && item.checked !== undefined;
  });
}

function parseSelectOptions(html, selectName) {
  const selectPattern = /<select\b([^>]*)>([\s\S]*?)<\/select>/gi;
  let selectMatch;
  while ((selectMatch = selectPattern.exec(String(html || "")))) {
    const attrs = parseAttrs(selectMatch[1] || "");
    if (attrs.name !== selectName) continue;
    const options = [];
    const optionPattern = /<option\b([^>]*)>([\s\S]*?)<\/option>/gi;
    let optionMatch;
    while ((optionMatch = optionPattern.exec(selectMatch[2] || ""))) {
      const optionAttrs = parseAttrs(optionMatch[1] || "");
      options.push({
        value: decodeHtml(optionAttrs.value || ""),
        label: stripHtml(optionMatch[2]).trim(),
        selected: optionAttrs.selected !== undefined
      });
    }
    return options;
  }
  return [];
}

function parseAttrs(source) {
  const attrs = {};
  const attrPattern = /([:\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match;
  while ((match = attrPattern.exec(String(source || "")))) {
    const name = match[1];
    const value = match[2] ?? match[3] ?? match[4] ?? "";
    attrs[name] = decodeHtml(value);
  }
  return attrs;
}

function coerceBoolean(value) {
  if (typeof value === "boolean") return value;
  if (value === null || value === undefined) return false;
  const text = normalizeName(value);
  if (["true", "yes", "y", "1", "on", "checked"].includes(text)) return true;
  if (["false", "no", "n", "0", "off", "unchecked"].includes(text)) return false;
  return Boolean(text);
}

function normalizeHeader(header) {
  return String(header || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeName(name) {
  return String(name || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function stringValue(value) {
  return String(value ?? "").trim();
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
