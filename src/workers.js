export const WORKER_PROFILE_FIELD_OPTIONS = [
  { field: "firstName", label: "First Name", required: true, sample: "Jane", aliases: ["first", "givenName"] },
  { field: "lastName", label: "Last Name", required: true, sample: "Safety", aliases: ["last", "surname", "familyName"] },
  { field: "dateOfBirth", label: "Date of Birth", required: true, sample: "1985-04-12", aliases: ["dob", "birthDate"] },
  { field: "jobTitle", label: "Job Title", sample: "Electrician", aliases: ["title", "role"] },
  { field: "jobTitleId", label: "Job Title ID", sample: "", aliases: ["jobTitleID"] },
  { field: "email", label: "Email", sample: "jane.safety@example.com", aliases: ["emailAddress", "workerEmail"] },
  { field: "mobile", label: "Mobile", sample: "555-0100", aliases: ["cell", "cellPhone", "mobilePhone"] },
  { field: "phone", label: "Phone", sample: "555-0199", aliases: ["landline", "phoneNumber"] },
  { field: "internalIdentifier", label: "Internal ID", sample: "WKR-1001", aliases: ["internalId", "internalID", "internalIdentifier"] },
  { field: "streetAddress", label: "Street Address", sample: "123 Main St", aliases: ["address", "address1"] },
  { field: "suburb", label: "Suburb", sample: "Austin", aliases: ["city"] },
  { field: "postcode", label: "Postcode", sample: "78701", aliases: ["postCode", "postalCode", "zip", "zipCode"] },
  { field: "state", label: "State", sample: "TX", aliases: ["province"] },
  { field: "country", label: "Country", sample: "US", aliases: [] },
  { field: "emergencyContactName", label: "Emergency Contact Name", sample: "Pat Safety", aliases: [] },
  { field: "emergencyContactPhone", label: "Emergency Contact Phone", sample: "555-0123", aliases: [] },
  { field: "emergencyContactRelationship", label: "Emergency Contact Relationship", sample: "Spouse", aliases: [] },
  { field: "vehicleRegistration", label: "Vehicle Registration", sample: "ABC123", aliases: ["licensePlate", "registrationNumber"] },
  { field: "vehicleMake", label: "Vehicle Make", sample: "Ford", aliases: [] },
  { field: "vehicleModel", label: "Vehicle Model", sample: "F-150", aliases: [] },
  { field: "comments", label: "Comments", sample: "Imported from spreadsheet", aliases: ["notes"] }
];

export const DEFAULT_WORKER_PROFILE_FIELDS = [
  "firstName",
  "lastName",
  "dateOfBirth",
  "jobTitle",
  "email",
  "mobile",
  "internalIdentifier"
];

const REQUIRED_WORKER_PROFILE_FIELDS = new Set(
  WORKER_PROFILE_FIELD_OPTIONS.filter((option) => option.required).map((option) => option.field)
);
const FIELD_OPTIONS_BY_FIELD = new Map(WORKER_PROFILE_FIELD_OPTIONS.map((option) => [option.field, option]));
const FIELD_BY_NORMALIZED_HEADER = buildFieldHeaderMap();

export function workerProfileTemplateCsv(fields = DEFAULT_WORKER_PROFILE_FIELDS) {
  const selectedFields = normalizeSelectedWorkerFields(fields);
  const headers = selectedFields.map((field) => FIELD_OPTIONS_BY_FIELD.get(field)?.label || field);
  const sample = selectedFields.map((field) => FIELD_OPTIONS_BY_FIELD.get(field)?.sample || "");
  return `${csvLine(headers)}\n${csvLine(sample)}\n`;
}

export function planWorkerProfileImportOperations(rows, {
  selectedFields = DEFAULT_WORKER_PROFILE_FIELDS,
  jobTitles = [],
  globalSettings = {}
} = {}) {
  const fields = normalizeSelectedWorkerFields(selectedFields);
  const operations = rows.map((row, index) => rowToWorkerProfileImportOperation(row, {
    selectedFields: fields,
    rowNumber: index + 2,
    jobTitles,
    globalSettings
  }));
  return {
    operations,
    hasErrors: operations.some((operation) => operation.errors.length > 0)
  };
}

