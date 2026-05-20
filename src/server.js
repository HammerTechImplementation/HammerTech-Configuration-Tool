#!/usr/bin/env node

import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { normalizeRegion, resolveAuthOptions } from "./config.js";
import {
  executeBulkYesNoChecklistUpdate,
  executeInspectionChecklistOperations,
  executeSimpleInspectionChecklistCreateOperations,
  getInspectionChecklist,
  listInspectionObservationTypes,
  listInspectionChecklists,
  planInspectionChecklistOperations,
  planSimpleInspectionChecklistCreateOperations,
  tenantHost
} from "./checklists.js";
import {
  executeEntityCreateOperations,
  getEntityConfig,
  listAllEmployerProfiles,
  listAllEquipmentProfiles,
  listAllProjects,
  normalizePatchPayload,
  planEntityCreateOperations
} from "./entities.js";
import {
  buildEquipmentInductionCreateOperations,
  executeEquipmentInductionCreateOperations,
  listAllEquipmentInductions,
  normalizeEquipmentInductionPatchPayload
} from "./equipment-inductions.js";
import { CookieJar, HammerTechClient } from "./http.js";
import {
  deleteJobTitle,
  executeJobTitleCreateOperations,
  listJobTitles,
  planJobTitleCreateOperations
} from "./job-titles.js";
import {
  deleteLicenseType,
  executeBulkLicenseTypeUpdate,
  executeLicenseTypeCreateOperations,
  listLicenseCategories,
  listLicenseTypes,
  planLicenseTypeCreateOperations
} from "./license-types.js";
import {
  executeBulkObservationTypeUpdate,
  executeSimpleObservationTypeCreateOperations,
  getObservationType,
  listIssueCategories,
  listObservationTypes,
  planSimpleObservationTypeCreateOperations
} from "./observations.js";
import {
  deleteRegion,
  executeBulkRegionUpdate,
  executeRegionCreateOperations,
  listAllRegions,
  planRegionCreateOperations
} from "./regions.js";
import { readSpreadsheetRowsFromBuffer } from "./spreadsheet.js";
import { clientFromSession, deleteSession, loadSession, saveSession } from "./session.js";
import { authenticateUiSession } from "./ui-auth.js";
import {
  executeSimpleUserCreateOperations,
  executeUserOperations,
  listAllUsers,
  planSimpleUserCreateOperations,
  planUserOperations
} from "./users.js";
import {
  executeWorkerProfileImportOperations,
  listAllEmployers,
  listAllReferenceJobTitles,
  planWorkerProfileImportOperations,
  workerProfileTemplateCsv
} from "./workers.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = resolve(__dirname, "..");
const publicRoot = join(projectRoot, "public");
const defaultSessionPath = ".hammertech/session.json";
const maxBodyBytes = 25 * 1024 * 1024;

export function createAppServer({ sessionPath = process.env.HAMMERTECH_SESSION_PATH || defaultSessionPath } = {}) {
  return createServer(async (request, response) => {
    try {
      await route(request, response, { sessionPath });
    } catch (error) {
      sendJson(response, error.statusCode || 500, {
        error: error.message || "Unexpected server error",
        responseBody: error.responseBody
      });
    }
  });
}

async function route(request, response, context) {
  const url = new URL(request.url, "http://127.0.0.1");

  if (url.pathname.startsWith("/api/")) {
    return routeApi(request, response, url, context);
  }

  return serveStatic(request, response, url);
}

