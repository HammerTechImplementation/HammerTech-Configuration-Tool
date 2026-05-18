const CHECKLIST_PATH = "company/api/ChecklistTypesApi";
const YES_NO_QUESTION_TYPE = "2";
const YES_NO_NA_QUESTION_TYPE = "3";
const BULK_EDITABLE_QUESTION_TYPES = new Set([YES_NO_QUESTION_TYPE, YES_NO_NA_QUESTION_TYPE]);

const OBSERVATION_TYPE_PATHS = [
  "company/api/ObservationTypes/GetObservationTypesListByParameters",
  "company/api/ObservationTypes/SubFormList",
  "company/api/ObservationTypesApi",
  "company/api/ObservationTypes",
  "company/api/IssueTypesApi",
  "company/api/IssueTypes",
  "company/api/IssuesApi/GetIssueTypes"
];

const READONLY_KEYS = new Set([
  "id",
  "companyid",
  "created",
  "createdby",
  "updated",
  "updatedby",
  "datecreated",
  "dateupdated",
  "lastmodified",
  "lastmodifieddate",
  "dateadded",
  "isdeleted",
  "version",
  "__metadata",
  "checklisttypeid",
  "checklistid",
  "issystemdefinedchecklisttype",
  "statustext"
]);

const QUESTION_DROP_KEYS = new Set([
  "questionTypeImageUploadPhotoPreviewUrl",
  "relativeDataDwnldImageUrl",
  "relativeDataPopupImageUrl",
  "relativeImagePhotoPreviewUrl",
  "relativeImageFileName"
].map((key) => key.toLowerCase()));

const TOP_LEVEL_DROP_KEYS = new Set(["questions", "checklistQuestions"]);

const HEADER_ALIASES = {
  action: "action",
  checklistid: "checklistId",
  id: "id",
  checklistname: "checklistName",
  checklistnames: "checklistName",
  name: "name",
  checklistdisplayname: "displayName",
  displayname: "displayName",
  checklistquestion: "questionText",
  checklistquestions: "questionText",
  systemdefinedchecklisttype: "systemDefinedChecklistType",
  ishiddenfrommainlist: "isHiddenFromMainList",
  hidden: "isHiddenFromMainList",
  isinactive: "isInactive",
  inactive: "isInactive",
  replacequestions: "replaceQuestions",
  questiontext: "questionText",
  question: "question",
  text: "text",
  questionid: "questionId",
  questiontype: "questionType",
  checklistquestiontype: "checklistQuestionType",
  type: "type",
  isrequired: "isRequired",
  iscompulsory: "isCompulsory",
  compulsory: "isCompulsory",
  required: "isRequired",
  defaultissuetypeid: "defaultIssueTypeId",
  answeroptions: "answerOptions",
  dropdownoptions: "dropdownOptions",
  options: "answerOptions",
  zindex: "zIndex",
  sortorder: "zIndex",
  order: "zIndex"
};

export function checklistBaseUrl(tenant) {
  return `https://${tenantHost(tenant)}/${CHECKLIST_PATH}`;
}

function hiddenApiUrl(tenant, path) {
  return `https://${tenantHost(tenant)}/${String(path || "").replace(/^\/+/, "")}`;
}

export async function listInspectionChecklists(client, tenant) {
  const raw = await checklistRequest(client, tenant, "GET");
  return extractChecklistArray(raw)
    .filter(isInspectionChecklistListItem)
    .map((item) => ({
      id: String(item.id || item.Id || item.ID || ""),
      name: item.name || item.Name || item.displayName || item.DisplayName || "",
      displayName: item.displayName || item.DisplayName || item.name || item.Name || "",
      type: item.type || item.Type || "",
      typeDisplayName: item.typeDisplayName || item.TypeDisplayName || "",
      isHiddenFromMainList: Boolean(item.isHiddenFromMainList ?? item.IsHiddenFromMainList),
      isInactive: Boolean(item.isInactive ?? item.IsInactive),
      systemDefinedChecklistType: item.systemDefinedChecklistType ?? item.SystemDefinedChecklistType ?? ""
    }))
    .filter((item) => item.id || item.name)
    .sort((a, b) => (a.name || a.displayName).localeCompare(b.name || b.displayName));
}

export async function getInspectionChecklist(client, tenant, id) {
  const raw = await checklistRequest(client, tenant, "GET", id);
  if (raw && typeof raw === "object" && !Array.isArray(raw) && Object.keys(raw).length === 1) {
    const onlyValue = raw[Object.keys(raw)[0]];
    if (onlyValue && typeof onlyValue === "object" && !Array.isArray(onlyValue)) return onlyValue;
  }
  return raw;
}

export async function createInspectionChecklist(client, tenant, payload) {
  return checklistRequest(client, tenant, "POST", "", { body: payload });
}