export function rowToWorkerProfileImportOperation(row, {
  selectedFields = DEFAULT_WORKER_PROFILE_FIELDS,
  rowNumber = 0,
  jobTitles = [],
  globalSettings = {}
} = {}) {
  const warnings = [];
  const errors = [];
  const normalized = {};

  for (const field of normalizeSelectedWorkerFields(selectedFields)) {
    const value = valueForWorkerField(row, field);
    if (value === "") continue;
    normalized[field] = value;
  }

  const payload = {};
  for (const [field, rawValue] of Object.entries(normalized)) {
    try {
      payload[field] = coerceWorkerProfileField(field, rawValue);
    } catch (error) {
      errors.push(`${field}: ${error.message}`);
    }
  }

  const language = stringValue(globalSettings.preferredCommunicationLanguage) || "en-US";
  payload.preferredCommunicationLanguage = language;

  if (payload.jobTitleId) {
    delete payload.jobTitle;
  } else if (payload.jobTitle) {
    const match = findJobTitleByName(jobTitles, payload.jobTitle);
    if (match) {
      payload.jobTitleId = match.id;
      delete payload.jobTitle;
    } else {
      warnings.push(`Job title "${payload.jobTitle}" was not matched to a reference ID and will be sent as custom text.`);
    }
  }

  for (const field of REQUIRED_WORKER_PROFILE_FIELDS) {
    if (isEmptyValue(payload[field])) {
      const label = FIELD_OPTIONS_BY_FIELD.get(field)?.label || field;
      errors.push(`${label} is required.`);
    }
  }

  return {
    clientId: `worker-${rowNumber || 0}`,
    rowNumber,
    action: "create",
    name: [payload.firstName, payload.lastName].filter(Boolean).join(" "),
    payload,
    jobTitleMatch: jobTitleMatchSummary(normalized.jobTitle, payload.jobTitleId, jobTitles),
    warnings,
    errors
  };
}

export async function executeWorkerProfileImportOperations(client, operations, {
  apply = false,
  continueOnError = false,
  globalSettings = {},
  workerSettings = {}
} = {}) {
  const settings = normalizeWorkerImportSettings(globalSettings);
  const results = [];

  for (const operation of operations || []) {
    const override = workerSettings?.[operation.clientId] || {};
    const payload = {
      ...(operation.payload || {})
    };
    payload.preferredCommunicationLanguage = settings.preferredCommunicationLanguage || payload.preferredCommunicationLanguage || "en-US";

    const assignmentPayload = {
      projectId: settings.projectId,
      employerId: stringValue(override.employerId) || settings.defaultEmployerId,
      sendTest: settings.sendTest
    };
    const errors = [...(operation.errors || [])];
    if (!assignmentPayload.projectId) errors.push("Select one assigning project.");
    if (!assignmentPayload.employerId) errors.push("Select an employer for this worker.");

    const operationWithPayload = {
      ...operation,
      payload,
      assignmentPayload,
      errors
    };

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
      const profileResponse = await client.createWorkerProfile(payload);
      const workerProfileId = extractCreatedEntityId(profileResponse);
      if (!workerProfileId) {
        throw new Error(`Worker profile created but no createdEntityId was returned.`);
      }
      const workerPayload = {
        ...assignmentPayload,
        workerProfileId
      };
      const workerResponse = await client.createWorker(workerPayload);
      results.push({
        operation: {
          ...operationWithPayload,
          assignmentPayload: workerPayload
        },
        status: "success",
        workerProfileId,
        profileResponse,
        workerResponse
      });
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

export async function listAllReferenceJobTitles(client, query = {}) {
  const items = await listAll((params) => client.listReferenceJobTitles(params), query);
  return dedupeById(items.map(normalizeReferenceJobTitle).filter((item) => item.id || item.name))
    .sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));
}

export async function listAllEmployers(client, query = {}) {
  const items = await listAll((params) => client.listEmployers(params), query);
  return dedupeById(items.map(normalizeEmployer).filter((item) => item.id || item.name))
    .sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));
}

export function normalizeReferenceJobTitle(item = {}) {
  return {
    id: stringValue(item.id || item.jobTitleId || item.jobTitleID),
    name: stringValue(item.name || item.title || item.jobTitle)
  };
}

export function normalizeEmployer(item = {}) {
  const profile = item.employerProfile || item.EmployerProfile || item.profile || {};
  const project = item.project || item.Project || {};
  return {
    id: stringValue(item.id || item.employerId || item.EmployerId),
    name: stringValue(
      profile.businessName
      || profile.name
      || item.businessName
      || item.name
      || item.employerName
    ),
    employerProfileId: stringValue(profile.id || item.employerProfileId),
    projectId: stringValue(project.id || item.projectId || item.ProjectId),
    projectName: stringValue(project.name || item.projectName),
    internalIdentifier: stringValue(profile.internalIdentifier || item.internalIdentifier),
    isHistoric: Boolean(item.isHistoric),
    deactivatedDate: stringValue(item.deactivatedDate || profile.deactivatedDate)
  };
}

export function normalizeSelectedWorkerFields(fields = DEFAULT_WORKER_PROFILE_FIELDS) {
  const selected = [];
  for (const field of fields || []) {
    const normalizedField = resolveWorkerField(field);
    if (normalizedField && !selected.includes(normalizedField)) selected.push(normalizedField);
  }

  for (const required of REQUIRED_WORKER_PROFILE_FIELDS) {
    if (!selected.includes(required)) selected.unshift(required);
  }

  if (!selected.length) return [...DEFAULT_WORKER_PROFILE_FIELDS];
  return selected.filter((field) => FIELD_OPTIONS_BY_FIELD.has(field));
}

