export const USER_CREATE_FIELDS = [
  "email",
  "name",
  "mobile",
  "title",
  "roleNames",
  "isRegionAdmin",
  "internalIdentifier",
  "userProjectIds",
  "regionAdminRegionIds",
  "isAddToFutureProjects",
  "addUserToFutureProjectsInRegionIds",
  "isAddToFutureProjectsInOtherRegions",
  "receiveSiteNotificationProjectIds",
  "receiveSiteNotificationFutureProjectsInRegionIds",
  "isReceiveSiteNotificationsForFutureUnspecifiedProjects",
  "isReceiveSiteNotificationsForFutureProjects",
  "confidentialDataAccessProjectIds",
  "confidentialDataAccessFutureProjectsInRegionIds",
  "isAccessConfidentialDataForFutureProjects",
  "isAccessConfidentialDataForFutureUnspecifiedProjects",
  "hasIndividualSiteDiaryProjectIds",
  "hasIndividualSiteDiaryFutureProjectsInRegionIds",
  "hasIndividualSiteDiaryFutureProjectsWithoutRegion",
  "isSiteDiaryAdminProjectIds",
  "isSiteDiaryAdminFutureProjectsInRegionIds",
  "isSiteDiaryAdminFutureProjectsWithoutRegion",
  "isProjectAdminProjectIds",
  "functionIds",
  "customUserPermissionSetId",
  "regionCustomUserPermissionSetId",
  "projectAdminCustomUserPermissionSetId"
];

export const USER_PATCH_FIELDS = [
  "isRegionAdmin",
  "functionIds",
  "receiveSiteNotificationProjectIds",
  "userProjectIds",
  "receiveSiteNotificationFutureProjectsInRegionIds",
  "confidentialDataAccessFutureProjectsInRegionIds",
  "isAddToFutureProjectsInOtherRegions",
  "title",
  "customUserPermissionSetId",
  "regionCustomUserPermissionSetId",
  "confidentialDataAccessProjectIds",
  "regionAdminRegionIds",
  "isApplySameUserPermissionSet",
  "roleNames",
  "name",
  "mobile",
  "addUserToFutureProjectsInRegionIds",
  "isAddToFutureProjects",
  "isReceiveSiteNotificationsForFutureUnspecifiedProjects",
  "isAccessConfidentialDataForFutureUnspecifiedProjects",
  "isReceiveSiteNotificationsForFutureProjects",
  "isAccessConfidentialDataForFutureProjects",
  "currentProjectId",
  "isUpdateProfile",
  "resetProjectUsers",
  "projectAdminCustomUserPermissionSetId",
  "isApplySameUserPermissionSetProjectAdmin",
  "internalIdentifier",
  "hasIndividualSiteDiaryProjectIds",
  "hasIndividualSiteDiaryFutureProjectsInRegionIds",
  "hasIndividualSiteDiaryFutureProjectsWithoutRegion",
  "isSiteDiaryAdminProjectIds",
  "isSiteDiaryAdminFutureProjectsInRegionIds",
  "isSiteDiaryAdminFutureProjectsWithoutRegion",
  "isProjectAdminProjectIds"
];

const ARRAY_FIELDS = new Set([
  "roleNames",
  "userProjectIds",
  "regionAdminRegionIds",
  "addUserToFutureProjectsInRegionIds",
  "receiveSiteNotificationProjectIds",
  "receiveSiteNotificationFutureProjectsInRegionIds",
  "confidentialDataAccessProjectIds",
  "confidentialDataAccessFutureProjectsInRegionIds",
  "hasIndividualSiteDiaryProjectIds",
  "hasIndividualSiteDiaryFutureProjectsInRegionIds",
  "isSiteDiaryAdminProjectIds",
  "isSiteDiaryAdminFutureProjectsInRegionIds",
  "isProjectAdminProjectIds",
  "functionIds"
]);

const BOOLEAN_FIELDS = new Set([
  "isRegionAdmin",
  "isAddToFutureProjects",
  "isAddToFutureProjectsInOtherRegions",
  "isReceiveSiteNotificationsForFutureUnspecifiedProjects",
  "isReceiveSiteNotificationsForFutureProjects",
  "isAccessConfidentialDataForFutureProjects",
  "isAccessConfidentialDataForFutureUnspecifiedProjects",
  "hasIndividualSiteDiaryFutureProjectsWithoutRegion",
  "isSiteDiaryAdminFutureProjectsWithoutRegion",
  "isApplySameUserPermissionSet",
  "isUpdateProfile",
  "resetProjectUsers",
  "isApplySameUserPermissionSetProjectAdmin"
]);

