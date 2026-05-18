import { tenantHost } from "./checklists.js";

const LICENSE_TYPES_LIST_PATH = "company/Internal/Licenses";
const LICENSE_TYPES_CREATE_PATH = "company/Internal/Licenses/Create";
const LICENSE_TYPES_EDIT_PATH = "company/Internal/Licenses/Edit";
const LICENSE_TYPES_DELETE_PATH = "company/Internal/Licenses/Delete";

export const LICENSE_CHECKBOX_FIELDS = [
  "IsPriority",
  "IsCompulsoryForInduction",
  "HasExpiryDate",
  "HasIssueDate",
  "HasRefreshmentDate",
  "HasIssuer",
  "HasLicenseNo",
  "HasLicensePhoto",
  "IsLicenceFrontPhotoMandatory",
  "IsLicenceBackPhotoMandatory",
  "IsFileUploadEnabled",
  "IsFileUploadRequired"
];

const HEADER_ALIASES = {
  licensetype: "Name",
  licensetypename: "Name",
  license: "Name",
  licensename: "Name",
  name: "Name",
  code: "Code",
  category: "Category",
  categoryid: "Category",
  categoryname: "Category",
  ispriority: "IsPriority",
  priority: "IsPriority",
  compulsoryforinduction: "IsCompulsoryForInduction",
  iscompulsoryforinduction: "IsCompulsoryForInduction",
  requiredforinduction: "IsCompulsoryForInduction",
  inductionrequired: "IsCompulsoryForInduction",
  hasexpirydate: "HasExpiryDate",
  expirydate: "HasExpiryDate",
  expiry: "HasExpiryDate",
  hasissuedate: "HasIssueDate",
  issuedate: "HasIssueDate",
  hasrefreshmentdate: "HasRefreshmentDate",
  refreshmentdate: "HasRefreshmentDate",
  refresherdate: "HasRefreshmentDate",
  hasissuer: "HasIssuer",
  issuer: "HasIssuer",
  haslicenseno: "HasLicenseNo",
  licenseno: "HasLicenseNo",
  licensenumber: "HasLicenseNo",
  haslicensenumber: "HasLicenseNo",
  haslicensephoto: "HasLicensePhoto",
  licensephoto: "HasLicensePhoto",
  photorequired: "HasLicensePhoto",
  islicencefrontphotomandatory: "IsLicenceFrontPhotoMandatory",
  islicensefrontphotomandatory: "IsLicenceFrontPhotoMandatory",
  frontphotomandatory: "IsLicenceFrontPhotoMandatory",
  islicencebackphotomandatory: "IsLicenceBackPhotoMandatory",
  islicensebackphotomandatory: "IsLicenceBackPhotoMandatory",
  backphotomandatory: "IsLicenceBackPhotoMandatory",
  isfileuploadenabled: "IsFileUploadEnabled",
  fileuploadenabled: "IsFileUploadEnabled",
  allowfileupload: "IsFileUploadEnabled",
  isfileuploadrequired: "IsFileUploadRequired",
  fileuploadrequired: "IsFileUploadRequired",
  filerequired: "IsFileUploadRequired"
};

const BOOLEAN_FIELDS = new Set(LICENSE_CHECKBOX_FIELDS);

export function licenseTypeUrl(tenant, path = LICENSE_TYPES_LIST_PATH) {
  return `https://${tenantHost(tenant)}/${String(path || "").replace(/^\/+/, "")}`;
}

export async function listLicenseTypes(client, tenant) {
  const html = await licenseTypeRequest(client, tenant, "GET", LICENSE_TYPES_LIST_PATH);
  return parseLicenseTypeList(html)
    .sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));
}

export async function listLicenseCategories(client, tenant) {
  const html = await licenseTypeRequest(client, tenant, "GET", LICENSE_TYPES_CREATE_PATH);
  return parseLicenseCategories(html)
    .sort((a, b) => (a.label || a.value).localeCompare(b.label || b.value));
}

export async function getLicenseType(client, tenant, id) {
  const html = await licenseTypeRequest(client, tenant, "GET", `${LICENSE_TYPES_EDIT_PATH}/${encodeURIComponent(id)}`);
  return parseLicenseDetail(html, id);
}

export async function createLicenseType(client, tenant, payload) {
  const html = await licenseTypeRequest(client, tenant, "GET", LICENSE_TYPES_CREATE_PATH);
  const form = parseLicenseFormContext(html);
  const body = buildLicenseTypeFormBody(buildLicenseTypePayload(payload), form);
  return licenseTypeRequest(client, tenant, "POST", LICENSE_TYPES_CREATE_PATH, {
    body,
    refererPath: LICENSE_TYPES_CREATE_PATH
  });
}

