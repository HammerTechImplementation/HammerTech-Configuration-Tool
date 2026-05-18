const CREATE_FIELDS = [
  "id",
  "customFieldFormId",
  "projectId",
  "employerId",
  "inductionDate",
  "serviceRecordAvailable",
  "isGoodCondition",
  "damageComments",
  "dateUpdated",
  "dateRemovedFromSite",
  "uniqueCode",
  "isInspectionFailed",
  "approvedByUserId",
  "approvalTime",
  "rejectedDate",
  "rejectedByUserId",
  "submittedByUserId",
  "isRequiresApproval",
  "signatureStoredFileId",
  "signatureName",
  "averageWorkingDaysPerWeek",
  "averageWorkingHoursPerDay",
  "reviewerNotes",
  "employerNotes",
  "equipmentProfileId",
  "lastModifiedDate",
  "isDraft",
  "customFieldValues",
  "otherEmployerIds",
  "associatedWorkerIds",
  "associatedSwmsIds",
  "checklistAnswers",
  "inductionAction"
];

const PATCH_FIELDS = [
  "projectId",
  "employerId",
  "inductionDate",
  "serviceRecordAvailable",
  "isGoodCondition",
  "damageComments",
  "dateUpdated",
  "dateRemovedFromSite",
  "uniqueCode",
  "isInspectionFailed",
  "approvedByUserId",
  "approvalTime",
  "rejectedDate",
  "rejectedByUserId",
  "submittedByUserId",
  "isRequiresApproval",
  "signatureStoredFileId",
  "signatureName",
  "averageWorkingDaysPerWeek",
  "averageWorkingHoursPerDay",
  "reviewerNotes",
  "employerNotes",
  "equipmentProfileId",
  "lastModifiedDate",
  "isDraft",
  "customFieldValues",
  "otherEmployerIds",
  "associatedWorkerIds",
  "associatedSwmsIds",
  "checklistAnswerSetRequest",
  "inductionAction"
];

const REQUIRED_CREATE_FIELDS = [
  "projectId",
  "equipmentProfileId",
  "inductionDate",
  "dateUpdated",
  "serviceRecordAvailable",
  "isGoodCondition",
  "isInspectionFailed"
];

const BOOLEAN_FIELDS = new Set([
  "serviceRecordAvailable",
  "isGoodCondition",
  "isInspectionFailed",
  "isRequiresApproval",
  "isDraft"
]);

const NUMBER_FIELDS = new Set([
  "averageWorkingDaysPerWeek",
  "averageWorkingHoursPerDay"
]);

const ARRAY_FIELDS = new Set([
  "customFieldValues",
  "otherEmployerIds",
  "associatedWorkerIds",
  "associatedSwmsIds",
  "checklistAnswers",
  "checklistAnswerSetRequest"
]);

const INDUCTION_ACTIONS = ["Draft", "Reject", "SubmitForApproval", "Accept"];

export function buildEquipmentInductionCreateOperations({
  equipmentProfileIds = [],
  projectIds = [],
  settings = {},
  equipmentOverrides = {}
} = {}) {
  const globalProjectIds = uniqueStrings(projectIds);
  const equipmentIds = uniqueStrings(equipmentProfileIds);
  const operations = [];

  for (const equipmentProfileId of equipmentIds) {
    const override = equipmentOverrides[equipmentProfileId] || {};
    const targetProjectIds = uniqueStrings(override.projectIds).length
      ? uniqueStrings(override.projectIds)
      : globalProjectIds;
    const merged = {
      ...settings,
      ...withoutEmptyValues(override)
    };
    delete merged.projectIds;

    if (!targetProjectIds.length) {
      const operation = baseOperation(equipmentProfileId, "");
      operation.errors.push("Select at least one project.");
      operations.push(operation);
      continue;
    }

    for (const projectId of targetProjectIds) {
      const operation = baseOperation(equipmentProfileId, projectId);
      try {
        operation.payload = normalizeEquipmentInductionCreatePayload({
          ...merged,
          equipmentProfileId,
          projectId
        });
      } catch (error) {
        operation.errors.push(error.message);
      }
      operations.push(operation);
    }
  }

  if (!equipmentIds.length) {
    operations.push({
      action: "create",
      equipmentProfileId: "",
      projectId: "",
      payload: {},
      errors: ["Select at least one equipment profile."]
    });
  }

  return {
    operations,
    hasErrors: operations.some((operation) => operation.errors.length > 0)
  };
}

export function normalizeEquipmentInductionCreatePayload(raw = {}) {
  const source = {
    ...raw,
    dateUpdated: raw.dateUpdated || raw.inductionDate
  };
  const payload = normalizeAllowedPayload(source, CREATE_FIELDS);
  for (const field of REQUIRED_CREATE_FIELDS) {
    if (payload[field] === undefined || payload[field] === null || payload[field] === "") {
      throw new Error(`Create equipment inductions require ${field}.`);
    }
  }
  return payload;
}