const FIELD_ALIASES = buildAliases();
const VALID_ACTIONS = new Set(["create", "update", "patch", "delete", "get", "upsert"]);
const SIMPLE_USER_SETTING_FIELDS = new Set([
  "roleNames",
  "userProjectIds",
  "isRegionAdmin",
  "regionAdminRegionIds",
  "selectedProjectIds",
  "selectedProjectRegionIds",
  "currentRegionAdmin",
  "currentProjectAdmin",
  "currentIndividualDailyReport",
  "currentDailyReportAdmin",
  "currentSiteNotifications",
  "currentConfidentialData",
  "selectedRegionIds",
  "futureAddProjects",
  "futureIndividualDailyReport",
  "futureDailyReportAdmin",
  "futureSiteNotifications",
  "futureConfidentialData"
]);

export function rowToUserOperation(row, { defaultAction = "create", forceAction, rowNumber = 0 } = {}) {
  const warnings = [];
  const normalized = {};

  for (const [header, rawValue] of Object.entries(row)) {
    const value = normalizeCell(rawValue);
    if (value === "") continue;

    const field = resolveHeader(header);
    if (!field) {
      warnings.push(`Unmapped column "${header}" was ignored.`);
      continue;
    }
    normalized[field] = value;
  }

  const action = String(forceAction || normalized.action || defaultAction || "create").trim().toLowerCase();
  const operation = {
    rowNumber,
    action: action === "patch" ? "update" : action,
    id: normalized.id ? String(normalized.id) : "",
    email: normalized.email ? String(normalized.email) : "",
    payload: {},
    warnings,
    errors: []
  };

  if (!VALID_ACTIONS.has(action)) {
    operation.errors.push(`Unsupported action "${action}".`);
  }

  const fields = action === "create" || action === "upsert"
    ? USER_CREATE_FIELDS
    : USER_PATCH_FIELDS;

  for (const field of fields) {
    if (!(field in normalized)) continue;
    try {
      operation.payload[field] = coerceField(field, normalized[field]);
    } catch (error) {
      operation.errors.push(`${field}: ${error.message}`);
    }
  }

  if (operation.action === "create") {
    for (const required of ["email", "name", "title", "roleNames"]) {
      if (operation.payload[required] === undefined || isEmptyValue(operation.payload[required])) {
        operation.errors.push(`Create rows require ${required}.`);
      }
    }
  }

  if ((operation.action === "update" || operation.action === "delete" || operation.action === "get") && !operation.id && !operation.email) {
    operation.errors.push(`${operation.action} rows require id, or email with --match-by-email.`);
  }

  if (operation.action === "upsert" && !operation.email && !operation.payload.internalIdentifier) {
    operation.errors.push("Upsert rows require email or internalIdentifier.");
  }

  if (operation.action === "delete" || operation.action === "get") {
    operation.payload = {};
  }

  return operation;
}

export function planUserOperations(rows, options = {}) {
  const operations = rows.map((row, index) => rowToUserOperation(row, {
    ...options,
    rowNumber: index + 2
  }));
  return {
    operations,
    hasErrors: operations.some((operation) => operation.errors.length > 0)
  };
}

export function planSimpleUserCreateOperations(rows) {
  const operations = rows.map((row, index) => {
    const warnings = [];
    const normalized = {};

    for (const [header, rawValue] of Object.entries(row || {})) {
      const value = normalizeCell(rawValue);
      if (value === "") continue;
      const field = resolveSimpleUserHeader(header);
      if (!field) {
        warnings.push(`Unmapped column "${header}" was ignored.`);
        continue;
      }
      normalized[field] = value;
    }

    const payload = {};
    for (const field of ["email", "name", "title", "mobile", "internalIdentifier"]) {
      if (normalized[field] !== undefined) payload[field] = String(normalized[field]);
    }

    return {
      clientId: `user-${index + 1}`,
      rowNumber: index + 2,
      action: "create",
      email: payload.email || "",
      payload,
      warnings,
      errors: validateSimpleUserBasePayload(payload)
    };
  });

  return {
    operations,
    hasErrors: operations.some((operation) => operation.errors.length > 0)
  };
}