export async function updateLicenseType(client, tenant, id, settings) {
  const existing = await getLicenseType(client, tenant, id);
  const payload = buildLicenseTypePayload({
    ...existing,
    ...normalizeLicenseTypePatchPayload(settings)
  });
  const body = buildLicenseTypeFormBody(payload, existing.form);
  return licenseTypeRequest(client, tenant, "POST", `${LICENSE_TYPES_EDIT_PATH}/${encodeURIComponent(id)}`, {
    body,
    refererPath: `${LICENSE_TYPES_EDIT_PATH}/${encodeURIComponent(id)}`
  });
}

export async function deleteLicenseType(client, tenant, id) {
  const path = `${LICENSE_TYPES_DELETE_PATH}/${encodeURIComponent(id)}`;
  const html = await licenseTypeRequest(client, tenant, "GET", path);
  const token = extractCsrfToken(html);
  if (!token) throw new Error(`Could not find __RequestVerificationToken on ${path}.`);
  const body = new URLSearchParams({ __RequestVerificationToken: token }).toString();
  return licenseTypeRequest(client, tenant, "POST", path, {
    body,
    refererPath: path
  });
}

export function planLicenseTypeCreateOperations(rows) {
  const operations = rows.map((row, index) => {
    const normalized = normalizeLicenseTypeRow(row);
    const operation = {
      clientId: `license-type-${index + 1}`,
      rowNumber: index + 2,
      action: "create",
      name: normalized.payload.Name || "",
      payload: normalized.payload,
      warnings: normalized.warnings,
      errors: []
    };
    if (!operation.name) operation.errors.push("License Type Name is required.");
    return operation;
  });

  return {
    operations,
    hasErrors: operations.some((operation) => operation.errors.length > 0)
  };
}