async function routeApi(request, response, url, context) {
  if (request.method === "GET" && url.pathname === "/api/session") {
    const session = await loadSession(context.sessionPath);
    return sendJson(response, 200, summarizeSession(session));
  }

  if (request.method === "GET" && url.pathname.startsWith("/api/templates/")) {
    const templateEntity = url.pathname.slice("/api/templates/".length).replace(/\.csv$/i, "");
    const content = await readFile(join(projectRoot, "docs", templateFileFor(templateEntity)), "utf8");
    response.writeHead(200, {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="hammertech-${templateEntity}-template.csv"`,
      "cache-control": "no-store"
    });
    response.end(content);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/worker-profiles/template") {
    const fields = selectedWorkerFieldsFromUrl(url);
    const content = workerProfileTemplateCsv(fields.length ? fields : undefined);
    response.writeHead(200, {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="hammertech-worker-profiles-template.csv"`,
      "cache-control": "no-store"
    });
    response.end(content);
    return;
  }

  if (request.method === "DELETE" && url.pathname === "/api/session") {
    await deleteSession(context.sessionPath);
    return sendJson(response, 200, { authenticated: false });
  }

  if (request.method === "POST" && url.pathname === "/api/auth/token") {
    const body = await readJsonBody(request);
    const client = await HammerTechClient.authenticate(body);
    if (body.saveSession !== false) {
      await saveSession(context.sessionPath, client.toSession({ tenant: body.tenant, email: body.email }));
    }
    return sendJson(response, 200, summarizeSession(client.toSession({ tenant: body.tenant, email: body.email })));
  }

  if (request.method === "POST" && url.pathname === "/api/auth/browser-cookie") {
    const body = await readJsonBody(request);
    const session = await saveBrowserCookieSession(context.sessionPath, body);
    return sendJson(response, 200, summarizeSession(session));
  }

  if (request.method === "POST" && url.pathname === "/api/auth/ui-session") {
    const body = await readJsonBody(request);
    const session = await createUiSession(context.sessionPath, body);
    return sendJson(response, 200, summarizeSession(session));
  }

  if (request.method === "GET" && url.pathname === "/api/users") {
    const client = await authenticatedClient(context.sessionPath);
    const users = await listAllUsers(client, queryObject(url));
    return sendJson(response, 200, { users });
  }

  if (request.method === "GET" && url.pathname === "/api/projects") {
    const client = await authenticatedClient(context.sessionPath);
    const projects = await listAllProjects(client, queryObject(url));
    return sendJson(response, 200, { projects });
  }

  if (request.method === "GET" && url.pathname === "/api/regions") {
    const client = await authenticatedClient(context.sessionPath);
    const regions = await listAllRegions(client, queryObject(url));
    return sendJson(response, 200, { regions });
  }

  if (request.method === "GET" && url.pathname === "/api/user-import/lookups") {
    const client = await authenticatedClient(context.sessionPath);
    const projects = await listAllProjects(client, { includeArchived: false });
    return sendJson(response, 200, buildUserImportLookups(projects));
  }

  if (request.method === "GET" && url.pathname === "/api/worker-import/lookups") {
    const client = await authenticatedClient(context.sessionPath);
    const [projects, jobTitles] = await Promise.all([
      listAllProjects(client, { includeArchived: false }),
      listAllReferenceJobTitles(client)
    ]);
    return sendJson(response, 200, {
      ...buildUserImportLookups(projects),
      jobTitles
    });
  }

  if (request.method === "GET" && url.pathname === "/api/worker-import/employers") {
    const client = await authenticatedClient(context.sessionPath);
    const projectId = required(url.searchParams.get("projectId"), "projectId");
    const employers = await listAllEmployers(client, { projectId });
    return sendJson(response, 200, { employers });
  }

  if (request.method === "GET" && url.pathname === "/api/employer-profiles") {
    const client = await authenticatedClient(context.sessionPath);
    const employerProfiles = await listAllEmployerProfiles(client, queryObject(url));
    return sendJson(response, 200, { employerProfiles });
  }

  if (request.method === "GET" && url.pathname === "/api/equipment-profiles") {
    const client = await authenticatedClient(context.sessionPath);
    const equipmentProfiles = await listAllEquipmentProfiles(client, queryObject(url));
    return sendJson(response, 200, { equipmentProfiles });
  }

  if (request.method === "GET" && url.pathname === "/api/equipment-inductions") {
    const client = await authenticatedClient(context.sessionPath);
    const equipmentInductions = await listAllEquipmentInductions(client, queryObject(url));
    return sendJson(response, 200, { equipmentInductions });
  }

  if (request.method === "GET" && url.pathname === "/api/inspection-checklists") {
    const session = await uiAuthenticatedSession(context.sessionPath);
    const client = clientFromSession(session);
    const checklists = await listInspectionChecklists(client, required(session.tenant, "tenant"));
    return sendJson(response, 200, { checklists });
  }

  if (request.method === "GET" && url.pathname === "/api/inspection-checklists/observation-types") {
    const session = await uiAuthenticatedSession(context.sessionPath);
    const client = clientFromSession(session);
    return sendJson(response, 200, await listInspectionObservationTypes(client, required(session.tenant, "tenant")));
  }

  if (request.method === "GET" && url.pathname === "/api/observations/lookups") {
    const session = await authenticatedSession(context.sessionPath);
    const client = clientFromSession(session);
    const errors = [];
    let categories = [];
    try {
      categories = await listIssueCategories(client);
    } catch (error) {
      errors.push(`Issue categories: ${error.message}`);
    }
    return sendJson(response, 200, { categories, errors });
  }

  if (request.method === "GET" && url.pathname === "/api/observations") {
    const session = await uiAuthenticatedSession(context.sessionPath);
    const client = clientFromSession(session);
    return sendJson(response, 200, await listObservationTypes(client, required(session.tenant, "tenant")));
  }

  if (request.method === "GET" && url.pathname === "/api/job-titles") {
    const session = await uiAuthenticatedSession(context.sessionPath);
    const client = clientFromSession(session);
    const jobTitles = await listJobTitles(client, required(session.tenant, "tenant"));
    return sendJson(response, 200, { jobTitles });
  }

  if (request.method === "GET" && url.pathname === "/api/license-types") {
    const session = await uiAuthenticatedSession(context.sessionPath);
    const client = clientFromSession(session);
    const licenseTypes = await listLicenseTypes(client, required(session.tenant, "tenant"));
    return sendJson(response, 200, { licenseTypes });
  }

  if (request.method === "GET" && url.pathname === "/api/license-types/categories") {
    const session = await uiAuthenticatedSession(context.sessionPath);
    const client = clientFromSession(session);
    const categories = await listLicenseCategories(client, required(session.tenant, "tenant"));
    return sendJson(response, 200, { categories });
  }

  if (request.method === "POST" && url.pathname === "/api/users") {
    const client = await authenticatedClient(context.sessionPath);
    const body = await readJsonBody(request);
    return sendJson(response, 200, await client.createUser(body));
  }

  if (request.method === "POST" && url.pathname === "/api/users/bulk/update") {
    const client = await authenticatedClient(context.sessionPath);
    const body = await readJsonBody(request);
    const ids = normalizeIds(body.ids);
    const payload = body.payload || {};
    if (!Object.keys(payload).length) throw httpError(400, "Choose at least one field to update.");
    const results = await executeBulk(ids, body.continueOnError, async (id) => {
      return client.patchUser(id, payload, {
        IsResetProjectPermissions: body.resetProjectPermissions ? "true" : undefined
      });
    });
    return sendJson(response, 200, { results });
  }

  if (request.method === "POST" && url.pathname === "/api/users/bulk/delete") {
    const client = await authenticatedClient(context.sessionPath);
    const body = await readJsonBody(request);
    const ids = normalizeIds(body.ids);
    const results = await executeBulk(ids, body.continueOnError, async (id) => client.deleteUser(id));
    return sendJson(response, 200, { results });
  }

  if (request.method === "POST" && url.pathname === "/api/projects/bulk/update") {
    const client = await authenticatedClient(context.sessionPath);
    const body = await readJsonBody(request);
    const ids = normalizeIds(body.ids);
    const payload = normalizePatchPayload("projects", body.payload);
    if (!Object.keys(payload).length) throw httpError(400, "Choose at least one field to update.");
    const results = await executeBulk(ids, body.continueOnError, async (id) => client.patchProject(id, payload));
    return sendJson(response, 200, { results });
  }

  if (request.method === "POST" && url.pathname === "/api/employer-profiles/bulk/update") {
    const client = await authenticatedClient(context.sessionPath);
    const body = await readJsonBody(request);
    const ids = normalizeIds(body.ids);
    const payload = normalizePatchPayload("employer-profiles", body.payload);
    if (!Object.keys(payload).length) throw httpError(400, "Choose at least one field to update.");
    const results = await executeBulk(ids, body.continueOnError, async (id) => client.patchEmployerProfile(id, payload));
    return sendJson(response, 200, { results });
  }

  if (request.method === "POST" && url.pathname === "/api/equipment-profiles/bulk/update") {
    const client = await authenticatedClient(context.sessionPath);
    const body = await readJsonBody(request);
    const ids = normalizeEquipmentProfileIds(body.ids);
    const payload = normalizePatchPayload("equipment-profiles", body.payload);
    if (!Object.keys(payload).length) throw httpError(400, "Choose at least one field to update.");
    const results = await executeBulk(ids, body.continueOnError, async (id) => client.patchEquipmentProfile(id, payload));
    return sendJson(response, 200, { results });
  }

  if (request.method === "POST" && url.pathname === "/api/equipment-profiles/bulk/delete") {
    const client = await authenticatedClient(context.sessionPath);
    const body = await readJsonBody(request);
    const ids = normalizeEquipmentProfileIds(body.ids);
    const results = await executeBulk(ids, body.continueOnError, async (id) => client.deleteEquipmentProfile(id));
    return sendJson(response, 200, { results });
  }

  if (request.method === "POST" && url.pathname === "/api/equipment-inductions/bulk/create") {
    const client = await authenticatedClient(context.sessionPath);
    const body = await readJsonBody(request);
    const plan = buildEquipmentInductionCreateOperations({
      equipmentProfileIds: body.equipmentProfileIds || body.ids || [],
      projectIds: body.projectIds || [],
      settings: body.settings || {},
      equipmentOverrides: body.equipmentOverrides || {}
    });
    const results = await executeEquipmentInductionCreateOperations(client, plan.operations, {
      continueOnError: body.continueOnError,
      skipExisting: body.skipExisting !== false
    });
    return sendJson(response, 200, {
      hasErrors: results.some((result) => ["invalid", "failed"].includes(result.status)),
      results
    });
  }

  if (request.method === "POST" && url.pathname === "/api/equipment-inductions/bulk/update") {
    const client = await authenticatedClient(context.sessionPath);
    const body = await readJsonBody(request);
    const ids = normalizeEquipmentInductionIds(body.ids);
    const payload = normalizeEquipmentInductionPatchPayload(body.payload);
    if (!Object.keys(payload).length) throw httpError(400, "Choose at least one induction field to update.");
    const results = await executeBulk(ids, body.continueOnError, async (id) => client.patchEquipmentInduction(id, payload));
    return sendJson(response, 200, { results });
  }

  if (request.method === "POST" && url.pathname === "/api/equipment-inductions/bulk/delete") {
    const client = await authenticatedClient(context.sessionPath);
    const body = await readJsonBody(request);
    const ids = normalizeEquipmentInductionIds(body.ids);
    const results = await executeBulk(ids, body.continueOnError, async (id) => client.deleteEquipmentInduction(id));
    return sendJson(response, 200, { results });
  }

  if (request.method === "POST" && url.pathname === "/api/job-titles/bulk/delete") {
    const session = await uiAuthenticatedSession(context.sessionPath);
    const client = clientFromSession(session);
    const body = await readJsonBody(request);
    const ids = normalizeJobTitleIds(body.ids);
    const results = await executeBulk(ids, body.continueOnError, async (id) => deleteJobTitle(client, required(session.tenant, "tenant"), id));
    return sendJson(response, 200, { results });
  }

  if (request.method === "POST" && url.pathname === "/api/license-types/bulk/update") {
    const session = await uiAuthenticatedSession(context.sessionPath);
    const client = clientFromSession(session);
    const body = await readJsonBody(request);
    const ids = normalizeLicenseTypeIds(body.ids);
    const results = await executeBulkLicenseTypeUpdate(client, required(session.tenant, "tenant"), ids, body.payload || {}, {
      continueOnError: body.continueOnError
    });
    return sendJson(response, 200, { results });
  }

  if (request.method === "POST" && url.pathname === "/api/license-types/bulk/delete") {
    const session = await uiAuthenticatedSession(context.sessionPath);
    const client = clientFromSession(session);
    const body = await readJsonBody(request);
    const ids = normalizeLicenseTypeIds(body.ids);
    const results = await executeBulk(ids, body.continueOnError, async (id) => deleteLicenseType(client, required(session.tenant, "tenant"), id));
    return sendJson(response, 200, { results });
  }

  if (request.method === "POST" && url.pathname === "/api/regions/bulk/update") {
    const session = await uiAuthenticatedSession(context.sessionPath);
    const client = clientFromSession(session);
    const body = await readJsonBody(request);
    const ids = normalizeRegionIds(body.ids);
    const results = await executeBulkRegionUpdate(client, required(session.tenant, "tenant"), ids, body.payload || {}, {
      continueOnError: body.continueOnError
    });
    return sendJson(response, 200, { results });
  }

  if (request.method === "POST" && url.pathname === "/api/regions/bulk/delete") {
    const session = await uiAuthenticatedSession(context.sessionPath);
    const client = clientFromSession(session);
    const body = await readJsonBody(request);
    const ids = normalizeRegionIds(body.ids);
    const results = await executeBulk(ids, body.continueOnError, async (id) => deleteRegion(client, required(session.tenant, "tenant"), id));
    return sendJson(response, 200, { results });
  }

  if (request.method === "POST" && (url.pathname === "/api/users/import/plan" || url.pathname === "/api/users/import/apply")) {
    const apply = url.pathname.endsWith("/apply");
    const contentType = String(request.headers["content-type"] || "").toLowerCase();

    if (apply && contentType.includes("application/json")) {
      const body = await readJsonBody(request);
      const client = await authenticatedClient(context.sessionPath);
      const results = await executeSimpleUserCreateOperations(client, body.operations || [], {
        apply: true,
        globalSettings: body.globalSettings || {},
        userSettings: body.userSettings || {},
        continueOnError: body.continueOnError !== false
      });
      return sendJson(response, 200, {
        rowCount: body.operations?.length || 0,
        hasErrors: results.some((result) => result.status === "invalid" || result.status === "failed"),
        results
      });
    }

    const fileName = request.headers["x-file-name"] || "users.csv";
    const buffer = await readBody(request);
    const rows = await readSpreadsheetRowsFromBuffer(String(fileName), buffer, {
      sheet: url.searchParams.get("sheet") || undefined
    });
    const plan = apply ? planUserOperations(rows, {
      defaultAction: "create",
      forceAction: "create"
    }) : planSimpleUserCreateOperations(rows);
    const client = apply ? await authenticatedClient(context.sessionPath) : null;
    const results = apply ? await executeUserOperations(client, plan.operations, {
      apply,
      matchByEmail: false,
      continueOnError: url.searchParams.get("continueOnError") === "true"
    }) : plan.operations.map((operation) => ({
      operation,
      status: operation.errors?.length ? "invalid" : "planned",
      ...(operation.errors?.length ? { errors: operation.errors } : {})
    }));
    return sendJson(response, 200, {
      rowCount: rows.length,
      hasErrors: results.some((result) => result.status === "invalid" || result.status === "failed"),
      operations: results.map((result) => result.operation),
      results
    });
  }

  if (request.method === "POST" && (
    url.pathname === "/api/worker-profiles/import/plan" ||
    url.pathname === "/api/worker-profiles/import/apply"
  )) {
    const apply = url.pathname.endsWith("/apply");
    const contentType = String(request.headers["content-type"] || "").toLowerCase();

    if (apply && contentType.includes("application/json")) {
      const body = await readJsonBody(request);
      const client = await authenticatedClient(context.sessionPath);
      const results = await executeWorkerProfileImportOperations(client, body.operations || [], {
        apply: true,
        globalSettings: body.globalSettings || {},
        workerSettings: body.workerSettings || {},
        continueOnError: body.continueOnError !== false
      });
      return sendJson(response, 200, {
        rowCount: body.operations?.length || 0,
        hasErrors: results.some((result) => result.status === "invalid" || result.status === "failed"),
        results
      });
    }

    const client = await authenticatedClient(context.sessionPath);
    const fileName = request.headers["x-file-name"] || "worker-profiles.csv";
    const buffer = await readBody(request);
    const rows = await readSpreadsheetRowsFromBuffer(String(fileName), buffer, {
      sheet: url.searchParams.get("sheet") || undefined
    });
    const jobTitles = await listAllReferenceJobTitles(client);
    const plan = planWorkerProfileImportOperations(rows, {
      selectedFields: selectedWorkerFieldsFromUrl(url),
      jobTitles,
      globalSettings: {
        preferredCommunicationLanguage: url.searchParams.get("preferredCommunicationLanguage") || "en-US"
      }
    });
    const results = plan.operations.map((operation) => ({
      operation,
      status: operation.errors?.length ? "invalid" : "planned",
      ...(operation.errors?.length ? { errors: operation.errors } : {})
    }));
    return sendJson(response, 200, {
      rowCount: rows.length,
      hasErrors: results.some((result) => result.status === "invalid" || result.status === "failed"),
      operations: results.map((result) => result.operation),
      results
    });
  }

  if (request.method === "POST" && (
    url.pathname === "/api/projects/import/plan" ||
    url.pathname === "/api/projects/import/apply" ||
    url.pathname === "/api/employer-profiles/import/plan" ||
    url.pathname === "/api/employer-profiles/import/apply" ||
    url.pathname === "/api/equipment-profiles/import/plan" ||
    url.pathname === "/api/equipment-profiles/import/apply"
  )) {
    const apply = url.pathname.endsWith("/apply");
    const entity = url.pathname.startsWith("/api/projects/")
      ? "projects"
      : url.pathname.startsWith("/api/equipment-profiles/")
        ? "equipment-profiles"
        : "employer-profiles";
    const fileName = request.headers["x-file-name"] || `${entity}.csv`;
    const buffer = await readBody(request);
    const rows = await readSpreadsheetRowsFromBuffer(String(fileName), buffer, {
      sheet: url.searchParams.get("sheet") || undefined
    });
    const plan = planEntityCreateOperations(entity, rows);
    const client = apply ? await authenticatedClient(context.sessionPath) : null;
    const results = await executeEntityCreateOperations(client, plan.operations, {
      apply,
      continueOnError: url.searchParams.get("continueOnError") === "true"
    });
    return sendJson(response, 200, {
      rowCount: rows.length,
      hasErrors: results.some((result) => result.status === "invalid" || result.status === "failed"),
      results
    });
  }

  if (request.method === "POST" && (
    url.pathname === "/api/inspection-checklists/import/plan" ||
    url.pathname === "/api/inspection-checklists/import/apply"
  )) {
    const apply = url.pathname.endsWith("/apply");
    const contentType = String(request.headers["content-type"] || "").toLowerCase();

    if (apply && contentType.includes("application/json")) {
      const body = await readJsonBody(request);
      const session = await uiAuthenticatedSession(context.sessionPath);
      const client = clientFromSession(session);
      const results = await executeSimpleInspectionChecklistCreateOperations(client, required(session.tenant, "tenant"), body.operations || [], {
        apply: true,
        globalSettings: body.globalSettings || {},
        checklistSettings: body.checklistSettings || {},
        continueOnError: body.continueOnError !== false
      });
      return sendJson(response, 200, {
        rowCount: (body.operations || []).reduce((sum, operation) => sum + Number(operation.rowNumbers?.length || 0), 0),
        hasErrors: results.some((result) => result.status === "invalid" || result.status === "failed"),
        results
      });
    }

    const fileName = request.headers["x-file-name"] || "inspection-checklists.csv";
    const buffer = await readBody(request);
    const rows = await readSpreadsheetRowsFromBuffer(String(fileName), buffer, {
      sheet: url.searchParams.get("sheet") || undefined
    });
    const plan = apply
      ? planInspectionChecklistOperations(rows)
      : planSimpleInspectionChecklistCreateOperations(rows);
    const session = apply ? await uiAuthenticatedSession(context.sessionPath) : await loadSession(context.sessionPath);
    const client = apply ? clientFromSession(session) : null;
    const results = apply
      ? await executeInspectionChecklistOperations(client, session?.tenant, plan.operations, {
      apply,
      continueOnError: url.searchParams.get("continueOnError") === "true"
    })
      : await executeSimpleInspectionChecklistCreateOperations(null, session?.tenant, plan.operations, {
        apply: false,
        continueOnError: true
      });
    return sendJson(response, 200, {
      rowCount: rows.length,
      hasErrors: results.some((result) => result.status === "invalid" || result.status === "failed"),
      operations: results.map((result) => result.operation),
      results
    });
  }

  if (request.method === "POST" && (
    url.pathname === "/api/observations/import/plan" ||
    url.pathname === "/api/observations/import/apply"
  )) {
    const apply = url.pathname.endsWith("/apply");
    const contentType = String(request.headers["content-type"] || "").toLowerCase();

    if (apply && contentType.includes("application/json")) {
      const body = await readJsonBody(request);
      const session = await uiAuthenticatedSession(context.sessionPath);
      const client = clientFromSession(session);
      const results = await executeSimpleObservationTypeCreateOperations(client, required(session.tenant, "tenant"), body.operations || [], {
        apply: true,
        globalSettings: body.globalSettings || {},
        observationSettings: body.observationSettings || {},
        continueOnError: body.continueOnError !== false
      });
      return sendJson(response, 200, {
        rowCount: body.operations?.length || 0,
        hasErrors: results.some((result) => result.status === "invalid" || result.status === "failed"),
        results
      });
    }

    const fileName = request.headers["x-file-name"] || "observations.csv";
    const buffer = await readBody(request);
    const rows = await readSpreadsheetRowsFromBuffer(String(fileName), buffer, {
      sheet: url.searchParams.get("sheet") || undefined
    });
    const plan = planSimpleObservationTypeCreateOperations(rows);
    const results = plan.operations.map((operation) => ({
      operation,
      status: operation.errors?.length ? "invalid" : "planned",
      ...(operation.errors?.length ? { errors: operation.errors } : {})
    }));
    return sendJson(response, 200, {
      rowCount: rows.length,
      hasErrors: results.some((result) => result.status === "invalid" || result.status === "failed"),
      operations: results.map((result) => result.operation),
      results
    });
  }

  if (request.method === "POST" && (
    url.pathname === "/api/job-titles/import/plan" ||
    url.pathname === "/api/job-titles/import/apply"
  )) {
    const apply = url.pathname.endsWith("/apply");
    const fileName = request.headers["x-file-name"] || "job-titles.csv";
    const buffer = await readBody(request);
    const rows = await readSpreadsheetRowsFromBuffer(String(fileName), buffer, {
      sheet: url.searchParams.get("sheet") || undefined
    });
    const plan = planJobTitleCreateOperations(rows);
    const session = apply ? await uiAuthenticatedSession(context.sessionPath) : await loadSession(context.sessionPath);
    const client = apply ? clientFromSession(session) : null;
    const results = await executeJobTitleCreateOperations(client, session?.tenant, plan.operations, {
      apply,
      continueOnError: url.searchParams.get("continueOnError") === "true",
      skipExisting: url.searchParams.get("skipExisting") !== "false"
    });
    return sendJson(response, 200, {
      rowCount: rows.length,
      hasErrors: results.some((result) => result.status === "invalid" || result.status === "failed"),
      operations: results.map((result) => result.operation),
      results
    });
  }

  if (request.method === "POST" && (
    url.pathname === "/api/license-types/import/plan" ||
    url.pathname === "/api/license-types/import/apply"
  )) {
    const apply = url.pathname.endsWith("/apply");
    const fileName = request.headers["x-file-name"] || "license-types.csv";
    const buffer = await readBody(request);
    const rows = await readSpreadsheetRowsFromBuffer(String(fileName), buffer, {
      sheet: url.searchParams.get("sheet") || undefined
    });
    const plan = planLicenseTypeCreateOperations(rows);
    const session = apply ? await uiAuthenticatedSession(context.sessionPath) : await loadSession(context.sessionPath);
    const client = apply ? clientFromSession(session) : null;
    const results = await executeLicenseTypeCreateOperations(client, session?.tenant, plan.operations, {
      apply,
      continueOnError: url.searchParams.get("continueOnError") === "true",
      skipExisting: url.searchParams.get("skipExisting") !== "false"
    });
    return sendJson(response, 200, {
      rowCount: rows.length,
      hasErrors: results.some((result) => result.status === "invalid" || result.status === "failed"),
      operations: results.map((result) => result.operation),
      results
    });
  }

  if (request.method === "POST" && (
    url.pathname === "/api/regions/import/plan" ||
    url.pathname === "/api/regions/import/apply"
  )) {
    const apply = url.pathname.endsWith("/apply");
    const contentType = String(request.headers["content-type"] || "").toLowerCase();

    if (apply && contentType.includes("application/json")) {
      const body = await readJsonBody(request);
      const session = await uiAuthenticatedSession(context.sessionPath);
      const client = clientFromSession(session);
      const results = await executeRegionCreateOperations(client, required(session.tenant, "tenant"), body.operations || [], {
        apply: true,
        globalSettings: body.globalSettings || {},
        regionSettings: body.regionSettings || {},
        continueOnError: body.continueOnError !== false,
        skipExisting: body.skipExisting !== false
      });
      return sendJson(response, 200, {
        rowCount: body.operations?.length || 0,
        hasErrors: results.some((result) => result.status === "invalid" || result.status === "failed"),
        results
      });
    }

    const fileName = request.headers["x-file-name"] || "regions.csv";
    const buffer = await readBody(request);
    const rows = await readSpreadsheetRowsFromBuffer(String(fileName), buffer, {
      sheet: url.searchParams.get("sheet") || undefined
    });
    const plan = planRegionCreateOperations(rows);
    const results = plan.operations.map((operation) => ({
      operation,
      status: operation.errors?.length ? "invalid" : "planned",
      ...(operation.errors?.length ? { errors: operation.errors } : {})
    }));
    return sendJson(response, 200, {
      rowCount: rows.length,
      hasErrors: results.some((result) => result.status === "invalid" || result.status === "failed"),
      operations: results.map((result) => result.operation),
      results
    });
  }

  const checklistBulkUpdateMatch = url.pathname.match(/^\/api\/inspection-checklists\/([^/]+)\/bulk-yn-update\/(plan|apply)$/);
  if (request.method === "POST" && checklistBulkUpdateMatch) {
    const [, rawId, action] = checklistBulkUpdateMatch;
    const session = await uiAuthenticatedSession(context.sessionPath);
    const client = clientFromSession(session);
    const body = await readJsonBody(request);
    const result = await executeBulkYesNoChecklistUpdate(
      client,
      required(session.tenant, "tenant"),
      decodeURIComponent(rawId),
      body.settings || {},
      { apply: action === "apply" }
    );
    return sendJson(response, 200, result);
  }

  const checklistsBulkUpdateMatch = url.pathname.match(/^\/api\/inspection-checklists\/bulk-yn-update\/(plan|apply)$/);
  if (request.method === "POST" && checklistsBulkUpdateMatch) {
    const [, action] = checklistsBulkUpdateMatch;
    const session = await uiAuthenticatedSession(context.sessionPath);
    const client = clientFromSession(session);
    const body = await readJsonBody(request);
    const ids = normalizeChecklistIds(body.ids);
    const results = [];
    const apply = action === "apply";
    const continueOnError = body.continueOnError !== false;

    for (const id of ids) {
      try {
        results.push(await executeBulkYesNoChecklistUpdate(
          client,
          required(session.tenant, "tenant"),
          id,
          body.settings || {},
          { apply }
        ));
      } catch (error) {
        results.push({
          status: "failed",
          checklist: { id },
          error: error.message,
          responseBody: error.responseBody
        });
        if (!continueOnError) break;
      }
    }

    const failed = results.filter((result) => result.status === "failed");
    return sendJson(response, 200, {
      status: apply ? "success" : "planned",
      summary: summarizeChecklistBulkResults(results),
      hasErrors: failed.length > 0,
      results
    });
  }

  const observationsBulkUpdateMatch = url.pathname.match(/^\/api\/observations\/bulk-update\/(plan|apply)$/);
  if (request.method === "POST" && observationsBulkUpdateMatch) {
    const [, action] = observationsBulkUpdateMatch;
    const session = await uiAuthenticatedSession(context.sessionPath);
    const client = clientFromSession(session);
    const body = await readJsonBody(request);
    const ids = normalizeObservationIds(body.ids);
    const results = [];
    const apply = action === "apply";
    const continueOnError = body.continueOnError !== false;

    for (const id of ids) {
      try {
        results.push(await executeBulkObservationTypeUpdate(
          client,
          required(session.tenant, "tenant"),
          id,
          body.settings || {},
          { apply }
        ));
      } catch (error) {
        results.push({
          status: "failed",
          observationType: { id },
          error: error.message,
          responseBody: error.responseBody
        });
        if (!continueOnError) break;
      }
    }

    const failed = results.filter((result) => result.status === "failed");
    return sendJson(response, 200, {
      status: apply ? "success" : "planned",
      summary: {
        observationTypeCount: results.length,
        completedCount: results.length - failed.length,
        failedCount: failed.length
      },
      hasErrors: failed.length > 0,
      results
    });
  }

  if (url.pathname.startsWith("/api/projects/")) {
    const client = await authenticatedClient(context.sessionPath);
    const id = decodeURIComponent(url.pathname.slice("/api/projects/".length));
    if (!id) throw httpError(400, "Missing project id.");
    if (request.method === "GET") return sendJson(response, 200, await client.getProject(id));
    if (request.method === "PATCH") return sendJson(response, 200, await client.patchProject(id, normalizePatchPayload("projects", await readJsonBody(request))));
  }

  if (url.pathname.startsWith("/api/employer-profiles/")) {
    const client = await authenticatedClient(context.sessionPath);
    const id = decodeURIComponent(url.pathname.slice("/api/employer-profiles/".length));
    if (!id) throw httpError(400, "Missing employer profile id.");
    if (request.method === "GET") return sendJson(response, 200, await client.getEmployerProfile(id));
    if (request.method === "PATCH") return sendJson(response, 200, await client.patchEmployerProfile(id, normalizePatchPayload("employer-profiles", await readJsonBody(request))));
  }

  if (url.pathname.startsWith("/api/equipment-profiles/")) {
    const client = await authenticatedClient(context.sessionPath);
    const id = decodeURIComponent(url.pathname.slice("/api/equipment-profiles/".length));
    if (!id) throw httpError(400, "Missing equipment profile id.");
    if (request.method === "GET") return sendJson(response, 200, await client.getEquipmentProfile(id));
    if (request.method === "PATCH") return sendJson(response, 200, await client.patchEquipmentProfile(id, normalizePatchPayload("equipment-profiles", await readJsonBody(request))));
    if (request.method === "DELETE") return sendJson(response, 200, await client.deleteEquipmentProfile(id));
  }

  if (url.pathname.startsWith("/api/equipment-inductions/")) {
    const client = await authenticatedClient(context.sessionPath);
    const id = decodeURIComponent(url.pathname.slice("/api/equipment-inductions/".length));
    if (!id) throw httpError(400, "Missing equipment induction id.");
    if (request.method === "GET") return sendJson(response, 200, await client.getEquipmentInduction(id));
    if (request.method === "PATCH") return sendJson(response, 200, await client.patchEquipmentInduction(id, normalizeEquipmentInductionPatchPayload(await readJsonBody(request))));
    if (request.method === "DELETE") return sendJson(response, 200, await client.deleteEquipmentInduction(id));
  }

  if (url.pathname.startsWith("/api/inspection-checklists/")) {
    const session = await uiAuthenticatedSession(context.sessionPath);
    const client = clientFromSession(session);
    const id = decodeURIComponent(url.pathname.slice("/api/inspection-checklists/".length));
    if (!id) throw httpError(400, "Missing checklist id.");
    if (request.method === "GET") {
      return sendJson(response, 200, await getInspectionChecklist(client, required(session.tenant, "tenant"), id));
    }
  }

  if (url.pathname.startsWith("/api/observations/")) {
    const session = await uiAuthenticatedSession(context.sessionPath);
    const client = clientFromSession(session);
    const id = decodeURIComponent(url.pathname.slice("/api/observations/".length));
    if (!id) throw httpError(400, "Missing observation type id.");
    if (request.method === "GET") {
      return sendJson(response, 200, await getObservationType(client, required(session.tenant, "tenant"), id));
    }
  }

  if (url.pathname.startsWith("/api/users/")) {
    const client = await authenticatedClient(context.sessionPath);
    const id = decodeURIComponent(url.pathname.slice("/api/users/".length));
    if (!id) throw httpError(400, "Missing user id.");
    if (request.method === "GET") return sendJson(response, 200, await client.getUser(id));
    if (request.method === "PATCH") return sendJson(response, 200, await client.patchUser(id, await readJsonBody(request)));
    if (request.method === "DELETE") return sendJson(response, 200, await client.deleteUser(id));
  }

  if (request.method === "POST" && url.pathname === "/api/request") {
    const client = await authenticatedClient(context.sessionPath);
    const body = await readJsonBody(request);
    const result = await client.request(required(body.method, "method").toUpperCase(), required(body.url, "url"), {
      body: body.body === "" || body.body === undefined ? undefined : body.body,
      bearer: body.cookieOnly ? false : true,
      cookies: body.noCookies ? false : true
    });
    return sendJson(response, 200, result);
  }

  throw httpError(404, "Not found.");
}