export function normalizeWorkerImportSettings(settings = {}) {
  return {
    preferredCommunicationLanguage: stringValue(settings.preferredCommunicationLanguage) || "en-US",
    projectId: stringValue(settings.projectId),
    defaultEmployerId: stringValue(settings.defaultEmployerId || settings.employerId),
    sendTest: coerceBoolean(settings.sendTest)
  };
}

export function extractCreatedEntityId(response) {
  if (!response || typeof response !== "object") return "";
  const candidates = [
    response.createdEntityId,
    Array.isArray(response.createdEntityIds) ? response.createdEntityIds[0] : "",
    response.id,
    response.workerProfileId,
    response.workerProfile?.id,
    response.data?.id,
    response.result?.id
  ];
  return stringValue(candidates.find((candidate) => stringValue(candidate)));
}

function valueForWorkerField(row, field) {
  for (const [header, rawValue] of Object.entries(row || {})) {
    const resolved = resolveWorkerField(header);
    if (resolved === field) return stringValue(rawValue);
  }
  return "";
}

function resolveWorkerField(value) {
  const key = normalizeHeader(value);
  if (!key) return "";
  if (FIELD_BY_NORMALIZED_HEADER.has(key)) return FIELD_BY_NORMALIZED_HEADER.get(key);
  for (const option of WORKER_PROFILE_FIELD_OPTIONS) {
    if (normalizeHeader(option.field) === key) return option.field;
  }
  return "";
}

function coerceWorkerProfileField(field, value) {
  if (field === "dateOfBirth") return normalizeDateOfBirth(value);
  return stringValue(value);
}

export function normalizeDateOfBirth(value) {
  const text = stringValue(value);
  if (!text) return "";

  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}T00:00:00`;

  const usMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (usMatch) {
    const [, month, day, year] = usMatch;
    return `${year}-${pad2(month)}-${pad2(day)}T00:00:00`;
  }

  const compactMatch = text.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (compactMatch) {
    const [, month, day, year] = compactMatch;
    return `${year}-${pad2(month)}-${pad2(day)}T00:00:00`;
  }

  throw new Error(`Unsupported date format "${text}". Use YYYY-MM-DD or MM/DD/YYYY.`);
}

function findJobTitleByName(jobTitles, name) {
  const target = normalizeName(name);
  if (!target) return null;
  return (jobTitles || [])
    .map(normalizeReferenceJobTitle)
    .find((item) => normalizeName(item.name) === target) || null;
}

function jobTitleMatchSummary(rawJobTitle, jobTitleId, jobTitles) {
  const titleText = stringValue(rawJobTitle);
  if (!titleText && !jobTitleId) return { status: "not-provided" };
  if (jobTitleId) {
    const match = (jobTitles || []).map(normalizeReferenceJobTitle).find((item) => item.id === jobTitleId);
    return {
      status: "matched",
      id: jobTitleId,
      name: match?.name || titleText || jobTitleId
    };
  }
  return {
    status: "custom",
    name: titleText
  };
}

async function listAll(fetchPage, query = {}) {
  const all = [];
  const take = Math.min(Number(query.take || 100), 100);
  let skip = Number(query.skip || 0);

  for (let page = 0; page < 1000; page += 1) {
    const items = await fetchPage({
      ...query,
      skip,
      take
    });
    if (!Array.isArray(items)) throw new Error("List response was not an array.");
    all.push(...items);
    if (items.length < take) break;
    skip += take;
  }

  return all;
}

function buildFieldHeaderMap() {
  const map = new Map();
  for (const option of WORKER_PROFILE_FIELD_OPTIONS) {
    map.set(normalizeHeader(option.field), option.field);
    map.set(normalizeHeader(option.label), option.field);
    for (const alias of option.aliases || []) map.set(normalizeHeader(alias), option.field);
  }
  return map;
}

function dedupeById(items) {
  const seen = new Set();
  const output = [];
  for (const item of items) {
    const key = item.id || normalizeName(item.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output;
}

function csvLine(values) {
  return values.map((value) => {
    const text = String(value ?? "");
    return /[",\r\n]/.test(text) ? `"${text.replaceAll("\"", "\"\"")}"` : text;
  }).join(",");
}

function normalizeHeader(value) {
  return stringValue(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeName(value) {
  return stringValue(value).toLowerCase().replace(/\s+/g, " ").trim();
}

function stringValue(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function isEmptyValue(value) {
  return value === undefined || value === null || String(value).trim() === "";
}

function coerceBoolean(value) {
  if (typeof value === "boolean") return value;
  const text = stringValue(value).toLowerCase();
  return ["true", "t", "yes", "y", "1", "on"].includes(text);
}

function pad2(value) {
  return String(value).padStart(2, "0");
}