export async function executeLicenseTypeCreateOperations(client, tenant, operations, {
  apply = false,
  continueOnError = false,
  skipExisting = true
} = {}) {
  const existingNames = apply && skipExisting
    ? new Set((await listLicenseTypes(client, tenant)).map((item) => normalizeName(item.name)))
    : new Set();
  const categories = apply ? await listLicenseCategories(client, tenant) : [];
  const createdNames = new Set();
  const results = [];

  for (const operation of operations || []) {
    const payload = buildLicenseTypePayload(operation.payload, categories);
    const errors = [...(operation.errors || [])];
    if (!payload.Name) errors.push("License Type Name is required.");
    const operationWithPayload = { ...operation, name: payload.Name, payload, errors };

    if (errors.length) {
      results.push({ operation: operationWithPayload, status: "invalid", errors });
      if (!continueOnError) break;
      continue;
    }

    const key = normalizeName(payload.Name);
    if (existingNames.has(key) || createdNames.has(key)) {
      results.push({ operation: operationWithPayload, status: "skipped", message: "License type already exists." });
      continue;
    }

    if (!apply) {
      results.push({ operation: operationWithPayload, status: "planned" });
      continue;
    }

    try {
      const response = await createLicenseType(client, tenant, payload);
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

export async function executeBulkLicenseTypeUpdate(client, tenant, ids, settings, {
  continueOnError = false
} = {}) {
  const categories = await listLicenseCategories(client, tenant);
  const payload = normalizeLicenseTypePatchPayload(settings, categories);
  const appliedFields = Object.keys(payload);
  if (!appliedFields.length) throw new Error("Choose at least one license type setting to update.");

  const results = [];
  for (const id of ids || []) {
    try {
      const response = await updateLicenseType(client, tenant, id, payload);
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

export function normalizeLicenseTypePatchPayload(settings = {}, categories = []) {
  const payload = {};
  for (const [rawKey, rawValue] of Object.entries(settings || {})) {
    const key = HEADER_ALIASES[normalizeHeader(rawKey)] || rawKey;
    const value = stringValue(rawValue);
    if (value === "") continue;

    if (key === "Category") {
      payload.Category = resolveCategoryValue(value, categories, { defaultValue: "0" });
      continue;
    }
    if (key === "Code") {
      payload.Code = value;
      continue;
    }
    if (key === "Name") {
      payload.Name = value;
      continue;
    }
    if (BOOLEAN_FIELDS.has(key)) {
      payload[key] = Boolean(coerceBoolean(value));
    }
  }
  return payload;
}

export function parseLicenseTypeList(html) {
  const grouped = new Map();
  const order = [];
  const anchorPattern = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = anchorPattern.exec(String(html || "")))) {
    const attrs = parseAttrs(match[1] || "");
    const className = stringValue(attrs.class);
    if (!/\btable-row-button\b/i.test(className)) continue;
    const href = decodeHtml(attrs.href || "");
    const idMatch = href.match(/\/([0-9a-fA-F-]{36})(?:[/?#].*)?$/);
    if (!idMatch) continue;
    const id = idMatch[1];
    const text = stripHtml(match[2]).trim();
    if (!grouped.has(id)) {
      grouped.set(id, []);
      order.push(id);
    }
    if (text) grouped.get(id).push(text);
  }

  return order.map((id) => {
    const texts = grouped.get(id) || [];
    const item = {
      id,
      categoryName: texts[0] || "",
      name: texts[1] || texts[0] || id,
      code: texts[2] || ""
    };
    LICENSE_CHECKBOX_FIELDS.forEach((field, index) => {
      if (texts[index + 3] !== undefined) item[field] = Boolean(coerceBoolean(texts[index + 3]));
    });
    return item;
  }).filter((item) => item.id && item.name);
}

export function parseLicenseCategories(html) {
  return parseSelectOptions(html, "Category")
    .map((option) => ({
      value: option.value,
      label: option.label
    }))
    .filter((option) => option.value !== "" || option.label);
}

export function parseLicenseDetail(html, id = "") {
  const form = parseLicenseFormContext(html);
  const categoryOptions = parseSelectOptions(html, "Category");
  const selectedCategory = categoryOptions.find((option) => option.selected) || categoryOptions[0] || {};
  const detail = {
    id,
    Name: inputValue(html, "Name"),
    Code: inputValue(html, "Code"),
    Category: selectedCategory.value || "0",
    categoryName: selectedCategory.label || "",
    form
  };
  for (const field of LICENSE_CHECKBOX_FIELDS) detail[field] = inputChecked(html, field);
  return detail;
}

export function extractCsrfToken(html) {
  const inputs = parseInputElements(html);
  const token = inputs.find((input) => input.name === "__RequestVerificationToken");
  return token ? decodeHtml(token.value || "") : "";
}

function parseLicenseFormContext(html) {
  const hiddenFields = parseInputElements(html)
    .filter((input) => String(input.type || "").toLowerCase() === "hidden")
    .map((input) => ({ name: input.name || "", value: input.value || "" }))
    .filter((input) => input.name);
  return {
    token: extractCsrfToken(html),
    hiddenFields
  };
}

function buildLicenseTypePayload(source = {}, categories = []) {
  const payload = {
    Category: resolveCategoryValue(source.Category, categories, { defaultValue: "0" }),
    Name: stringValue(source.Name || source.name),
    Code: stringValue(source.Code || source.code)
  };
  for (const field of LICENSE_CHECKBOX_FIELDS) payload[field] = Boolean(coerceBoolean(source[field]));
  return payload;
}

function buildLicenseTypeFormBody(payload, form = {}) {
  const token = form.token || "";
  if (!token) throw new Error("Could not find __RequestVerificationToken on license type form.");
  const params = new URLSearchParams();
  const explicitFields = new Set(["__RequestVerificationToken", "Category", "Name", "Code", ...LICENSE_CHECKBOX_FIELDS]);

  for (const hidden of form.hiddenFields || []) {
    if (!hidden.name || explicitFields.has(hidden.name)) continue;
    params.append(hidden.name, hidden.value || "");
  }

  params.append("__RequestVerificationToken", token);
  params.append("Category", payload.Category || "0");
  params.append("Name", payload.Name || "");
  params.append("Code", payload.Code || "");
  for (const field of LICENSE_CHECKBOX_FIELDS) {
    if (payload[field]) params.append(field, "true");
    params.append(field, "false");
  }
  return params.toString();
}

function licenseTypeRequest(client, tenant, method, path, { body, refererPath } = {}) {
  const headers = {
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "x-requested-with": "XMLHttpRequest"
  };
  if (body !== undefined) {
    headers["content-type"] = "application/x-www-form-urlencoded";
    headers.referer = licenseTypeUrl(tenant, refererPath || path);
  }
  return client.request(method, licenseTypeUrl(tenant, path), {
    body,
    bearer: false,
    cookies: true,
    headers
  });
}

function normalizeLicenseTypeRow(row) {
  const payload = {};
  const warnings = [];
  for (const [header, value] of Object.entries(row || {})) {
    const text = stringValue(value);
    if (!text) continue;
    const key = normalizeHeader(header);
    const field = HEADER_ALIASES[key];
    if (!field) {
      warnings.push(`Unmapped column "${header}" was ignored.`);
      continue;
    }
    payload[field] = BOOLEAN_FIELDS.has(field) ? Boolean(coerceBoolean(text)) : text;
  }
  return { payload, warnings };
}

function resolveCategoryValue(value, categories = [], { defaultValue = "" } = {}) {
  const text = stringValue(value);
  if (!text) return defaultValue;
  if (text === "__clear") return "0";
  const normalized = normalizeName(text);
  const matched = (categories || []).find((category) => {
    return normalizeName(category.value) === normalized || normalizeName(category.label) === normalized;
  });
  return matched ? matched.value : text;
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