export async function executeSimpleUserCreateOperations(client, operations, {
  apply = false,
  globalSettings = {},
  userSettings = {},
  continueOnError = false
} = {}) {
  const results = [];

  for (const operation of operations || []) {
    const payloadResult = buildSimpleUserCreatePayload(operation, {
      ...(globalSettings || {}),
      ...(userSettings?.[operation.clientId] || {})
    });
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
      const response = await client.createUser(payloadResult.payload);
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

function buildSimpleUserCreatePayload(operation, settings = {}) {
  const payload = { ...(operation?.payload || {}) };
  const errors = [];
  const expandedSettings = expandSimpleUserSettings(settings);

  for (const [field, value] of Object.entries(expandedSettings)) {
    if (!USER_CREATE_FIELDS.includes(field)) continue;
    try {
      payload[field] = coerceField(field, value);
    } catch (error) {
      errors.push(`${field}: ${error.message}`);
    }
  }

  if (payload.isRegionAdmin) {
    const roles = new Set(payload.roleNames || []);
    roles.add("regionadmin");
    payload.roleNames = Array.from(roles);
  }

  errors.push(...validateSimpleUserBasePayload(payload));
  if (isEmptyValue(payload.roleNames)) errors.push("Choose at least one role.");

  return {
    payload,
    errors: uniqueMessages(errors)
  };
}

function expandSimpleUserSettings(settings = {}) {
  const out = {};

  for (const field of ["roleNames", "userProjectIds", "isRegionAdmin", "regionAdminRegionIds"]) {
    if (settings[field] !== undefined && settings[field] !== "") out[field] = settings[field];
  }

  const projectIds = coerceOptionalArray(settings.selectedProjectIds);
  const projectRegionIds = coerceOptionalArray(settings.selectedProjectRegionIds);
  if (projectIds.length) out.userProjectIds = projectIds;

  if (isTruthySetting(settings.currentRegionAdmin)) {
    out.isRegionAdmin = true;
    if (projectRegionIds.length) out.regionAdminRegionIds = projectRegionIds;
  }
  if (isTruthySetting(settings.currentProjectAdmin)) out.isProjectAdminProjectIds = projectIds;
  if (isTruthySetting(settings.currentIndividualDailyReport)) out.hasIndividualSiteDiaryProjectIds = projectIds;
  if (isTruthySetting(settings.currentDailyReportAdmin)) out.isSiteDiaryAdminProjectIds = projectIds;
  if (isTruthySetting(settings.currentSiteNotifications)) out.receiveSiteNotificationProjectIds = projectIds;
  if (isTruthySetting(settings.currentConfidentialData)) out.confidentialDataAccessProjectIds = projectIds;

  const regionIds = coerceOptionalArray(settings.selectedRegionIds);
  if (settings.futureAddProjects !== undefined && settings.futureAddProjects !== "") {
    const addFuture = coerceBoolean(settings.futureAddProjects);
    out.isAddToFutureProjects = addFuture;
    if (addFuture && regionIds.length) out.addUserToFutureProjectsInRegionIds = regionIds;
  }

  if (isTruthySetting(settings.futureIndividualDailyReport)) out.hasIndividualSiteDiaryFutureProjectsInRegionIds = regionIds;
  if (isTruthySetting(settings.futureDailyReportAdmin)) out.isSiteDiaryAdminFutureProjectsInRegionIds = regionIds;
  if (isTruthySetting(settings.futureSiteNotifications)) {
    out.receiveSiteNotificationFutureProjectsInRegionIds = regionIds;
    out.isReceiveSiteNotificationsForFutureProjects = true;
  }
  if (isTruthySetting(settings.futureConfidentialData)) {
    out.confidentialDataAccessFutureProjectsInRegionIds = regionIds;
    out.isAccessConfidentialDataForFutureProjects = true;
  }

  return out;
}

export async function executeUserOperations(client, operations, {
  apply = false,
  matchByEmail = false,
  continueOnError = false
} = {}) {
  const resolver = new UserResolver(client);
  const results = [];

  for (const operation of operations) {
    if (operation.errors.length) {
      const result = { operation, status: "invalid", errors: operation.errors };
      results.push(result);
      if (!continueOnError) break;
      continue;
    }

    if (!apply) {
      results.push({ operation, status: "planned" });
      continue;
    }

    try {
      const response = await executeOperation(client, resolver, operation, { matchByEmail });
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

async function executeOperation(client, resolver, operation, { matchByEmail }) {
  if (operation.action === "create") {
    return client.createUser(operation.payload);
  }

  if (operation.action === "upsert") {
    const existing = await resolver.find(operation);
    if (existing) {
      const patchPayload = filterObject(operation.payload, USER_PATCH_FIELDS);
      return client.patchUser(existing.id, patchPayload);
    }
    return client.createUser(operation.payload);
  }

  const id = operation.id || (matchByEmail ? (await resolver.find(operation))?.id : "");
  if (!id) {
    throw new Error(`Unable to resolve user id for row ${operation.rowNumber}.`);
  }

  if (operation.action === "update") {
    return client.patchUser(id, operation.payload);
  }
  if (operation.action === "delete") {
    return client.deleteUser(id);
  }
  if (operation.action === "get") {
    return client.getUser(id);
  }

  throw new Error(`Unsupported action "${operation.action}".`);
}

class UserResolver {
  constructor(client) {
    this.client = client;
    this.usersPromise = null;
  }

  async find(operation) {
    if (operation.payload.internalIdentifier) {
      const found = await this.byInternalIdentifier(operation.payload.internalIdentifier);
      if (found) return found;
    }

    const users = await this.allUsers();
    if (operation.id) {
      return users.find((user) => equalsIgnoreCase(user.id, operation.id));
    }
    if (operation.email) {
      return users.find((user) => equalsIgnoreCase(user.email, operation.email));
    }
    return null;
  }

  async allUsers() {
    if (!this.usersPromise) {
      this.usersPromise = listAllUsers(this.client);
    }
    return this.usersPromise;
  }

  async byInternalIdentifier(internalIdentifier) {
    const users = await listAllUsers(this.client, { internalIdentifier });
    return users[0] || null;
  }
}

export async function listAllUsers(client, query = {}) {
  const all = [];
  const take = Number(query.take || 100);
  let skip = Number(query.skip || 0);

  while (true) {
    const page = await client.listUsers({
      ...query,
      skip,
      take,
      includeNotAssigned: query.includeNotAssigned ?? true
    });
    if (!Array.isArray(page)) {
      throw new Error("List Users response was not an array.");
    }
    all.push(...page);
    if (page.length < take) break;
    skip += take;
  }

  return all;
}

function coerceField(field, value) {
  if (value === "__null__") return null;
  if (ARRAY_FIELDS.has(field)) return coerceArray(value);
  if (BOOLEAN_FIELDS.has(field)) return coerceBoolean(value);
  return String(value);
}

function coerceArray(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  const text = String(value || "").trim();
  if (!text) return [];
  if (text.startsWith("[") && text.endsWith("]")) {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) throw new Error("Expected a JSON array.");
    return parsed.map((item) => String(item).trim()).filter(Boolean);
  }
  return text.split(/[\n;,]+/g).map((item) => item.trim()).filter(Boolean);
}

function coerceOptionalArray(value) {
  if (value === undefined || value === null || value === "") return [];
  return coerceArray(value);
}

function coerceBoolean(value) {
  if (typeof value === "boolean") return value;
  const text = String(value || "").trim().toLowerCase();
  if (["true", "t", "yes", "y", "1"].includes(text)) return true;
  if (["false", "f", "no", "n", "0"].includes(text)) return false;
  throw new Error(`Expected boolean value, received "${value}".`);
}

function isTruthySetting(value) {
  if (value === undefined || value === null || value === "") return false;
  return coerceBoolean(value);
}

function normalizeCell(value) {
  if (value === null || value === undefined) return "";
  const text = String(value).trim();
  return text.toLowerCase() === "null" ? "__null__" : text;
}

function resolveHeader(header) {
  const key = normalizeHeader(header);
  return FIELD_ALIASES[key] || null;
}

function resolveSimpleUserHeader(header) {
  const key = normalizeHeader(header);
  if (["email", "name", "title", "mobile"].includes(key)) return key;
  if (["internalid", "internalidentifier", "internaluserid", "employeeid"].includes(key)) return "internalIdentifier";
  return FIELD_ALIASES[key] && ["email", "name", "title", "mobile", "internalIdentifier"].includes(FIELD_ALIASES[key])
    ? FIELD_ALIASES[key]
    : null;
}

function normalizeHeader(header) {
  return String(header || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function buildAliases() {
  const aliases = new Map();
  const add = (canonical, ...names) => {
    aliases.set(normalizeHeader(canonical), canonical);
    for (const name of names) aliases.set(normalizeHeader(name), canonical);
  };

  add("action", "operation");
  add("id", "userId", "user id", "hammertechUserId");
  for (const field of new Set([...USER_CREATE_FIELDS, ...USER_PATCH_FIELDS])) add(field);
  add("name", "fullName", "full name");
  add("internalIdentifier", "internalId", "internal id", "internalID", "employeeId", "employee id");
  add("roleNames", "roles", "role names", "role");
  add("userProjectIds", "projectIds", "project ids", "projects");
  add("regionAdminRegionIds", "regionIds", "region ids", "adminRegionIds");
  add("functionIds", "functions", "function ids");

  return Object.fromEntries(aliases.entries());
}

function isEmptyValue(value) {
  return value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
}

function validateSimpleUserBasePayload(payload) {
  const errors = [];
  for (const required of ["email", "name", "title"]) {
    if (payload?.[required] === undefined || isEmptyValue(payload[required])) {
      errors.push(`Spreadsheet rows require ${required}.`);
    }
  }
  return errors;
}

function uniqueMessages(messages) {
  return Array.from(new Set(messages.filter(Boolean)));
}

function equalsIgnoreCase(left, right) {
  return String(left || "").toLowerCase() === String(right || "").toLowerCase();
}

function filterObject(object, allowedKeys) {
  const allowed = new Set(allowedKeys);
  return Object.fromEntries(Object.entries(object).filter(([key]) => allowed.has(key)));
}