export async function updateInspectionChecklist(client, tenant, payload) {
  return checklistRequest(client, tenant, "PUT", "", { body: payload });
}

export async function listInspectionObservationTypes(client, tenant) {
  const errors = [];

  for (const path of OBSERVATION_TYPE_PATHS) {
    const url = hiddenApiUrl(tenant, path);
    try {
      const response = await client.request("GET", url, {
        bearer: false,
        cookies: true,
        headers: {
          accept: "application/json",
          "x-requested-with": "XMLHttpRequest"
        }
      });
      const observationTypes = extractObservationTypes(response);
      if (observationTypes.length) return { observationTypes, source: path, errors };
    } catch (error) {
      errors.push(`${path}: ${error.status || ""} ${error.statusText || error.message}`.trim());
    }
  }

  return { observationTypes: [], source: null, errors };
}

export function summarizeYesNoChecklistQuestions(checklist) {
  const questions = extractQuestions(checklist);
  const yesNoQuestions = questions.filter((question) => questionType(question) === YES_NO_QUESTION_TYPE).length;
  const yesNoNaQuestions = questions.filter((question) => questionType(question) === YES_NO_NA_QUESTION_TYPE).length;
  const targetQuestions = yesNoQuestions + yesNoNaQuestions;

  return {
    totalQuestions: questions.length,
    targetQuestions,
    yesNoQuestions,
    yesNoNaQuestions,
    skippedQuestions: questions.length - targetQuestions
  };
}

export function applyBulkYesNoQuestionSettings(checklist, settings = {}) {
  const source = cloneJson(checklist || {});
  const questions = extractQuestions(source).map((question) => cloneJson(question));
  const normalizedSettings = normalizeBulkYesNoSettings(settings);
  const appliedFields = Object.keys(normalizedSettings);
  const updatedQuestions = [];

  const nextQuestions = questions.map((question) => {
    if (!BULK_EDITABLE_QUESTION_TYPES.has(questionType(question))) return question;
    const nextQuestion = { ...question };
    applyQuestionSettings(nextQuestion, normalizedSettings);
    updatedQuestions.push({
      id: nextQuestion.id || nextQuestion.questionId || "",
      questionText: nextQuestion.questionText || nextQuestion.question || "",
      checklistQuestionType: nextQuestion.checklistQuestionType
    });
    return nextQuestion;
  });

  const payload = buildExistingChecklistUpdatePayload(source, nextQuestions);

  return {
    payload,
    summary: summarizeYesNoChecklistQuestions(source),
    appliedFields,
    updatedQuestions
  };
}

export async function executeBulkYesNoChecklistUpdate(client, tenant, id, settings = {}, { apply = false } = {}) {
  const existing = await getInspectionChecklist(client, tenant, id);
  const update = applyBulkYesNoQuestionSettings(existing, settings);

  if (!update.summary.targetQuestions) {
    throw new Error("The selected checklist does not contain any Yes/No or Yes/No/NA questions.");
  }
  if (!update.appliedFields.length) {
    throw new Error("Choose at least one checklist setting to update.");
  }

  const result = {
    status: apply ? "success" : "planned",
    checklist: {
      id: update.payload.id || id,
      name: update.payload.name || "",
      displayName: update.payload.displayName || ""
    },
    summary: update.summary,
    appliedFields: update.appliedFields,
    updatedQuestions: update.updatedQuestions
  };

  if (apply) result.response = await updateInspectionChecklist(client, tenant, update.payload);
  return result;
}

export function planInspectionChecklistOperations(rows) {
  const groups = new Map();

  rows.forEach((row, index) => {
    const normalized = normalizeRow(row);
    const action = normalizeAction(normalized.action || "create");
    const id = stringValue(normalized.checklistId || normalized.id);
    const name = stringValue(normalized.checklistName || normalized.name);
    const key = `${action}:${id || normalizeName(name) || `row-${index + 2}`}`;

    if (!groups.has(key)) {
      groups.set(key, {
        rowNumber: index + 2,
        rowNumbers: [],
        action,
        id,
        name,
        displayName: stringValue(normalized.displayName),
        systemDefinedChecklistType: stringValue(normalized.systemDefinedChecklistType || "-200"),
        isHiddenFromMainList: normalized.isHiddenFromMainList,
        isInactive: normalized.isInactive,
        replaceQuestions: normalized.replaceQuestions,
        questions: [],
        warnings: [],
        errors: []
      });
    }

    const group = groups.get(key);
    group.rowNumbers.push(index + 2);
    mergeChecklistTopLevel(group, normalized);

    const question = questionFromRow(normalized, index);
    if (question) group.questions.push(question);
  });

  const operations = Array.from(groups.values()).map((operation) => {
    operation.errors = validateOperation(operation);
    operation.payload = buildChecklistPayload(operation, operation.questions, {
      includeReadOnly: operation.action === "update"
    });
    return operation;
  });

  return {
    operations,
    hasErrors: operations.some((operation) => operation.errors.length > 0)
  };
}