async function serveStatic(request, response, url) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    throw httpError(405, "Method not allowed.");
  }

  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const requestedPath = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
  const filePath = resolve(publicRoot, `.${requestedPath}`);
  if (!filePath.startsWith(publicRoot)) throw httpError(403, "Forbidden.");

  try {
    const content = await readFile(filePath);
    response.writeHead(200, {
      "content-type": contentType(filePath),
      "cache-control": "no-store"
    });
    response.end(request.method === "HEAD" ? undefined : content);
  } catch (error) {
    if (error.code === "ENOENT") {
      const index = await readFile(join(publicRoot, "index.html"));
      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store"
      });
      response.end(index);
      return;
    }
    throw error;
  }
}

async function authenticatedClient(sessionPath) {
  const session = await authenticatedSession(sessionPath);
  return clientFromSession(session);
}

async function authenticatedSession(sessionPath) {
  const auth = resolveAuthOptions({ session: sessionPath });
  const session = await loadSession(auth.sessionPath);
  if (!session?.token && !session?.cookies?.length) {
    throw httpError(401, "No HammerTech session. Sign in first.");
  }
  return session;
}

async function uiAuthenticatedSession(sessionPath) {
  const session = await authenticatedSession(sessionPath);
  const tenant = required(session.tenant, "tenant");
  const cookieHeader = new CookieJar(session.cookies || []).headerFor(`https://${tenantHost(tenant)}/`);
  if (!cookieHeader.toUpperCase().includes("HAMMERTECHAUTH")) {
    throw httpError(401, "No HammerTech UI session. Use Start Full Session before using hidden UI modules like Inspection Checklists or Observations.");
  }
  return session;
}

