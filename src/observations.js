import { tenantHost } from "./checklists.js";

const OBSERVATION_TYPES_PATH = "company/api/ObservationTypes";
const OBSERVATION_TYPES_CREATE_PATH = "company/api/ObservationTypes/Create";
const OBSERVATION_TYPES_EDIT_PATH = "company/api/ObservationTypes/Edit";
const OBSERVATION_PAGE_SIZE = 50;

const CLASSIFICATIONS = new Set(["Negative", "Neutral", "Positive"]);
const CAN_RAISE_IN = new Set([
  "ObservationsModule",
  "Incidents",
  "Meetings",
  "CustomSections",
  "PreTaskPlans",
  "SiteDiary"
]);
const WHO_CAN_CREATE = new Set(["Employers", "Workers"]);
const PRIORITIES = new Set(["low", "medium", "high", "critical"]);

const CAN_RAISE_IN_MAP = {
  0: "ObservationsModule",
  1: "Meetings",
  2: "CustomSections",
  3: "PreTaskPlans",
  4: "SiteDiary",
  5: "Incidents"
};

const PRIORITY_MAP = {
  0: "low",
  1: "medium",
  2: "high",
  3: "critical"
};

const CUSTOM_FIELD_TYPE_MAP = {
  Checkbox: "Checkbox",
  Date: "Date",
  DateAndTime: "DateTime",
  ExpandableText: "ExpandingLabel",
  ExpiryDate: "ExpiryDate",
  FileDownload: "FileDownload",
  FileUpload: "FileUpload",
  FreeText: "FreeText",
  Heading: "Heading",
  ImageDownload: "Image",
  ImageUpload: "ImageUpload",
  LargeReadOnlyText: "BigLabel",
  MultipleChoiceList: "MultiSelectDropdown",
  NoMarginText: "NoMargin",
  Number: "Number",
  SectionEnd: "SectionEnd",
  SectionStart: "SectionStart",
  Separator: "Separator",
  SignatureOnly: "Signature",
  SignatureWithName: "SignatureWithName",
  SingleSelectList: "Dropdown",
  TextArea: "TextArea",
  Time: "Time",
  YesNoRadio: "YesNoRadio",
  YesNoNaRadio: "YesNoNaRadio"
};

const CUSTOM_FIELD_INT_TYPE_MAP = {
  0: "FreeText",
  1: "TextArea",
  2: "Checkbox",
  3: "Dropdown",
  5: "Separator",
  6: "Heading",
  7: "ImageUpload",
  8: "Date",
  9: "Time",
  10: "DateTime",
  11: "YesNoRadio",
  12: "BigLabel",
  13: "NoMargin",
  14: "ExpiryDate",
  15: "ExpandingLabel",
  16: "Signature",
  17: "SignatureWithName",
  18: "SubForm",
  19: "YesNoNaRadio",
  20: "FileUpload",
  21: "Image",
  22: "FileDownload",
  23: "MultiSelectDropdown",
  24: "SectionStart",
  25: "SectionEnd",
  27: "Number"
};

const OBSERVATION_HEADER_ALIASES = {
  observationtypename: "name",
  observationtype: "name",
  observationname: "name",
  name: "name"
};

export function observationTypeBaseUrl(tenant, path = OBSERVATION_TYPES_PATH) {
  return `https://${tenantHost(tenant)}/${path}`;
}

export async function listObservationTypes(client, tenant) {
  const aggregated = [];
  let fromIndex = 0;

  for (let page = 0; page < 1000; page += 1) {
    const response = await observationTypeRequest(client, tenant, "POST", "", {
      body: {
        FromIndex: fromIndex,
        Take: OBSERVATION_PAGE_SIZE,
        ShouldSortAscending: true,
        SortBy: ""
      }
    });
    const items = extractObservationTypeArray(response);
    if (!items.length) break;
    aggregated.push(...items);
    if (items.length < OBSERVATION_PAGE_SIZE) break;
    fromIndex += OBSERVATION_PAGE_SIZE;
  }

  const observationTypes = dedupeObservationTypes(aggregated)
    .map(normalizeObservationTypeSummary)
    .filter((item) => item.id || item.name)
    .sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));

  return {
    observationTypes,
    source: OBSERVATION_TYPES_PATH
  };
}