export async function executeInspectionChecklistOperations(client, tenant, operations, {
  apply = false,
  continueOnError = false
} = {}) {
  const results = [];
  let checklistNameToId = null;

  for (const operation of operations) {
    if (operation.errors.length) {
      results.push({ operation, status: "invalid", errors: operation.errors });
      if (!continueOnError) break;
      continue;
    }

    if (!apply) {
      results.push({ operation, status: "planned" });
      continue;
    }

    try {
      if (operation.action === "create") {
        const response = await createInspectionChecklist(client, tenant, operation.payload);
        results.push({ operation, status: "success", response });
        continue;
      }

      let id = operation.id;
      if (!id) {
        checklistNameToId ||= await buildChecklistNameToId(client, tenant);
        id = checklistNameToId.get(normalizeName(operation.name));
      }
      if (!id) throw new Error(`Could not find existing checklist named "${operation.name}".`);

      const existing = await getInspectionChecklist(client, tenant, id);
      const shouldReplaceQuestions = operation.questions.length > 0 || coerceBoolean(operation.replaceQuestions, false);
      const questions = shouldReplaceQuestions
        ? operation.questions
        : extractQuestions(existing);
      const payload = buildChecklistPayload(mergeExistingChecklist(existing, operation, id), questions, {
        includeReadOnly: true
      });
      const response = await updateInspectionChecklist(client, tenant, payload);
      results.push({ operation: { ...operation, id, payload }, status: "success", response });
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

export function planSimpleInspectionChecklistCreateOperations(rows) {
  const operations = [];
  let current = null;

  rows.forEach((row, index) => {
    const normalized = normalizeRow(row);
    const name = stringValue(normalized.checklistName || normalized.name);
    const displayName = stringValue(normalized.displayName);
    const questionText = stringValue(normalized.questionText || normalized.question || normalized.text);
    const rowNumber = index + 2;

    if (name && (!current || name !== current.name)) {
      current = {
        clientId: `checklist-${operations.length + 1}`,
        rowNumber,
        rowNumbers: [],
        action: "create",
        name,
        displayName: displayName || name,
        systemDefinedChecklistType: "-200",
        isHiddenFromMainList: false,
        questions: [],
        errors: [],
        warnings: []
      };
      operations.push(current);
    }

    if (!current) {
      operations.push({
        clientId: `checklist-${operations.length + 1}`,
        rowNumber,
        rowNumbers: [rowNumber],
        action: "create",
        name,
        displayName,
        systemDefinedChecklistType: "-200",
        isHiddenFromMainList: false,
        questions: [],
        errors: ["Checklist Name is required before listing questions."],
        warnings: []
      });
      return;
    }

    current.rowNumbers.push(rowNumber);
    if (displayName && (!current.displayName || current.displayName === current.name)) current.displayName = displayName;
    if (questionText) {
      current.questions.push({
        questionText,
        checklistQuestionType: YES_NO_NA_QUESTION_TYPE,
        zIndex: current.questions.length + 1
      });
    }
  });

  for (const operation of operations) {
    operation.errors = uniqueMessages([...(operation.errors || []), ...validateSimpleCreateOperation(operation)]);
  }

  return {
    operations,
    hasErrors: operations.some((operation) => operation.errors.length > 0)
  };
}

export async function executeSimpleInspectionChecklistCreateOperations(client, tenant, operations, {
  apply = false,
  globalSettings = {},
  checklistSettings = {},
  continueOnError = false
} = {}) {
  const results = [];

  for (const operation of operations || []) {
    const errors = uniqueMessages([...(operation.errors || []), ...validateSimpleCreateOperation(operation)]);
    if (errors.length) {
      results.push({ operation: { ...operation, errors }, status: "invalid", errors });
      if (!continueOnError) break;
      continue;
    }

    const effectiveSettings = {
      ...(globalSettings || {}),
      ...(checklistSettings?.[operation.clientId] || {})
    };
    const payload = buildSimpleInspectionChecklistCreatePayload(operation, effectiveSettings);
    const operationWithPayload = { ...operation, payload };

    if (!apply) {
      results.push({ operation: operationWithPayload, status: "planned" });
      continue;
    }

    try {
      const response = await createInspectionChecklist(client, tenant, payload);
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

export function tenantHost(tenant) {
  const value = String(tenant || "").trim().toLowerCase();
  if (!value) throw new Error("Missing tenant.");
  if (/^https?:\/\//i.test(value)) return new URL(value).hostname;
  if (value.endsWith(".hammertechonline.com")) return value;
  return `${value}.hammertechonline.com`;
}

export function buildChecklistPayload(source, questions = [], { includeReadOnly = false } = {}) {
  const top = sanitize(source, { includeReadOnly });
  for (const key of Object.keys(top)) {
    if (TOP_LEVEL_DROP_KEYS.has(key)) delete top[key];
  }

  const payload = {
    ...(includeReadOnly && top.id ? { id: top.id } : {}),
    name: top.name || top.Name || "",
    displayName: top.displayName || top.DisplayName || top.name || top.Name || "",
    systemDefinedChecklistType: top.systemDefinedChecklistType || top.SystemDefinedChecklistType || "-200",
    isHiddenFromMainList: coerceBoolean(top.isHiddenFromMainList ?? top.IsHiddenFromMainList, false),
    localisedNames: Array.isArray(top.localisedNames || top.LocalisedNames)
      ? (top.localisedNames || top.LocalisedNames)
      : [],
    checklistQuestions: questions.map((question, index) => normalizeQuestionPayload(question, index, {
      includeReadOnly
    }))
  };

  if (top.isInactive !== undefined || top.IsInactive !== undefined) {
    payload.isInactive = coerceBoolean(top.isInactive ?? top.IsInactive, false);
  }

  return payload;
}

function checklistRequest(client, tenant, method, id = "", { body } = {}) {
  const url = id
    ? `${checklistBaseUrl(tenant)}/${encodeURIComponent(id)}`
    : checklistBaseUrl(tenant);
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

function buildExistingChecklistUpdatePayload(source, questions) {
  const top = source && typeof source === "object" ? source : {};
  const payload = {
    id: top.id || top.Id || top.ID || "",
    name: top.name || top.Name || "",
    displayName: top.displayName || top.DisplayName || top.name || top.Name || "",
    systemDefinedChecklistType: top.systemDefinedChecklistType || top.SystemDefinedChecklistType || "-200",
    isHiddenFromMainList: coerceBoolean(top.isHiddenFromMainList ?? top.IsHiddenFromMainList, false),
    localisedNames: Array.isArray(top.localisedNames || top.LocalisedNames)
      ? cloneJson(top.localisedNames || top.LocalisedNames)
      : [],
    checklistQuestions: questions.map((question) => cloneJson(question))
  };

  if (top.isInactive !== undefined || top.IsInactive !== undefined) {
    payload.isInactive = coerceBoolean(top.isInactive ?? top.IsInactive, false);
  }

  return payload;
}

function questionType(question) {
  return String(question?.checklistQuestionType ?? question?.questionType ?? question?.type ?? "");
}

function applyQuestionSettings(question, settings) {
  if (hasOwn(settings, "questionType")) question.checklistQuestionType = settings.questionType;
  if (hasOwn(settings, "yesText")) question.yesText = settings.yesText;
  if (hasOwn(settings, "noText")) question.noText = settings.noText;
  if (hasOwn(settings, "naText")) question.naText = settings.naText;
  if (hasOwn(settings, "defaultIssueTypeId")) question.defaultIssueTypeId = settings.defaultIssueTypeId;
  if (hasOwn(settings, "isDefaultIssueTypeForced")) question.isDefaultIssueTypeForced = settings.isDefaultIssueTypeForced;
  if (hasOwn(settings, "defaultIssuePriority")) question.defaultIssuePriority = settings.defaultIssuePriority;
  if (hasOwn(settings, "isCompulsory")) question.isCompulsory = settings.isCompulsory;
  if (hasOwn(settings, "excludeFromChecklistCompleteCheck")) {
    question.excludeFromChecklistCompleteCheck = settings.excludeFromChecklistCompleteCheck;
  }

  for (const suffix of ["Yes", "No", "Na"]) {
    if (hasOwn(settings, `raiseObservationOn${suffix}Option`)) {
      const value = settings[`raiseObservationOn${suffix}Option`];
      question[`raiseObservationOn${suffix}Option`] = value;
      question[`raiseIssueOn${suffix}`] = shouldRaiseIssueForObservationOption(
        suffix,
        value,
        settings[`issueCompulsoryOn${suffix}`] === true
      );
    }
    if (hasOwn(settings, `issueDefaultObservationTypeOn${suffix}`)) {
      question[`issueDefaultObservationTypeOn${suffix}`] = settings[`issueDefaultObservationTypeOn${suffix}`];
    }
    if (hasOwn(settings, `isIssueDefaultObservationTypeOn${suffix}Locked`)) {
      question[`isIssueDefaultObservationTypeOn${suffix}Locked`] = settings[`isIssueDefaultObservationTypeOn${suffix}Locked`];
    }
    if (hasOwn(settings, `auditScoreOn${suffix}`)) {
      question[`auditScoreOn${suffix}`] = settings[`auditScoreOn${suffix}`];
    }
    if (hasOwn(settings, `signatureOn${suffix}`)) {
      question[`signatureOn${suffix}`] = settings[`signatureOn${suffix}`];
    }
    if (hasOwn(settings, `additionalDetailsRequiredFor${suffix}`)) {
      question[`additionalDetailsRequiredFor${suffix}`] = settings[`additionalDetailsRequiredFor${suffix}`];
    }
    if (hasOwn(settings, `issueCompulsoryOn${suffix}`)) {
      question[`issueCompulsoryOn${suffix}`] = settings[`issueCompulsoryOn${suffix}`];
    }
  }
}

function normalizeBulkYesNoSettings(settings) {
  const out = {};
  assignQuestionType(out, settings, "questionType");
  assignText(out, settings, "yesText");
  assignText(out, settings, "noText");
  assignText(out, settings, "naText");
  assignText(out, settings, "defaultIssuePriority", { allowClear: true });
  assignText(out, settings, "defaultIssueTypeId", { allowClear: true });
  assignBoolean(out, settings, "isDefaultIssueTypeForced");
  assignBoolean(out, settings, "isCompulsory");
  assignBoolean(out, settings, "excludeFromChecklistCompleteCheck");

  for (const suffix of ["Yes", "No", "Na"]) {
    assignRaiseObservationStatus(out, settings, suffix);
    assignObservationTone(out, settings, `issueDefaultObservationTypeOn${suffix}`);
    assignBoolean(out, settings, `isIssueDefaultObservationTypeOn${suffix}Locked`);
    assignText(out, settings, `auditScoreOn${suffix}`, { allowClear: true });
    assignBoolean(out, settings, `signatureOn${suffix}`);
    assignBoolean(out, settings, `additionalDetailsRequiredFor${suffix}`);
    assignBoolean(out, settings, `issueCompulsoryOn${suffix}`);
  }

  return out;
}

function assignText(out, settings, key, { allowClear = false } = {}) {
  if (!hasOwn(settings, key)) return;
  const value = settings[key];
  if (value === undefined || value === null) return;
  if (allowClear && value === "__clear") {
    out[key] = "";
    return;
  }
  const text = String(value).trim();
  if (text !== "") out[key] = text;
}

function assignQuestionType(out, settings, key) {
  if (!hasOwn(settings, key) || settings[key] === "") return;
  const text = String(settings[key]).trim().toLowerCase();
  if (["2", "yes-no", "yes/no", "yn"].includes(text)) {
    out[key] = YES_NO_QUESTION_TYPE;
    return;
  }
  if (["3", "yes-no-na", "yes/no/na", "ynna"].includes(text)) {
    out[key] = YES_NO_NA_QUESTION_TYPE;
    return;
  }
  throw new Error(`Unsupported question type: ${settings[key]}`);
}

function assignBoolean(out, settings, key) {
  if (!hasOwn(settings, key) || settings[key] === "") return;
  out[key] = coerceBoolean(settings[key], false);
}

function assignRaiseObservationStatus(out, settings, suffix) {
  const key = `raiseObservationOn${suffix}Option`;
  if (!hasOwn(settings, key) || settings[key] === "") return;
  const parsed = parseRaiseObservationOption(settings[key]);
  out[key] = parsed.option;
  out[`additionalDetailsRequiredFor${suffix}`] = parsed.option > 0;
  out[`issueCompulsoryOn${suffix}`] = parsed.compulsory;
}

function parseRaiseObservationOption(value) {
  const text = String(value).trim().toLowerCase();
  if (["0", "none", "do-not-raise", "do not raise", "off"].includes(text)) {
    return { option: 0, compulsory: false };
  }
  if (["1", "allow", "allow-to-be-raised", "allow to be raised", "manual"].includes(text)) {
    return { option: 1, compulsory: false };
  }
  if (["2", "auto", "automatic", "automatically-raise", "automatically raise"].includes(text)) {
    return { option: 2, compulsory: false };
  }
  if (["3", "compulsory", "compulsory-on-status", "compulsory on status"].includes(text)) {
    return { option: 1, compulsory: true };
  }
  throw new Error(`Unsupported raising observation option: ${value}`);
}

function shouldRaiseIssueForObservationOption(suffix, value, compulsory) {
  if (value <= 0) return false;
  if (compulsory) return true;
  if (value === 2) return true;
  return suffix === "Na";
}

function assignObservationTone(out, settings, key) {
  if (!hasOwn(settings, key) || settings[key] === "") return;
  const text = String(settings[key]).trim().toLowerCase();
  if (["0", "clear", "__clear", "neutral", "none"].includes(text)) {
    out[key] = "0";
    return;
  }
  if (["1", "positive", "pos"].includes(text)) {
    out[key] = "1";
    return;
  }
  if (["-1", "negative", "neg"].includes(text)) {
    out[key] = "-1";
    return;
  }
  throw new Error(`Unsupported positive/negative/neutral option: ${settings[key]}`);
}

function extractObservationTypes(responseJson) {
  const items = [];
  collectObservationTypeCandidates(responseJson, items, 0);
  const deduped = new Map();

  for (const item of items) {
    const id = stringValue(
      item.id || item.Id || item.issueTypeId || item.IssueTypeId || item.observationTypeId || item.ObservationTypeId || item.value || item.Value
    );
    const name = stringValue(
      item.name || item.Name || item.displayName || item.DisplayName || item.description || item.Description || item.text || item.Text || item.label || item.Label
    );
    if (!id || deduped.has(id)) continue;
    deduped.set(id, { id, name: name || id });
  }

  return Array.from(deduped.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function collectObservationTypeCandidates(value, items, depth) {
  if (!value || depth > 4) return;
  if (Array.isArray(value)) {
    if (value.some((item) => item && typeof item === "object" && candidateLooksLikeObservationType(item))) {
      items.push(...value.filter((item) => item && typeof item === "object"));
      return;
    }
    for (const item of value) collectObservationTypeCandidates(item, items, depth + 1);
    return;
  }
  if (typeof value !== "object") return;
  if (candidateLooksLikeObservationType(value)) items.push(value);
  for (const child of Object.values(value)) collectObservationTypeCandidates(child, items, depth + 1);
}

function candidateLooksLikeObservationType(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value).map((key) => key.toLowerCase());
  const hasId = keys.some((key) => ["id", "issuetypeid", "observationtypeid", "value"].includes(key));
  const hasName = keys.some((key) => ["name", "displayname", "description", "text", "label"].includes(key));
  return hasId && hasName;
}

function extractChecklistArray(responseJson) {
  if (Array.isArray(responseJson)) return responseJson;
  if (responseJson && typeof responseJson === "object") {
    for (const key of ["checkListTypes", "checklistTypes", "CheckListTypes", "items", "data", "results"]) {
      if (Array.isArray(responseJson[key])) return responseJson[key];
    }
    for (const value of Object.values(responseJson)) {
      if (Array.isArray(value) && value[0] && typeof value[0] === "object") return value;
    }
  }
  return [];
}

function isInspectionChecklistListItem(item) {
  if (!item || typeof item !== "object") return false;
  const type = String(item.type || item.Type || "").trim();
  return type === "InspectionChecklist";
}

function extractQuestions(detail) {
  if (!detail || typeof detail !== "object") return [];
  if (Array.isArray(detail.questions)) return detail.questions;
  if (Array.isArray(detail.checklistQuestions)) return detail.checklistQuestions;
  if (Array.isArray(detail.Questions)) return detail.Questions;
  return [];
}

function normalizeRow(row) {
  const out = {};
  for (const [header, rawValue] of Object.entries(row || {})) {
    const key = normalizeHeader(header);
    const value = normalizeCell(rawValue);
    if (value === "") continue;
    out[key] = value;
  }
  return out;
}

function normalizeHeader(header) {
  const raw = String(header || "").trim();
  if (raw.toLowerCase().startsWith("question.")) return `question.${raw.slice("question.".length)}`;
  const key = raw.toLowerCase().replace(/[^a-z0-9]/g, "");
  return HEADER_ALIASES[key] || key;
}

function normalizeCell(value) {
  if (value === null || value === undefined) return "";
  const text = String(value).trim();
  return text.toLowerCase() === "null" ? "__null__" : text;
}

function normalizeAction(value) {
  const action = String(value || "").trim().toLowerCase();
  if (["update", "upsert"].includes(action)) return "update";
  return "create";
}

function mergeChecklistTopLevel(group, row) {
  if (!group.id && row.checklistId) group.id = stringValue(row.checklistId);
  if (!group.id && row.id) group.id = stringValue(row.id);
  if (!group.name && (row.checklistName || row.name)) group.name = stringValue(row.checklistName || row.name);
  if (!group.displayName && row.displayName) group.displayName = stringValue(row.displayName);
  if (row.systemDefinedChecklistType) group.systemDefinedChecklistType = stringValue(row.systemDefinedChecklistType);
  if (row.isHiddenFromMainList !== undefined) group.isHiddenFromMainList = row.isHiddenFromMainList;
  if (row.isInactive !== undefined) group.isInactive = row.isInactive;
  if (row.replaceQuestions !== undefined) group.replaceQuestions = row.replaceQuestions;
}

function questionFromRow(row, index) {
  const questionText = stringValue(row.questionText || row.question || row.text);
  const explicitFields = Object.entries(row)
    .filter(([key]) => key.startsWith("question."))
    .map(([key, value]) => [key.slice("question.".length), coerceSpreadsheetValue(value)]);

  if (!questionText && !explicitFields.length) return null;

  const question = Object.fromEntries(explicitFields);
  if (row.questionId && question.id === undefined) question.id = stringValue(row.questionId);
  if (questionText && question.questionText === undefined) question.questionText = questionText;
  if (row.checklistQuestionType && question.checklistQuestionType === undefined) {
    question.checklistQuestionType = stringValue(row.checklistQuestionType);
  }
  if (row.questionType && question.checklistQuestionType === undefined) {
    question.checklistQuestionType = stringValue(row.questionType);
  }
  if (row.type && question.checklistQuestionType === undefined) {
    question.checklistQuestionType = stringValue(row.type);
  }
  if (row.isCompulsory !== undefined && question.isCompulsory === undefined) {
    question.isCompulsory = coerceBoolean(row.isCompulsory, false);
  }
  if (row.isRequired !== undefined && question.isCompulsory === undefined) {
    question.isCompulsory = coerceBoolean(row.isRequired, false);
  }
  if (row.defaultIssueTypeId && question.defaultIssueTypeId === undefined) {
    question.defaultIssueTypeId = stringValue(row.defaultIssueTypeId);
  }
  if (row.dropdownOptions && question.dropdownOptions === undefined) {
    question.dropdownOptions = splitList(row.dropdownOptions);
  }
  if (row.answerOptions && question.dropdownOptions === undefined) {
    question.dropdownOptions = splitList(row.answerOptions);
  }
  if (row.zIndex !== undefined && question.zIndex === undefined) {
    question.zIndex = coerceNumber(row.zIndex, index);
  } else if (question.zIndex === undefined) {
    question.zIndex = index;
  }

  return question;
}

function validateOperation(operation) {
  const errors = [];
  if (!operation.name && operation.action === "create") errors.push("Create rows require checklistName.");
  if (!operation.id && !operation.name && operation.action === "update") {
    errors.push("Update rows require checklistId or checklistName.");
  }
  return errors;
}

function validateSimpleCreateOperation(operation) {
  const errors = [];
  if (!operation?.name) errors.push("Checklist Name is required.");
  if (!operation?.questions?.length) errors.push("At least one Checklist Question is required.");
  return errors;
}

function uniqueMessages(messages) {
  return Array.from(new Set(messages.filter(Boolean)));
}

function buildSimpleInspectionChecklistCreatePayload(operation, settings = {}) {
  const normalizedSettings = normalizeBulkYesNoSettings(settings);
  const questions = (operation.questions || []).map((question) => {
    const nextQuestion = { ...question };
    applyQuestionSettings(nextQuestion, normalizedSettings);
    return nextQuestion;
  });

  return buildChecklistPayload({
    name: operation.name,
    displayName: operation.displayName || operation.name,
    systemDefinedChecklistType: operation.systemDefinedChecklistType || "-200",
    isHiddenFromMainList: operation.isHiddenFromMainList ?? false
  }, questions);
}

function mergeExistingChecklist(existing, operation, id) {
  const merged = { ...(existing || {}), id };
  for (const field of [
    "name",
    "displayName",
    "systemDefinedChecklistType",
    "isHiddenFromMainList",
    "isInactive"
  ]) {
    if (operation[field] !== undefined && operation[field] !== "") merged[field] = operation[field];
  }
  return merged;
}

function normalizeQuestionPayload(question, index, { includeReadOnly = false } = {}) {
  const source = sanitize(question || {}, { includeReadOnly });
  const payload = {
    ...defaultQuestionPayload(index),
    ...source
  };

  if (includeReadOnly) {
    if (source.id || source.questionId) payload.id = source.id || source.questionId;
    if (source.created !== undefined) payload.created = source.created;
  } else {
    delete payload.id;
    delete payload.questionId;
    delete payload.created;
    for (const key of Object.keys(payload)) {
      if (QUESTION_DROP_KEYS.has(key.toLowerCase())) delete payload[key];
    }
  }

  payload.questionText = source.questionText || source.question || source.name || source.displayName || payload.questionText || "";
  payload.checklistQuestionType = String(
    source.checklistQuestionType || source.questionType || source.type || payload.checklistQuestionType || "6"
  );
  payload.zIndex = coerceNumber(source.zIndex, index);
  payload.isCompulsory = coerceBoolean(source.isCompulsory ?? source.isRequired, Boolean(payload.isCompulsory));

  if (source.defaultIssueTypeId !== undefined) {
    payload.defaultIssueTypeId = stringValue(source.defaultIssueTypeId);
  }
  if (source.dropdownOptions !== undefined) {
    payload.dropdownOptions = coerceOptions(source.dropdownOptions);
  }
  if (source.answerOptions !== undefined && source.dropdownOptions === undefined) {
    payload.dropdownOptions = coerceOptions(source.answerOptions);
  }
  if (!Array.isArray(payload.localisedNames)) payload.localisedNames = [];
  if (payload.dropdownOptions === undefined) payload.dropdownOptions = null;
  if (payload.dropdownAuditScores === undefined) payload.dropdownAuditScores = null;

  delete payload.question;
  delete payload.questionId;
  delete payload.name;
  delete payload.displayName;
  delete payload.questionType;
  delete payload.type;
  delete payload.isRequired;
  delete payload.answerOptions;

  return payload;
}

function defaultQuestionPayload(index) {
  return {
    questionText: "",
    checklistQuestionType: "6",
    zIndex: index,
    isCompulsory: false,
    inspectionTypeId: "",
    yesText: "Yes",
    noText: "No",
    naText: "N/A",
    auditScoreOnYes: "",
    auditScoreOnNo: "",
    auditScoreOnNa: "",
    signatureOnYes: false,
    signatureOnNo: false,
    signatureOnNa: false,
    raiseIssueOnYes: false,
    raiseIssueOnNo: false,
    raiseIssueOnNa: false,
    additionalDetailsRequiredForYes: false,
    additionalDetailsRequiredForNo: false,
    additionalDetailsRequiredForNa: false,
    issueCompulsoryOnYes: false,
    issueCompulsoryOnNo: false,
    issueCompulsoryOnNa: false,
    issueDefaultObservationTypeOnYes: "0",
    issueDefaultObservationTypeOnNo: "0",
    issueDefaultObservationTypeOnNa: "0",
    isIssueDefaultObservationTypeOnYesLocked: false,
    isIssueDefaultObservationTypeOnNoLocked: false,
    isIssueDefaultObservationTypeOnNaLocked: false,
    defaultIssueTypeId: "",
    isDefaultIssueTypeForced: false,
    defaultIssuePriority: "",
    imageId: "",
    localisedNames: [],
    dropdownOptions: null,
    enableDropdownAuditScore: false,
    dropdownAuditScores: null,
    excludeFromChecklistCompleteCheck: false,
    raiseObservationOnYesOption: 0,
    raiseObservationOnNoOption: 0,
    raiseObservationOnNaOption: 0,
    inputValidationErrors: {}
  };
}

async function buildChecklistNameToId(client, tenant) {
  const items = await listInspectionChecklists(client, tenant);
  const map = new Map();
  for (const item of items) {
    if (item.name && item.id) map.set(normalizeName(item.name), item.id);
  }
  return map;
}

function sanitize(obj, { includeReadOnly = false } = {}) {
  if (Array.isArray(obj)) return obj.map((item) => sanitize(item, { includeReadOnly }));
  if (!obj || typeof obj !== "object") return obj;
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    if (!includeReadOnly && READONLY_KEYS.has(key.toLowerCase())) continue;
    out[key] = sanitize(value, { includeReadOnly });
  }
  return out;
}

function sanitizeQuestion(question) {
  const sanitized = sanitize(question);
  if (!sanitized || typeof sanitized !== "object" || Array.isArray(sanitized)) return sanitized;
  for (const key of Object.keys(sanitized)) {
    if (QUESTION_DROP_KEYS.has(key.toLowerCase())) delete sanitized[key];
  }
  return sanitized;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

function coerceSpreadsheetValue(value) {
  if (value === "__null__") return null;
  const text = String(value || "").trim();
  if (/^(true|false|yes|no|y|n)$/i.test(text)) return coerceBoolean(text, false);
  if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text);
  if (text.includes("|")) return splitList(text);
  return text;
}

function coerceBoolean(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  const text = String(value).trim().toLowerCase();
  if (["true", "t", "yes", "y", "1"].includes(text)) return true;
  if (["false", "f", "no", "n", "0"].includes(text)) return false;
  return fallback;
}

function coerceNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function splitList(value) {
  return String(value || "")
    .split(/[\n;,|]+/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function coerceOptions(value) {
  if (value === null || value === undefined || value === "") return null;
  if (Array.isArray(value)) return value;
  const text = String(value).trim();
  if (!text) return null;
  if (/^[\[{]/.test(text)) {
    try {
      return JSON.parse(text);
    } catch {
      return splitList(text);
    }
  }
  return splitList(text);
}

function stringValue(value) {
  if (value === "__null__") return "";
  return String(value || "").trim();
}

function normalizeName(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}