async function saveBrowserCookieSession(sessionPath, body) {
  const existing = await loadSession(sessionPath);
  const region = normalizeRegion(body.region || existing?.region || "us");
  const tenant = required(body.tenant || existing?.tenant, "tenant");
  const cookieHeader = required(body.cookieHeader, "cookieHeader");
  const cookieJar = new CookieJar(existing?.cookies || []);
  cookieJar.addCookieHeader(cookieHeader, `https://${tenantHost(tenant)}/`);

  const session = {
    region,
    tenant,
    email: existing?.email || null,
    token: existing?.token || null,
    cookies: cookieJar.toJSON(),
    savedAt: new Date().toISOString()
  };
  await saveSession(sessionPath, session);
  return session;
}

async function createUiSession(sessionPath, body) {
  const apiClient = await HammerTechClient.authenticate(body);
  const uiSession = await authenticateUiSession({
    ...body
  });
  const cookieJar = new CookieJar(apiClient.cookieJar.toJSON());
  for (const cookie of uiSession.cookieJar.toJSON()) cookieJar.add(cookie);

  const session = {
    region: apiClient.region,
    tenant: uiSession.tenant,
    email: body.email || null,
    token: apiClient.token,
    cookies: cookieJar.toJSON(),
    uiCookieNames: uiSession.cookieNames,
    savedAt: new Date().toISOString()
  };
  await saveSession(sessionPath, session);
  return session;
}