export async function getObservationType(client, tenant, id) {
  const response = await observationTypeRequest(client, tenant, "GET", id);
  if (response && typeof response === "object" && !Array.isArray(response) && Object.keys(response).length === 1) {
    const onlyValue = response[Object.keys(response)[0]];
    if (onlyValue && typeof onlyValue === "object" && !Array.isArray(onlyValue)) return onlyValue;
  }
  return response;
}

export function createObservationType(client, tenant, payload) {
  return hiddenObservationRequest(client, tenant, "POST", OBSERVATION_TYPES_CREATE_PATH, payload);
}

export function updateObservationType(client, tenant, payload) {
  return hiddenObservationRequest(client, tenant, "PUT", OBSERVATION_TYPES_EDIT_PATH, payload);
}

export async function listIssueCategories(client, query = {}) {
  const response = await client.request("GET", "/api/v1/IssueCategories", { query });
  const items = Array.isArray(response)
    ? response
    : Array.isArray(response?.items)
      ? response.items
      : Array.isArray(response?.data)
        ? response.data
        : [];
  return items
    .map((item) => ({
      id: stringValue(item.id || item.Id || item.categoryId || item.CategoryId),
      name: stringValue(item.name || item.Name || item.displayName || item.DisplayName)
    }))
    .filter((item) => item.id || item.name)
    .sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));
}

export function planSimpleObservationTypeCreateOperations(rows) {
  const operations = rows.map((row, index) => {
    const normalized = normalizeObservationRow(row);
    const name = stringValue(normalized.name);
    const operation = {
      clientId: `observation-${index + 1}`,
      rowNumber: index + 2,
      action: "create",
      name,
      warnings: normalized.warnings,
      errors: []
    };
    if (!name) operation.errors.push("Observation Type Name is required.");
    return operation;
  });

  return {
    operations,
    hasErrors: operations.some((operation) => operation.errors.length > 0)
  };
}