export function normalizeEquipmentInductionPatchPayload(raw = {}) {
  return normalizeAllowedPayload(raw, PATCH_FIELDS);
}

export async function listAllEquipmentInductions(client, query = {}) {
  const all = [];
  const take = Number(query.take || 100);
  let skip = Number(query.skip || 0);

  while (true) {
    const page = await client.listEquipmentInductions({
      ...query,
      skip,
      take
    });
    if (!Array.isArray(page)) throw new Error("List response was not an array.");
    all.push(...page);
    if (page.length < take) break;
    skip += take;
  }

  return all;
}

export async function executeEquipmentInductionCreateOperations(client, operations, {
  continueOnError = false,
  skipExisting = true
} = {}) {
  const results = [];
  const existing = skipExisting ? await existingInductionKeys(client, operations) : new Set();

  for (const operation of operations) {
    if (operation.errors.length) {
      results.push({ operation, status: "invalid", errors: operation.errors });
      if (!continueOnError) break;
      continue;
    }

    const key = inductionKey(operation.payload);
    if (existing.has(key)) {
      results.push({ operation, status: "skipped", message: "Equipment is already assigned to this project." });
      continue;
    }

    try {
      const response = await client.createEquipmentInduction(operation.payload);
      existing.add(key);
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

function baseOperation(equipmentProfileId, projectId) {
  return {
    action: "create",
    equipmentProfileId,
    projectId,
    payload: {},
    errors: []
  };
}

async function existingInductionKeys(client, operations) {
  const projectIds = uniqueStrings(operations.map((operation) => operation.payload?.projectId));
  const keys = new Set();

  for (const projectId of projectIds) {
    const inductions = await listAllEquipmentInductions(client, {
      projectId,
      includeDeleted: false
    });
    for (const induction of inductions) {
      const key = inductionKey({
        projectId: induction.project?.id || induction.projectId || projectId,
        equipmentProfileId: induction.equipmentProfile?.id || induction.equipmentProfileId
      });
      if (key) keys.add(key);
    }
  }

  return keys;
}

function normalizeAllowedPayload(raw, allowedFields) {
  const payload = {};
  const allowed = new Set(allowedFields);
  for (const [key, value] of Object.entries(raw || {})) {
    if (!allowed.has(key) || value === undefined || value === "") continue;
    payload[key] = coerceField(key, value);
  }
  return payload;
}

function coerceField(field, value) {
  if (value === "__null__" || value === null) return null;
  if (BOOLEAN_FIELDS.has(field)) return coerceBoolean(value);
  if (NUMBER_FIELDS.has(field)) return coerceNumber(value);
  if (ARRAY_FIELDS.has(field)) return coerceArray(value);
  if (field === "inductionAction") return coerceEnum(value, INDUCTION_ACTIONS);
  return String(value).trim();
}

function coerceBoolean(value) {
  if (typeof value === "boolean") return value;
  const text = String(value || "").trim().toLowerCase();
  if (["true", "t", "yes", "y", "1"].includes(text)) return true;
  if (["false", "f", "no", "n", "0"].includes(text)) return false;
  throw new Error(`Expected boolean value, received "${value}".`);
}

function coerceNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`Expected number value, received "${value}".`);
  return number;
}

function coerceArray(value) {
  if (Array.isArray(value)) return value.map((item) => typeof item === "string" ? item.trim() : item).filter((item) => item !== "");
  const text = String(value || "").trim();
  if (!text) return [];
  if (/^[\[{]/.test(text)) return JSON.parse(text);
  return text.split(/[\n;,]+/g).map((item) => item.trim()).filter(Boolean);
}

function coerceEnum(value, allowed) {
  const text = String(value || "").trim();
  const match = allowed.find((item) => item.toLowerCase() === text.toLowerCase());
  if (!match) throw new Error(`Expected one of ${allowed.join(", ")}, received "${value}".`);
  return match;
}

function uniqueStrings(values) {
  return Array.from(new Set(arrayValue(values).map((value) => String(value || "").trim()).filter(Boolean)));
}

function arrayValue(value) {
  if (Array.isArray(value)) return value;
  return value === undefined || value === null || value === "" ? [] : [value];
}

function withoutEmptyValues(object = {}) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => {
    return Array.isArray(value) ? value.length > 0 : value !== undefined && value !== "";
  }));
}

function inductionKey(payload = {}) {
  const projectId = String(payload.projectId || "").trim();
  const equipmentProfileId = String(payload.equipmentProfileId || "").trim();
  return projectId && equipmentProfileId ? `${projectId}:${equipmentProfileId}` : "";
}