function summarizeSession(session) {
  const uiCookieNames = session?.uiCookieNames || (session?.cookies || [])
    .map((cookie) => cookie.name)
    .filter((name) => String(name || "").toUpperCase().includes("HAMMERTECHAUTH"));
  return {
    authenticated: Boolean(session?.token || session?.cookies?.length),
    region: session?.region || null,
    tenant: session?.tenant || null,
    email: session?.email || null,
    hasBearerToken: Boolean(session?.token),
    hasUiSession: Boolean(uiCookieNames.length),
    uiCookieNames,
    cookieCount: session?.cookies?.length || 0,
    savedAt: session?.savedAt || null
  };
}

async function readJsonBody(request) {
  const buffer = await readBody(request);
  if (!buffer.length) return {};
  return JSON.parse(buffer.toString("utf8"));
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBodyBytes) throw httpError(413, "Request body is too large.");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(JSON.stringify(payload, null, 2));
}

function queryObject(url) {
  return Object.fromEntries(Array.from(url.searchParams.entries()).filter(([, value]) => value !== ""));
}

function required(value, name) {
  if (value === undefined || value === null || value === "") throw httpError(400, `Missing ${name}.`);
  return value;
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function normalizeIds(ids) {
  if (!Array.isArray(ids) || !ids.length) throw httpError(400, "Select at least one user.");
  const normalized = ids.map((id) => String(id || "").trim()).filter(Boolean);
  if (!normalized.length) throw httpError(400, "Select at least one user.");
  return normalized;
}

function normalizeChecklistIds(ids) {
  if (!Array.isArray(ids) || !ids.length) throw httpError(400, "Select at least one checklist.");
  const normalized = ids.map((id) => String(id || "").trim()).filter(Boolean);
  if (!normalized.length) throw httpError(400, "Select at least one checklist.");
  return Array.from(new Set(normalized));
}

function normalizeObservationIds(ids) {
  if (!Array.isArray(ids) || !ids.length) throw httpError(400, "Select at least one observation type.");
  const normalized = ids.map((id) => String(id || "").trim()).filter(Boolean);
  if (!normalized.length) throw httpError(400, "Select at least one observation type.");
  return Array.from(new Set(normalized));
}

function normalizeEquipmentProfileIds(ids) {
  if (!Array.isArray(ids) || !ids.length) throw httpError(400, "Select at least one equipment profile.");
  const normalized = ids.map((id) => String(id || "").trim()).filter(Boolean);
  if (!normalized.length) throw httpError(400, "Select at least one equipment profile.");
  return Array.from(new Set(normalized));
}

function normalizeEquipmentInductionIds(ids) {
  if (!Array.isArray(ids) || !ids.length) throw httpError(400, "Select at least one equipment induction.");
  const normalized = ids.map((id) => String(id || "").trim()).filter(Boolean);
  if (!normalized.length) throw httpError(400, "Select at least one equipment induction.");
  return Array.from(new Set(normalized));
}

function normalizeJobTitleIds(ids) {
  if (!Array.isArray(ids) || !ids.length) throw httpError(400, "Select at least one job title.");
  const normalized = ids.map((id) => String(id || "").trim()).filter(Boolean);
  if (!normalized.length) throw httpError(400, "Select at least one job title.");
  return Array.from(new Set(normalized));
}

function normalizeLicenseTypeIds(ids) {
  if (!Array.isArray(ids) || !ids.length) throw httpError(400, "Select at least one license type.");
  const normalized = ids.map((id) => String(id || "").trim()).filter(Boolean);
  if (!normalized.length) throw httpError(400, "Select at least one license type.");
  return Array.from(new Set(normalized));
}

function normalizeRegionIds(ids) {
  if (!Array.isArray(ids) || !ids.length) throw httpError(400, "Select at least one region.");
  const normalized = ids.map((id) => String(id || "").trim()).filter(Boolean);
  if (!normalized.length) throw httpError(400, "Select at least one region.");
  return Array.from(new Set(normalized));
}

function summarizeChecklistBulkResults(results) {
  const failed = results.filter((result) => result.status === "failed");
  const completed = results.filter((result) => result.status !== "failed");
  return {
    checklistCount: results.length,
    completedCount: completed.length,
    failedCount: failed.length,
    targetQuestions: completed.reduce((sum, result) => sum + Number(result.summary?.targetQuestions || 0), 0),
    yesNoQuestions: completed.reduce((sum, result) => sum + Number(result.summary?.yesNoQuestions || 0), 0),
    yesNoNaQuestions: completed.reduce((sum, result) => sum + Number(result.summary?.yesNoNaQuestions || 0), 0),
    skippedQuestions: completed.reduce((sum, result) => sum + Number(result.summary?.skippedQuestions || 0), 0)
  };
}

function buildUserImportLookups(projects) {
  const normalizedProjects = [];
  const regions = new Map();

  for (const project of projects || []) {
    const id = String(project.projectId || project.id || project.projectID || "").trim();
    if (!id) continue;
    const name = String(project.name || project.projectName || id).trim();
    const regionId = String(project.regionId || project.regionID || project.region?.id || "").trim();
    const regionName = String(project.regionString || project.regionName || project.region?.name || regionId || "").trim();

    normalizedProjects.push({
      id,
      name,
      regionId,
      regionName,
      isArchived: Boolean(project.isArchived)
    });

    if (regionId) {
      regions.set(regionId, {
        id: regionId,
        name: regionName || regionId
      });
    }
  }

  normalizedProjects.sort((a, b) => a.name.localeCompare(b.name));
  const normalizedRegions = Array.from(regions.values()).sort((a, b) => a.name.localeCompare(b.name));
  return {
    projects: normalizedProjects,
    regions: normalizedRegions
  };
}

function templateFileFor(entity) {
  if (entity === "users") return "users-template.csv";
  if (entity === "inspection-checklists") return "inspection-checklists-template.csv";
  if (entity === "observations") return "observations-template.csv";
  if (entity === "job-titles") return "job-titles-template.csv";
  if (entity === "license-types") return "license-types-template.csv";
  if (entity === "regions") return "regions-template.csv";
  return getEntityConfig(entity).templateFile;
}

function selectedWorkerFieldsFromUrl(url) {
  const repeated = url.searchParams.getAll("fields").flatMap((value) => String(value || "").split(","));
  const singular = url.searchParams.getAll("field");
  return [...repeated, ...singular].map((value) => String(value || "").trim()).filter(Boolean);
}

async function executeBulk(ids, continueOnError, action) {
  const results = [];
  for (const id of ids) {
    try {
      results.push({ id, status: "success", response: await action(id) });
    } catch (error) {
      results.push({
        id,
        status: "failed",
        error: error.message,
        responseBody: error.responseBody
      });
      if (!continueOnError) break;
    }
  }
  return results;
}

function contentType(filePath) {
  const extension = extname(filePath).toLowerCase();
  if (extension === ".html") return "text/html; charset=utf-8";
  if (extension === ".css") return "text/css; charset=utf-8";
  if (extension === ".js") return "text/javascript; charset=utf-8";
  if (extension === ".json") return "application/json; charset=utf-8";
  if (extension === ".svg") return "image/svg+xml";
  return "application/octet-stream";
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT || 8787);
  const host = process.env.HOST || "127.0.0.1";
  const server = createAppServer();
  server.listen(port, host, () => {
    process.stdout.write(`HammerTech Configuration Tool UI: http://${host}:${port}\n`);
  });
}