export async function executeSimpleObservationTypeCreateOperations(client, tenant, operations, {
  apply = false,
  globalSettings = {},
  observationSettings = {},
  continueOnError = false
} = {}) {
  const results = [];

  for (const operation of operations || []) {
    const effectiveSettings = {
      ...(globalSettings || {}),
      ...(observationSettings?.[operation.clientId] || {})
    };
    const payloadResult = buildObservationTypeCreatePayload(operation, effectiveSettings);
    const errors = uniqueMessages([...(operation.errors || []), ...payloadResult.errors]);
    const operationWithPayload = { ...operation, payload: payloadResult.payload, errors };

    if (errors.length) {
      results.push({ operation: operationWithPayload, status: "invalid", errors });
      if (!continueOnError) break;
      continue;
    }

    if (!apply) {
      results.push({ operation: operationWithPayload, status: "planned" });
      continue;
    }

    try {
      const response = await createObservationType(client, tenant, payloadResult.payload);
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

export function buildObservationTypeCreatePayload(operation, settings = {}) {
  const normalized = normalizeObservationTypeSettings(settings);
  const openingFields = resolveCustomFieldSettings([], normalized.CustomFieldsForOpening);
  const closingFields = resolveCustomFieldSettings([], normalized.CustomFieldsForClosing);
  const payload = {
    Name: operation.name || "",
    NameLocalisations: [],
    Colour: normalized.Colour ?? "#3ea3fe",
    AllowableClassifications: normalized.AllowableClassifications ?? ["Negative"],
    SuggestedFunctions: normalized.SuggestedFunctions ?? [],
    CanRaiseIn: normalized.CanRaiseIn ?? ["ObservationsModule"],
    WhoCanCreate: normalized.WhoCanCreate ?? ["Employers", "Workers"],
    CustomFieldsForOpening: openingFields ?? [],
    CustomFieldsForClosing: closingFields ?? []
  };

  if (normalized.CategoryId) payload.CategoryId = normalized.CategoryId;
  if (normalized.SuggestedPriority !== undefined) payload.SuggestedPriority = normalized.SuggestedPriority;
  if (normalized.ForcePriority !== undefined) payload.ForcePriority = normalized.ForcePriority;

  const errors = validateObservationTypeCreatePayload(payload);
  return { payload, errors, appliedFields: Object.keys(normalized) };
}

export function applyBulkObservationTypeSettings(existing, settings = {}) {
  const normalized = normalizeObservationTypeSettings(settings);
  const appliedFields = Object.keys(normalized);
  const payload = buildExistingObservationTypeUpdatePayload(existing, normalized);

  return {
    payload,
    appliedFields,
    observationType: {
      id: payload.Id || payload.id || "",
      name: payload.Name || payload.name || ""
    }
  };
}

export async function executeBulkObservationTypeUpdate(client, tenant, id, settings = {}, { apply = false } = {}) {
  const existing = await getObservationType(client, tenant, id);
  const update = applyBulkObservationTypeSettings(existing, settings);

  if (!update.appliedFields.length) {
    throw new Error("Choose at least one observation type setting to update.");
  }

  const result = {
    status: apply ? "success" : "planned",
    observationType: {
      id: update.payload.Id || id,
      name: update.payload.Name || ""
    },
    appliedFields: update.appliedFields,
    payload: update.payload
  };

  if (apply) result.response = await updateObservationType(client, tenant, update.payload);
  return result;
}

function hiddenObservationRequest(client, tenant, method, path, body) {
  return client.request(method, observationTypeBaseUrl(tenant, path), {
    body,
    bearer: false,
    cookies: true,
    headers: {
      accept: "*/*",
      "content-type": "application/json",
      "x-requested-with": "XMLHttpRequest"
    }
  });
}

function observationTypeRequest(client, tenant, method, id = "", { body } = {}) {
  const url = id
    ? `${observationTypeBaseUrl(tenant)}/${encodeURIComponent(id)}`
    : observationTypeBaseUrl(tenant);
  const headers = {
    accept: "*/*",
    "x-requested-with": "XMLHttpRequest"
  };
  if (body !== undefined) headers["content-type"] = "application/json";
  return client.request(method, url, {
    body,
    bearer: false,
    cookies: true,
    headers
  });
}

function buildExistingObservationTypeUpdatePayload(existing, normalizedSettings = {}) {
  const source = existing && typeof existing === "object" ? existing : {};
  const payload = {
    Id: stringValue(source.Id || source.id || source.ObservationTypeId || source.observationTypeId),
    CategoryId: categoryIdFromSource(source),
    Name: stringValue(source.Name || source.name || source.DisplayName || source.displayName),
    NameLocalisations: Array.isArray(source.NameLocalisations || source.nameLocalisations)
      ? cloneJson(source.NameLocalisations || source.nameLocalisations)
      : [],
    Colour: stringValue(source.Colour || source.colour || source.Color || source.color || "#808080"),
    AllowableClassifications: classificationsFromSource(source),
    SuggestedFunctions: arrayFromSource(source.SuggestedFunctions ?? source.suggestedFunctions),
    CanRaiseIn: canRaiseInFromSource(source),
    WhoCanCreate: whoCanCreateFromSource(source),
    CustomFieldsForOpening: sanitizeCustomFields(source.CustomFieldsForOpening || source.customFieldsForOpening),
    CustomFieldsForClosing: sanitizeCustomFields(source.CustomFieldsForClosing || source.customFieldsForClosing)
  };

  const priority = priorityFromSource(source.SuggestedPriority ?? source.suggestedPriority);
  if (priority !== undefined && priority !== "") payload.SuggestedPriority = priority;
  if (source.ForcePriority !== undefined || source.forcePriority !== undefined) {
    payload.ForcePriority = coerceBoolean(source.ForcePriority ?? source.forcePriority, false);
  }

  for (const [key, value] of Object.entries(normalizedSettings)) {
    if (key === "CustomFieldsForOpening" || key === "CustomFieldsForClosing") {
      payload[key] = resolveCustomFieldSettings(payload[key], value);
    } else {
      payload[key] = cloneJson(value);
    }
  }

  return payload;
}

function normalizeObservationTypeSettings(settings = {}) {
  const out = {};
  assignText(out, settings, "categoryId", "CategoryId", { allowClear: true });
  assignColour(out, settings);
  assignArray(out, settings, "allowableClassifications", "AllowableClassifications", CLASSIFICATIONS);
  assignArray(out, settings, "suggestedFunctions", "SuggestedFunctions");
  assignPriority(out, settings);
  assignBoolean(out, settings, "forcePriority", "ForcePriority");
  assignArray(out, settings, "canRaiseIn", "CanRaiseIn", CAN_RAISE_IN);
  assignArray(out, settings, "whoCanCreate", "WhoCanCreate", WHO_CAN_CREATE);
  assignCustomFields(out, settings, "opening", "CustomFieldsForOpening");
  assignCustomFields(out, settings, "closing", "CustomFieldsForClosing");
  return out;
}

function assignText(out, settings, inputKey, outputKey, { allowClear = false } = {}) {
  if (!hasOwn(settings, inputKey)) return;
  const value = settings[inputKey];
  if (value === undefined || value === null) return;
  if (allowClear && value === "__clear") {
    out[outputKey] = "";
    return;
  }
  const text = String(value).trim();
  if (text !== "") out[outputKey] = text;
}

function assignColour(out, settings) {
  if (!hasOwn(settings, "colour")) return;
  const text = String(settings.colour || "").trim();
  if (!text) return;
  out.Colour = text.startsWith("#") ? text : `#${text}`;
}

function assignArray(out, settings, inputKey, outputKey, allowedValues) {
  if (!hasOwn(settings, inputKey)) return;
  const values = arrayValue(settings[inputKey])
    .flatMap((item) => splitList(item))
    .map((item) => normalizeAllowedValue(item, allowedValues))
    .filter(Boolean);
  out[outputKey] = uniqueMessages(values);
}

function assignPriority(out, settings) {
  if (!hasOwn(settings, "suggestedPriority")) return;
  const text = String(settings.suggestedPriority || "").trim().toLowerCase();
  if (!text) return;
  if (text === "__clear" || text === "none") {
    out.SuggestedPriority = null;
    return;
  }
  if (!PRIORITIES.has(text)) throw new Error(`Unsupported priority: ${settings.suggestedPriority}`);
  out.SuggestedPriority = text;
}

function assignBoolean(out, settings, inputKey, outputKey) {
  if (!hasOwn(settings, inputKey) || settings[inputKey] === "") return;
  out[outputKey] = coerceBoolean(settings[inputKey], false);
}

function assignCustomFields(out, settings, prefix, outputKey) {
  const modeKey = `${prefix}CustomFieldsMode`;
  if (settings[modeKey] === "clear") {
    out[outputKey] = [];
    return;
  }

  const operations = customFieldOperationsFromSettings(settings, prefix);
  if (operations.length) {
    out[outputKey] = { __customFieldOperations: operations };
    return;
  }

  if (hasOwn(settings, `${prefix}CustomFieldAction`)) return;

  if (settings[modeKey] !== "replace" && !hasAnyValue(settings, [
    `${prefix}CustomFieldName`,
    `${prefix}CustomFieldType`,
    `${prefix}CustomFieldAnswerOptions`,
    `${prefix}CustomFieldIsCompulsory`
  ])) {
    return;
  }

  const field = buildCustomFieldFromSettings(settings, prefix);
  out[outputKey] = field ? [field] : [];
}

function customFieldOperationsFromSettings(settings, prefix) {
  const actions = arrayValue(settings[`${prefix}CustomFieldAction`]);
  if (!actions.length) return [];

  const targets = arrayValue(settings[`${prefix}CustomFieldTarget`]);
  const names = arrayValue(settings[`${prefix}CustomFieldName`]);
  const types = arrayValue(settings[`${prefix}CustomFieldType`]);
  const answerOptions = arrayValue(settings[`${prefix}CustomFieldAnswerOptions`]);
  const compulsory = arrayValue(settings[`${prefix}CustomFieldIsCompulsory`]);
  const operations = [];
  const rowCount = Math.max(actions.length, targets.length, names.length, types.length, answerOptions.length, compulsory.length);

  for (let index = 0; index < rowCount; index += 1) {
    const action = stringValue(actions[index]).toLowerCase();
    if (!action) continue;
    if (action === "clear") {
      operations.push({ action: "clear" });
      continue;
    }
    const target = stringValue(targets[index]);
    const field = buildCustomFieldFromValues({
      name: names[index],
      type: types[index],
      answerOptions: answerOptions[index],
      isCompulsory: compulsory[index]
    }, {
      defaultType: action === "add",
      includeDefaultCompulsory: action === "add",
      requireName: action === "add"
    });
    operations.push({
      action,
      target,
      ...(field ? { field } : {})
    });
  }

  return operations;
}

function buildCustomFieldFromSettings(settings, prefix) {
  return buildCustomFieldFromValues({
    name: settings[`${prefix}CustomFieldName`],
    type: settings[`${prefix}CustomFieldType`],
    answerOptions: settings[`${prefix}CustomFieldAnswerOptions`],
    isCompulsory: settings[`${prefix}CustomFieldIsCompulsory`]
  }, {
    defaultType: true,
    includeDefaultCompulsory: true,
    requireName: true
  });
}

function buildCustomFieldFromValues(
  { name: rawName, type: rawType, answerOptions: rawAnswerOptions, isCompulsory } = {},
  { defaultType = false, includeDefaultCompulsory = false, requireName = true } = {}
) {
  const name = stringValue(rawName);
  if (requireName && !name) return null;
  const typeKey = stringValue(rawType || (defaultType ? "Checkbox" : "")).replace(/[^a-z0-9]/gi, "");
  const customFieldType = typeKey ? CUSTOM_FIELD_TYPE_MAP[typeKey] || typeKey : "";
  const answerOptions = splitList(rawAnswerOptions).join("\n");
  const hasCompulsory = isCompulsory !== undefined && isCompulsory !== null && stringValue(isCompulsory) !== "";

  const field = {
    LocalisedFieldNames: [],
    LocalisedAnswerOptions: [],
    Index: 0,
    CanEmployerView: true,
    CanEmployerEdit: true,
    CanStandardUserView: true,
    CanStandardUserEdit: true,
    CanPublicView: false,
    CanPublicEdit: false,
    CanReportInsights: false,
    CanReportDetailed: true
  };

  if (name) {
    field.FieldName = name;
    field.InternalName = slugify(name);
  }
  if (customFieldType) field.CustomFieldType = customFieldType;
  if (hasCompulsory || includeDefaultCompulsory) field.IsCompulsory = coerceBoolean(isCompulsory, false);
  if (answerOptions) field.AnswerOptions = answerOptions;
  return Object.keys(field).some((key) => ![
    "LocalisedFieldNames",
    "LocalisedAnswerOptions",
    "Index",
    "CanEmployerView",
    "CanEmployerEdit",
    "CanStandardUserView",
    "CanStandardUserEdit",
    "CanPublicView",
    "CanPublicEdit",
    "CanReportInsights",
    "CanReportDetailed"
  ].includes(key))
    ? field
    : null;
}

function resolveCustomFieldSettings(existingFields = [], setting) {
  if (setting === undefined) return undefined;
  if (Array.isArray(setting)) return setting;
  if (!setting || typeof setting !== "object" || !Array.isArray(setting.__customFieldOperations)) {
    return cloneJson(setting);
  }

  let fields = sanitizeCustomFields(existingFields);
  for (const operation of setting.__customFieldOperations) {
    const action = stringValue(operation.action).toLowerCase();
    if (action === "clear") {
      fields = [];
      continue;
    }
    if (action === "delete") {
      fields = fields.filter((field) => !customFieldMatches(field, operation.target));
      continue;
    }
    if (action === "add") {
      if (operation.field) fields.push(withCustomFieldIndex(operation.field, fields.length));
      continue;
    }
    if (action === "update") {
      const index = fields.findIndex((field) => customFieldMatches(field, operation.target));
      if (index >= 0 && operation.field) {
        fields[index] = mergeCustomField(fields[index], operation.field, index);
      }
    }
  }
  return fields.map((field, index) => withCustomFieldIndex(field, index));
}

function customFieldMatches(field, target) {
  const text = normalizeName(target);
  if (!text) return false;
  return [
    field.InternalName,
    field.internalName,
    field.FieldName,
    field.fieldName
  ].some((value) => normalizeName(value) === text);
}

function mergeCustomField(existing, updates, index) {
  const merged = {
    ...cloneJson(existing),
    ...cloneJson(updates)
  };
  if (existing.InternalName) merged.InternalName = existing.InternalName;
  if (existing.internalName) merged.internalName = existing.internalName;
  return withCustomFieldIndex(merged, index);
}

function withCustomFieldIndex(field, index) {
  return {
    ...cloneJson(field),
    Index: index
  };
}

function validateObservationTypeCreatePayload(payload) {
  const errors = [];
  if (!payload.Name) errors.push("Observation Type Name is required.");
  if (!payload.CategoryId) errors.push("Category is required.");
  if (!Array.isArray(payload.AllowableClassifications) || !payload.AllowableClassifications.length) {
    errors.push("At least one classification is required.");
  }
  if (!Array.isArray(payload.CanRaiseIn) || !payload.CanRaiseIn.length) {
    errors.push("Select at least one Can Raise In option.");
  }
  if (!Array.isArray(payload.WhoCanCreate) || !payload.WhoCanCreate.length) {
    errors.push("Select at least one Who Can Create option.");
  }
  return errors;
}

function normalizeObservationRow(row) {
  const out = { warnings: [] };
  for (const [header, rawValue] of Object.entries(row || {})) {
    const value = stringValue(rawValue);
    if (value === "") continue;
    const key = OBSERVATION_HEADER_ALIASES[normalizeHeader(header)];
    if (!key) {
      out.warnings.push(`Unmapped column "${header}" was ignored.`);
      continue;
    }
    out[key] = value;
  }
  return out;
}

function extractObservationTypeArray(responseJson) {
  if (Array.isArray(responseJson)) return responseJson;
  if (responseJson && typeof responseJson === "object") {
    for (const key of [
      "observationTypes",
      "ObservationTypes",
      "observationTypeDtos",
      "items",
      "data",
      "results",
      "rows",
      "value"
    ]) {
      if (Array.isArray(responseJson[key])) return responseJson[key];
    }
    for (const value of Object.values(responseJson)) {
      if (Array.isArray(value) && value[0] && typeof value[0] === "object") return value;
    }
  }
  return [];
}

function dedupeObservationTypes(items) {
  const seen = new Set();
  const out = [];
  for (const item of items || []) {
    if (!item || typeof item !== "object") continue;
    const summary = normalizeObservationTypeSummary(item);
    const key = summary.id || normalizeName(summary.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function normalizeObservationTypeSummary(item) {
  const id = stringValue(item.id || item.Id || item.observationTypeId || item.ObservationTypeId);
  const name = stringValue(item.name || item.Name || item.displayName || item.DisplayName || item.observationTypeName);
  const category = item.category || item.Category || {};
  return {
    id,
    name: name || id,
    categoryId: stringValue(item.categoryId || item.CategoryId || category.id || category.Id),
    categoryName: stringValue(item.categoryName || item.CategoryName || category.name || category.Name),
    colour: stringValue(item.colour || item.Colour || item.color || item.Color),
    suggestedPriority: priorityFromSource(item.suggestedPriority ?? item.SuggestedPriority) || "",
    forcePriority: coerceBoolean(item.forcePriority ?? item.ForcePriority, false)
  };
}

function categoryIdFromSource(source) {
  const category = source.Category || source.category;
  if (source.CategoryId || source.categoryId) return stringValue(source.CategoryId || source.categoryId);
  if (category && typeof category === "object") return stringValue(category.Id || category.id);
  return looksLikeUuid(category) ? stringValue(category) : "";
}

function classificationsFromSource(source) {
  const existing = arrayFromSource(source.AllowableClassifications ?? source.allowableClassifications);
  if (existing.length) return existing;
  const out = [];
  if (coerceBoolean(source.CanBeNegative ?? source.canBeNegative, false)) out.push("Negative");
  if (coerceBoolean(source.CanBeNeutral ?? source.canBeNeutral, false)) out.push("Neutral");
  if (coerceBoolean(source.CanBePositive ?? source.canBePositive, false)) out.push("Positive");
  return out;
}

function canRaiseInFromSource(source) {
  return arrayFromSource(source.CanRaiseIn ?? source.canRaiseIn)
    .map((value) => typeof value === "number" ? CAN_RAISE_IN_MAP[value] || String(value) : String(value))
    .filter(Boolean);
}

function whoCanCreateFromSource(source) {
  const existing = arrayFromSource(source.WhoCanCreate ?? source.whoCanCreate);
  if (existing.length) return existing;
  const out = [];
  if (coerceBoolean(source.CanBeCreatedByEmployer ?? source.canBeCreatedByEmployer, false)) out.push("Employers");
  if (coerceBoolean(source.CanBeCreatedByWorker ?? source.canBeCreatedByWorker, false)) out.push("Workers");
  return out;
}

function priorityFromSource(value) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "number") return PRIORITY_MAP[value] || String(value).toLowerCase();
  return String(value).toLowerCase();
}

function sanitizeCustomFields(fields) {
  if (!Array.isArray(fields)) return [];
  return fields
    .filter((field) => field && typeof field === "object")
    .map((field) => {
      const out = cloneJson(field);
      for (const key of ["id", "Id", "entityId", "EntityId", "uploadResult", "UploadResult", "canUserEdit", "CanUserEdit"]) {
        delete out[key];
      }
      const type = out.CustomFieldType ?? out.customFieldType;
      if (typeof type === "number") out.CustomFieldType = CUSTOM_FIELD_INT_TYPE_MAP[type] || String(type);
      if (out.customFieldType !== undefined) {
        out.CustomFieldType ||= out.customFieldType;
        delete out.customFieldType;
      }
      if (!out.AnswerOptions) delete out.AnswerOptions;
      out.LocalisedAnswerOptions = Array.isArray(out.LocalisedAnswerOptions)
        ? out.LocalisedAnswerOptions.filter((item) => item?.Text !== null)
        : [];
      return out;
    });
}

function arrayFromSource(value) {
  if (Array.isArray(value)) return value.filter((item) => item !== undefined && item !== null && item !== "");
  if (value === undefined || value === null || value === "") return [];
  return splitList(value);
}

function splitList(value) {
  if (Array.isArray(value)) return value.flatMap((item) => splitList(item));
  return String(value || "")
    .split(/[\n;,]+/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function arrayValue(value) {
  if (Array.isArray(value)) return value;
  return value === undefined || value === null || value === "" ? [] : [value];
}

function normalizeAllowedValue(value, allowedValues) {
  const text = String(value || "").trim();
  if (!allowedValues || allowedValues.has(text)) return text;
  const normalized = text.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const allowed of allowedValues) {
    if (allowed.toLowerCase().replace(/[^a-z0-9]/g, "") === normalized) return allowed;
  }
  throw new Error(`Unsupported option: ${value}`);
}

function coerceBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  const text = String(value).trim().toLowerCase();
  if (["true", "yes", "y", "1", "on"].includes(text)) return true;
  if (["false", "no", "n", "0", "off"].includes(text)) return false;
  return fallback;
}

function stringValue(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function normalizeHeader(header) {
  return String(header || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeName(value) {
  return stringValue(value).toLowerCase().replace(/\s+/g, " ");
}

function uniqueMessages(messages) {
  return Array.from(new Set((messages || []).filter(Boolean)));
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

function hasAnyValue(object, keys) {
  return keys.some((key) => arrayValue(object[key]).some((value) => stringValue(value) !== ""));
}

function cloneJson(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function looksLikeUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || "").trim());
}
