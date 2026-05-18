const state = {
  session: null,
  users: [],
  jobTitles: [],
  licenseTypes: [],
  licenseCategories: [],
  projects: [],
  employerProfiles: [],
  equipmentProfiles: [],
  equipmentProjects: [],
  equipmentInductions: [],
  inspectionChecklists: [],
  inspectionObservationTypes: [],
  observationTypes: [],
  observationCategories: [],
  observationBulkDetails: new Map(),
  checklistBulkDetails: new Map(),
  checklistImportOperations: [],
  observationImportOperations: [],
  userImportOperations: [],
  userImportProjects: [],
  userImportRegions: [],
  userImportLookupsLoaded: false,
  observationLookupsLoaded: false,
  selectedIds: new Set(),
  selectedJobTitleIds: new Set(),
  selectedLicenseTypeIds: new Set(),
  selectedProjectIds: new Set(),
  selectedEmployerIds: new Set(),
  selectedEquipmentIds: new Set(),
  selectedEquipmentInductionIds: new Set(),
  previewReady: new Set()
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const PREVIEW_ACTION_BUTTONS = {
  genericImport: "#applyButton",
  userImport: "#applyUsersButton",
  jobTitleImport: "#applyJobTitlesButton",
  jobTitleBulkDelete: "#bulkJobTitleDeleteButton",
  licenseTypeImport: "#applyLicenseTypesButton",
  licenseTypeBulkUpdate: "#bulkLicenseTypeUpdateButton",
  licenseTypeBulkDelete: "#bulkLicenseTypeDeleteButton",
  userBulkUpdate: "#bulkUserUpdateButton",
  userBulkDelete: "#bulkDeleteButton",
  projectBulkUpdate: "#bulkProjectUpdateButton",
  employerBulkUpdate: "#bulkEmployerUpdateButton",
  equipmentBulkUpdate: "#bulkEquipmentUpdateButton",
  equipmentBulkDelete: "#bulkEquipmentDeleteButton",
  equipmentAssignmentCreate: "#createEquipmentAssignmentsButton",
  equipmentInductionBulkUpdate: "#bulkEquipmentInductionUpdateButton",
  equipmentInductionBulkDelete: "#bulkEquipmentInductionDeleteButton",
  checklistImport: "#applyChecklistsButton",
  checklistBulk: "#applyChecklistBulkButton",
  observationImport: "#applyObservationsButton",
  observationBulk: "#applyObservationBulkButton"
};

const PREVIEW_REQUIRED_TEXT = "Preview required before applying changes";

const OBSERVATION_COLOR_OPTIONS = [
  ["#3ea3fe", "Blue"],
  ["#ba5cc6", "Purple"],
  ["#ed66ad", "Pink"],
  ["#ff5d5d", "Red"],
  ["#ffa64d", "Orange"],
  ["#ffe75b", "Yellow"],
  ["#7ed957", "Green"],
  ["#bdbdbd", "Gray"],
  ["#ffffff", "White"]
];

const CUSTOM_FIELD_TYPES_REQUIRING_OPTIONS = new Set([
  "MultipleChoiceList",
  "SingleSelectList",
  "MultiSelectDropdown",
  "Dropdown"
]);

const CUSTOM_FIELD_TYPE_OPTIONS = [
  ["Checkbox", "Checkbox"],
  ["Date", "Date"],
  ["DateAndTime", "Date And Time"],
  ["ExpandableText", "Expandable Text"],
  ["ExpiryDate", "Expiry Date"],
  ["FileDownload", "File Download"],
  ["FileUpload", "File Upload"],
  ["FreeText", "Free Text"],
  ["Heading", "Heading"],
  ["ImageDownload", "Image Download"],
  ["ImageUpload", "Image Upload"],
  ["LargeReadOnlyText", "Large Read Only Text"],
  ["MultipleChoiceList", "Multiple Choice List"],
  ["NoMarginText", "No Margin Text"],
  ["Number", "Number"],
  ["SectionEnd", "Section End"],
  ["SectionStart", "Section Start"],
  ["Separator", "Separator"],
  ["SignatureOnly", "Signature Only"],
  ["SignatureWithName", "Signature With Name"],
  ["SingleSelectList", "Single Select List"],
  ["TextArea", "Text Area"],
  ["Time", "Time"],
  ["YesNoRadio", "Yes/No Radio"],
  ["YesNoNaRadio", "Yes/No/NA Radio"]
];

const CUSTOM_FIELD_TYPE_ALIASES = new Map([
  ["datetime", "DateAndTime"],
  ["expandinglabel", "ExpandableText"],
  ["biglabel", "LargeReadOnlyText"],
  ["multiselectdropdown", "MultipleChoiceList"],
  ["dropdown", "SingleSelectList"],
  ["nomargin", "NoMarginText"],
  ["signature", "SignatureOnly"],
  ["image", "ImageDownload"],
  ["0", "FreeText"],
  ["1", "TextArea"],
  ["2", "Checkbox"],
  ["3", "SingleSelectList"],
  ["5", "Separator"],
  ["6", "Heading"],
  ["7", "ImageUpload"],
  ["8", "Date"],
  ["9", "Time"],
  ["10", "DateAndTime"],
  ["11", "YesNoRadio"],
  ["12", "LargeReadOnlyText"],
  ["13", "NoMarginText"],
  ["14", "ExpiryDate"],
  ["15", "ExpandableText"],
  ["16", "SignatureOnly"],
  ["17", "SignatureWithName"],
  ["19", "YesNoNaRadio"],
  ["20", "FileUpload"],
  ["21", "ImageDownload"],
  ["22", "FileDownload"],
  ["23", "MultipleChoiceList"],
  ["24", "SectionStart"],
  ["25", "SectionEnd"],
  ["27", "Number"]
]);

await init();

async function init() {
  bindTabs();
  bindUiPolish();
  bindAuth();
  bindUserImport();
  bindJobTitles();
  bindLicenseTypes();
  bindImport();
  bindUsers();
  bindProjects();
  bindEmployers();
  bindEquipment();
  bindChecklists();
  bindObservations();
  bindPreviewInvalidation();
  initializePreviewGates();
  await refreshSession();
}

function bindTabs() {
  $$(".nav-group-toggle").forEach((toggle) => {
    toggle.addEventListener("click", () => {
      const group = toggle.closest(".nav-group");
      const shouldOpen = !group.classList.contains("open");
      $$(".nav-group").forEach((item) => setNavGroupExpanded(item, item === group && shouldOpen));
    });
  });

  $$(".tab").forEach((button) => {
    button.addEventListener("click", () => {
      activateTab(button);
      if (button.dataset.importEntity) setImportEntity(button.dataset.importEntity);
      if (button.dataset.view === "checklistImportView") loadInspectionObservationTypes();
      if (button.dataset.view === "observationImportView") loadObservationLookups({ quiet: true });
    });
  });
  const activeTab = $(".tab.active") || $(".tab");
  if (activeTab) activateTab(activeTab);
}

function activateTab(button) {
  const activeGroup = button.closest(".nav-group");
  $$(".tab").forEach((item) => {
    const isActive = item === button;
    item.classList.toggle("active", isActive);
    if (isActive) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  });
  $$(".nav-group").forEach((group) => {
    const isActive = group === activeGroup;
    group.classList.toggle("active", isActive);
    setNavGroupExpanded(group, isActive);
  });
  $$(".view").forEach((view) => view.classList.toggle("active", view.id === button.dataset.view));
}

function setNavGroupExpanded(group, expanded) {
  group.classList.toggle("open", expanded);
  const toggle = group.querySelector(".nav-group-toggle");
  const submenu = group.querySelector(".nav-submenu");
  if (toggle) toggle.setAttribute("aria-expanded", String(expanded));
  if (submenu) submenu.hidden = !expanded;
}

function bindUiPolish() {
  normalizeManageLayouts();

  document.addEventListener("click", (event) => {
    const resetButton = event.target.closest(".reset-settings-button");
    if (resetButton) {
      event.preventDefault();
      resetSettingsForTarget(resetButton.dataset.target);
      return;
    }

    const addCustomFieldButton = event.target.closest(".add-custom-field-button");
    if (addCustomFieldButton) {
      event.preventDefault();
      addCustomFieldRow(addCustomFieldButton);
      return;
    }

    const removeCustomFieldButton = event.target.closest(".remove-custom-field-button");
    if (removeCustomFieldButton) {
      event.preventDefault();
      removeCustomFieldRow(removeCustomFieldButton);
      return;
    }

    const legend = event.target.closest(".collapsible-fieldset > legend");
    if (!legend) return;
    toggleFieldset(legend.parentElement);
  });

  document.addEventListener("change", (event) => {
    if (event.target.matches(".observation-color-select")) updateObservationColorPreview(event.target);
    if (event.target.matches(".custom-field-action-select, .custom-field-target-select, .custom-field-type-select")) {
      updateCustomFieldRows(event.target);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (!["Enter", " "].includes(event.key)) return;
    const legend = event.target.closest(".collapsible-fieldset > legend");
    if (!legend) return;
    event.preventDefault();
    toggleFieldset(legend.parentElement);
  });

  let polishQueued = false;
  const observer = new MutationObserver(() => {
    if (polishQueued) return;
    polishQueued = true;
    requestAnimationFrame(() => {
      polishQueued = false;
      refreshCollapsibleFieldsets();
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });
  refreshCollapsibleFieldsets();
  updateObservationColorPreviews();
  updateCustomFieldAnswerOptions();
}

function normalizeManageLayouts() {
  const loadedListLabels = {
    usersTable: "Loaded Users",
    projectsTable: "Loaded Projects",
    employersTable: "Loaded Employer Profiles",
    equipmentTable: "Loaded Equipment Profiles",
    equipmentInductionsTable: "Loaded Project Assignments",
    jobTitlesTable: "Loaded Job Titles",
    licenseTypesTable: "Loaded License Types",
    observationsTable: "Loaded Observation Types"
  };

  $$(".bulk-layout").forEach((layout) => {
    const children = Array.from(layout.children);
    const tableWrap = children.find((item) => item.classList.contains("table-wrap"));
    const detailPanel = children.find((item) => item.classList.contains("detail-panel"));
    if (!tableWrap || !detailPanel) return;

    layout.classList.add("stacked-bulk-layout");
    layout.insertBefore(detailPanel, tableWrap);

    const toolbar = layout.previousElementSibling?.classList.contains("bulk-toolbar")
      ? layout.previousElementSibling
      : null;
    const heading = loadedListHeadingFor(tableWrap, loadedListLabels);
    if (heading) layout.insertBefore(heading, tableWrap);
    if (toolbar) layout.insertBefore(toolbar, tableWrap);
  });

  for (const [tbodyId, label] of Object.entries(loadedListLabels)) {
    const tbody = document.getElementById(tbodyId);
    const tableWrap = tbody?.closest(".table-wrap");
    if (!tableWrap || tableWrap.closest(".bulk-layout")) continue;
    const toolbar = tableWrap.previousElementSibling?.classList.contains("bulk-toolbar")
      ? tableWrap.previousElementSibling
      : null;
    const anchor = toolbar || tableWrap;
    if (anchor.previousElementSibling?.classList.contains("loaded-list-heading")) continue;
    anchor.insertAdjacentElement("beforebegin", createLoadedListHeading(label, tbodyId));
  }
}

function loadedListHeadingFor(tableWrap, labels) {
  const tbody = tableWrap.querySelector("tbody[id]");
  const label = labels[tbody?.id];
  if (!label) return null;
  const existing = tableWrap.parentElement?.querySelector(`.loaded-list-heading[data-for="${tbody.id}"]`);
  return existing || createLoadedListHeading(label, tbody.id);
}

function createLoadedListHeading(label, id) {
  const heading = document.createElement("div");
  heading.className = "subsection-heading loaded-list-heading";
  heading.dataset.for = id;
  heading.innerHTML = `<h3>${escapeHtml(label)}</h3>`;
  return heading;
}

function resetSettingsForTarget(selector) {
  const target = selector ? document.querySelector(selector) : null;
  if (!target) return;
  resetSettingsElement(target);
  if (target.matches("#observationImportSettingsForm, #observationBulkForm")) {
    renderObservationSettingsForms();
    renderObservationImportCategoryOptions();
  }
  if (target.matches("#checklistImportSettingsForm")) renderChecklistImportObservationOptions();
  if (target.matches("#checklistBulkForm")) renderDefaultObservationOptions();
  updateObservationColorPreviews();
  updateCustomFieldAnswerOptions();
  refreshCollapsibleFieldsets();
  invalidatePreviewForSettingsTarget(selector);
  toast("Settings reset to No Change");
}

function resetSettingsElement(target) {
  target.querySelectorAll("input, select, textarea").forEach((field) => {
    if (field.type === "file" || field.type === "search") return;
    if (field.matches(".search-field input")) return;
    if (field.matches("#bulkChecklistSelect, #bulkObservationSelect")) return;
    if (field.type === "checkbox" || field.type === "radio") {
      field.checked = false;
      return;
    }
    if (field.tagName === "SELECT") {
      if (field.multiple) {
        Array.from(field.options).forEach((option) => {
          option.selected = false;
        });
        return;
      }
      const blank = Array.from(field.options).find((option) => option.value === "");
      field.value = blank ? "" : (field.options[0]?.value || "");
      return;
    }
    field.value = "";
  });
}

function refreshCollapsibleFieldsets(root = document) {
  const fieldsets = root.querySelectorAll([
    ".user-import-settings fieldset",
    ".checklist-import-settings fieldset",
    ".checklist-updater fieldset",
    ".observation-import-settings fieldset",
    ".observation-updater fieldset",
    ".equipment-assignment-settings fieldset",
    ".equipment-inductions-panel fieldset",
    ".user-import-detail fieldset",
    ".checklist-import-detail fieldset",
    ".observation-import-detail fieldset",
    ".equipment-assignment-detail fieldset"
  ].join(","));

  fieldsets.forEach((fieldset) => {
    if (fieldset.dataset.polished === "true") return;
    const legend = fieldset.querySelector("legend");
    if (!legend) return;
    fieldset.dataset.polished = "true";
    fieldset.classList.add("collapsible-fieldset");
    legend.setAttribute("role", "button");
    legend.setAttribute("tabindex", "0");

    const siblingFieldsets = Array.from(fieldset.parentElement?.children || [])
      .filter((item) => item.tagName === "FIELDSET");
    const index = siblingFieldsets.indexOf(fieldset);
    const shouldCollapse = index > 0 || Boolean(fieldset.closest(".user-import-detail, .checklist-import-detail, .observation-import-detail, .equipment-assignment-detail"));
    setFieldsetCollapsed(fieldset, shouldCollapse);
  });
}

function toggleFieldset(fieldset) {
  setFieldsetCollapsed(fieldset, !fieldset.classList.contains("is-collapsed"));
}

function setFieldsetCollapsed(fieldset, collapsed) {
  fieldset.classList.toggle("is-collapsed", collapsed);
  const legend = fieldset.querySelector("legend");
  if (legend) legend.setAttribute("aria-expanded", String(!collapsed));
}

function bindPreviewInvalidation() {
  document.addEventListener("input", (event) => invalidatePreviewForControl(event.target));
  document.addEventListener("change", (event) => invalidatePreviewForControl(event.target));
  document.addEventListener("click", (event) => {
    const button = event.target.closest(".select-options-button");
    if (!button) return;
    queueMicrotask(() => invalidatePreviewForControl(button));
  });
}

function initializePreviewGates() {
  Object.keys(PREVIEW_ACTION_BUTTONS).forEach((key) => setPreviewReady(key, false));
}

function setPreviewReady(key, ready) {
  if (ready) state.previewReady.add(key);
  else state.previewReady.delete(key);

  const button = $(PREVIEW_ACTION_BUTTONS[key]);
  if (!button) return;
  button.disabled = !ready;
  button.title = ready ? "" : "Preview first";
}

function requirePreviewReady(key, message = "Preview this task first") {
  if (state.previewReady.has(key)) return true;
  setPreviewReady(key, false);
  toast(message);
  return false;
}

function markPreviewReady(key, statusSelector, message) {
  setPreviewReady(key, true);
  setStatusMessage(statusSelector, message);
  toast("Preview ready");
}

function invalidatePreview(key, statusSelector, message = PREVIEW_REQUIRED_TEXT) {
  setPreviewReady(key, false);
  if (statusSelector) setStatusMessage(statusSelector, message);
}

function invalidatePreviewForControl(target) {
  if (!target || target.closest(".search-field") || target.closest("#authForm, #browserCookieForm")) return;

  if (target.closest("#userImportView")) invalidatePreview("userImport", "#userImportStatus");
  if (target.closest("#jobTitleImportView")) invalidatePreview("jobTitleImport", "#jobTitleImportStatus");
  if (target.closest("#licenseTypeImportView")) invalidatePreview("licenseTypeImport", "#licenseTypeImportStatus");
  if (target.closest("#importView")) invalidatePreview("genericImport", "#importStatus");
  if (target.closest("#checklistImportView")) invalidatePreview("checklistImport", "#checklistImportStatus");
  if (target.closest("#observationImportView")) invalidatePreview("observationImport", "#observationImportStatus");

  if (target.closest("#jobTitlesView")) invalidatePreview("jobTitleBulkDelete", "#jobTitlesStatus");

  if (target.closest("#bulkUpdateForm, #usersTable")) {
    invalidatePreview("userBulkUpdate", "#usersStatus");
    invalidatePreview("userBulkDelete", "#usersStatus");
  }

  if (target.closest("#bulkLicenseTypeUpdateForm, #licenseTypesTable")) {
    invalidatePreview("licenseTypeBulkUpdate", "#licenseTypesStatus");
    invalidatePreview("licenseTypeBulkDelete", "#licenseTypesStatus");
  }

  if (target.closest("#bulkProjectUpdateForm, #projectsTable")) invalidatePreview("projectBulkUpdate", "#projectsStatus");
  if (target.closest("#bulkEmployerUpdateForm, #employersTable")) invalidatePreview("employerBulkUpdate", "#employersStatus");

  if (target.closest("#bulkEquipmentUpdateForm, #equipmentTable")) {
    invalidatePreview("equipmentBulkUpdate", "#equipmentStatus");
    invalidatePreview("equipmentBulkDelete", "#equipmentStatus");
  }
  if (target.closest("#equipmentAssignmentForm, .equipment-assignment-override-form, #equipmentTable")) {
    invalidatePreview("equipmentAssignmentCreate", "#equipmentAssignmentStatus", "Preview required before creating assignments");
  }
  if (target.closest("#bulkEquipmentInductionUpdateForm, #equipmentInductionsTable")) {
    invalidatePreview("equipmentInductionBulkUpdate", "#equipmentInductionsStatus");
    invalidatePreview("equipmentInductionBulkDelete", "#equipmentInductionsStatus");
  }

  if (target.closest("#checklistBulkForm")) invalidatePreview("checklistBulk", "#checklistsStatus");
  if (target.closest("#observationBulkForm")) invalidatePreview("observationBulk", "#observationsStatus");
}

function invalidatePreviewForSettingsTarget(selector) {
  const target = selector ? document.querySelector(selector) : null;
  if (!target) return;
  invalidatePreviewForControl(target);
}

function setStatusMessage(statusSelector, message) {
  const status = statusSelector ? $(statusSelector) : null;
  if (!status) return;
  status.classList.remove("error");
  status.textContent = message;
}

function hasPreviewRows(result) {
  return Boolean(
    (result.operations || []).length
    || (result.results || []).some((item) => item.operation || item.status === "planned" || item.status === "success")
    || result.rowCount > 0
  );
}

function previewBulkUpdate({ key, ids, form, statusSelector, label, payloadBuilder = payloadFromEnabledFields }) {
  setPreviewReady(key, false);
  if (!ids.length) return toast(`Select at least one ${label}`);
  const payload = payloadBuilder(form);
  if (!payload) return;
  if (!Object.keys(payload).length) return toast("Choose at least one update field");
  markPreviewReady(key, statusSelector, `Preview ready: ${ids.length} ${pluralize(label, ids.length)} will be updated.`);
}

function previewBulkDelete({ key, ids, statusSelector, label }) {
  setPreviewReady(key, false);
  if (!ids.length) return toast(`Select at least one ${label}`);
  markPreviewReady(key, statusSelector, `Preview ready: ${ids.length} ${pluralize(label, ids.length)} will be deleted.`);
}

function pluralize(label, count) {
  if (count === 1) return label;
  if (label.endsWith("y")) return `${label.slice(0, -1)}ies`;
  return `${label}s`;
}

function bindAuth() {
  $("#authForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    await authenticateFromForm(event.currentTarget, "/api/auth/token", "Signed in");
  });

  $("#createUiSessionButton").addEventListener("click", async () => {
    await authenticateFromForm($("#authForm"), "/api/auth/ui-session", "UI session created");
  });

  $("#clearSessionButton").addEventListener("click", async () => {
    await runWithToast(async () => {
      state.session = await api("/api/session", { method: "DELETE" });
      renderSession();
      return "Session cleared";
    });
  });
}

async function authenticateFromForm(formElement, endpoint, successMessage) {
  if (!formElement.reportValidity()) return;
  const form = new FormData(formElement);
  await runWithToast(async () => {
    const session = await api(endpoint, {
      method: "POST",
      body: {
        region: form.get("region"),
        tenant: form.get("tenant"),
        email: form.get("email"),
        password: form.get("password"),
        saveSession: true
      }
    });
    state.session = session;
    formElement.elements.password.value = "";
    renderSession();
    return successMessage;
  });
}

function bindImport() {
  $("#importEntity").addEventListener("change", (event) => setImportEntity(event.target.value));
  $("#planButton").addEventListener("click", () => runImport(false));
  $("#applyButton").addEventListener("click", () => runImport(true));
  setImportEntity($("#importEntity").value || "users", { resetResults: false });
}

function bindUserImport() {
  renderUserImportGlobalSettings();
  $("#userImportView").addEventListener("click", (event) => {
    const button = event.target.closest(".select-options-button");
    if (!button) return;
    const form = button.closest("form") || $("#userImportSettingsForm");
    const select = form.querySelector(`[name="${button.dataset.selectName}"]`);
    if (!select) return;
    for (const option of select.options) option.selected = button.dataset.action === "select";
  });
  $("#loadUserImportLookupsButton").addEventListener("click", loadUserImportLookups);
  $("#planUsersButton").addEventListener("click", () => runUserImport(false));
  $("#applyUsersButton").addEventListener("click", () => runUserImport(true));
}

function bindJobTitles() {
  $("#planJobTitlesButton").addEventListener("click", () => runJobTitleImport(false));
  $("#applyJobTitlesButton").addEventListener("click", () => runJobTitleImport(true));
  $("#loadJobTitlesButton").addEventListener("click", loadJobTitles);
  $("#jobTitleSearch").addEventListener("input", renderJobTitles);
  $("#selectAllJobTitles").addEventListener("change", (event) => setVisibleJobTitleSelection(event.target.checked));
  $("#selectVisibleJobTitlesButton").addEventListener("click", () => setVisibleJobTitleSelection(true));
  $("#clearJobTitleSelectionButton").addEventListener("click", () => {
    state.selectedJobTitleIds.clear();
    renderJobTitles();
  });
  $("#previewJobTitleDeleteButton").addEventListener("click", previewJobTitleDelete);
  $("#bulkJobTitleDeleteButton").addEventListener("click", bulkDeleteJobTitles);
}

function bindLicenseTypes() {
  $("#planLicenseTypesButton").addEventListener("click", () => runLicenseTypeImport(false));
  $("#applyLicenseTypesButton").addEventListener("click", () => runLicenseTypeImport(true));
  $("#loadLicenseTypesButton").addEventListener("click", loadLicenseTypes);
  $("#loadLicenseCategoriesButton").addEventListener("click", loadLicenseCategories);
  $("#licenseTypeSearch").addEventListener("input", renderLicenseTypes);
  $("#selectAllLicenseTypes").addEventListener("change", (event) => setVisibleLicenseTypeSelection(event.target.checked));
  $("#selectVisibleLicenseTypesButton").addEventListener("click", () => setVisibleLicenseTypeSelection(true));
  $("#clearLicenseTypeSelectionButton").addEventListener("click", () => {
    state.selectedLicenseTypeIds.clear();
    renderLicenseTypes();
  });
  $("#bulkLicenseTypeUpdateForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    await bulkUpdateLicenseTypes(event.currentTarget);
  });
  $("#previewLicenseTypeUpdateButton").addEventListener("click", () => previewLicenseTypeUpdate($("#bulkLicenseTypeUpdateForm")));
  $("#previewLicenseTypeDeleteButton").addEventListener("click", previewLicenseTypeDelete);
  $("#bulkLicenseTypeDeleteButton").addEventListener("click", bulkDeleteLicenseTypes);
  renderLicenseCategoryOptions();
}

function bindUsers() {
  $("#loadUsersButton").addEventListener("click", loadUsers);
  $("#userSearch").addEventListener("input", renderUsers);
  $("#selectAllUsers").addEventListener("change", (event) => {
    setVisibleSelection(event.target.checked);
  });
  $("#selectVisibleButton").addEventListener("click", () => setVisibleSelection(true));
  $("#clearSelectionButton").addEventListener("click", () => {
    state.selectedIds.clear();
    renderUsers();
  });

  $("#bulkUpdateForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    await bulkUpdateUsers(event.currentTarget);
  });

  $("#previewUserUpdateButton").addEventListener("click", () => previewUserBulkUpdate($("#bulkUpdateForm")));
  $("#previewUserDeleteButton").addEventListener("click", previewUserBulkDelete);
  $("#bulkDeleteButton").addEventListener("click", bulkDeleteUsers);
}

function bindProjects() {
  $("#loadProjectsButton").addEventListener("click", loadProjects);
  $("#projectSearch").addEventListener("input", renderProjects);
  $("#selectAllProjects").addEventListener("change", (event) => setVisibleProjectSelection(event.target.checked));
  $("#selectVisibleProjectsButton").addEventListener("click", () => setVisibleProjectSelection(true));
  $("#clearProjectSelectionButton").addEventListener("click", () => {
    state.selectedProjectIds.clear();
    renderProjects();
  });
  $("#bulkProjectUpdateForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    await bulkUpdateProjects(event.currentTarget);
  });
  $("#previewProjectUpdateButton").addEventListener("click", () => previewProjectBulkUpdate($("#bulkProjectUpdateForm")));
}

function bindEmployers() {
  $("#loadEmployersButton").addEventListener("click", loadEmployers);
  $("#employerSearch").addEventListener("input", renderEmployers);
  $("#selectAllEmployers").addEventListener("change", (event) => setVisibleEmployerSelection(event.target.checked));
  $("#selectVisibleEmployersButton").addEventListener("click", () => setVisibleEmployerSelection(true));
  $("#clearEmployerSelectionButton").addEventListener("click", () => {
    state.selectedEmployerIds.clear();
    renderEmployers();
  });
  $("#bulkEmployerUpdateForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    await bulkUpdateEmployers(event.currentTarget);
  });
  $("#previewEmployerUpdateButton").addEventListener("click", () => previewEmployerBulkUpdate($("#bulkEmployerUpdateForm")));
}

function bindEquipment() {
  $("#equipmentView").addEventListener("click", (event) => {
    const button = event.target.closest(".select-options-button");
    if (!button) return;
    const container = button.closest("form, details, section") || $("#equipmentView");
    const select = container.querySelector(`[name="${button.dataset.selectName}"]`);
    if (!select) return;
    for (const option of select.options) option.selected = button.dataset.action === "select";
  });
  $("#loadEquipmentButton").addEventListener("click", loadEquipmentProfiles);
  $("#equipmentSearch").addEventListener("input", renderEquipmentProfiles);
  $("#selectAllEquipment").addEventListener("change", (event) => setVisibleEquipmentSelection(event.target.checked));
  $("#selectVisibleEquipmentButton").addEventListener("click", () => setVisibleEquipmentSelection(true));
  $("#clearEquipmentSelectionButton").addEventListener("click", () => {
    state.selectedEquipmentIds.clear();
    renderEquipmentProfiles();
  });
  $("#bulkEquipmentUpdateForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    await bulkUpdateEquipmentProfiles(event.currentTarget);
  });
  $("#previewEquipmentUpdateButton").addEventListener("click", () => previewEquipmentProfileUpdate($("#bulkEquipmentUpdateForm")));
  $("#previewEquipmentDeleteButton").addEventListener("click", previewEquipmentProfileDelete);
  $("#bulkEquipmentDeleteButton").addEventListener("click", bulkDeleteEquipmentProfiles);
  $("#loadEquipmentProjectsButton").addEventListener("click", loadEquipmentProjects);
  $("#previewEquipmentAssignmentsButton").addEventListener("click", previewEquipmentAssignments);
  $("#createEquipmentAssignmentsButton").addEventListener("click", createEquipmentAssignments);
  $("#loadEquipmentInductionsButton").addEventListener("click", loadEquipmentInductions);
  $("#equipmentInductionSearch").addEventListener("input", renderEquipmentInductions);
  $("#selectAllEquipmentInductions").addEventListener("change", (event) => setVisibleEquipmentInductionSelection(event.target.checked));
  $("#selectVisibleEquipmentInductionsButton").addEventListener("click", () => setVisibleEquipmentInductionSelection(true));
  $("#clearEquipmentInductionSelectionButton").addEventListener("click", () => {
    state.selectedEquipmentInductionIds.clear();
    renderEquipmentInductions();
  });
  $("#bulkEquipmentInductionUpdateForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    await bulkUpdateEquipmentInductions(event.currentTarget);
  });
  $("#previewEquipmentInductionUpdateButton").addEventListener("click", () => previewEquipmentInductionUpdate($("#bulkEquipmentInductionUpdateForm")));
  $("#previewEquipmentInductionDeleteButton").addEventListener("click", previewEquipmentInductionDelete);
  $("#bulkEquipmentInductionDeleteButton").addEventListener("click", bulkDeleteEquipmentInductions);
  setDefaultEquipmentInductionDates();
  renderEquipmentAssignmentProjectOptions();
  renderEquipmentAssignmentOverrides();
}

function bindChecklists() {
  $("#browserCookieForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await runWithToast(async () => {
      state.session = await api("/api/auth/browser-cookie", {
        method: "POST",
        body: {
          region: form.get("region"),
          tenant: form.get("tenant"),
          cookieHeader: form.get("cookieHeader")
        }
      });
      event.currentTarget.elements.cookieHeader.value = "";
      renderSession();
      return "Cookie saved";
    }, (message) => showEntityError("#checklistsStatus", message));
  });

  $("#loadChecklistsButton").addEventListener("click", loadInspectionChecklists);
  $("#planChecklistsButton").addEventListener("click", () => runChecklistImport(false));
  $("#applyChecklistsButton").addEventListener("click", () => runChecklistImport(true));
  $("#checklistFile").addEventListener("change", resetChecklistImportPreview);
  $("#checklistSheetName").addEventListener("input", resetChecklistImportPreview);
  $("#checklistContinueOnError").addEventListener("change", resetChecklistImportPreview);
  $("#loadChecklistForBulkButton").addEventListener("click", loadChecklistForBulkUpdate);
  $("#bulkChecklistSelect").addEventListener("change", resetChecklistBulkSelection);
  $("#previewChecklistBulkButton").addEventListener("click", () => runChecklistBulkUpdate(false));
  $("#applyChecklistBulkButton").addEventListener("click", () => runChecklistBulkUpdate(true));
  setChecklistImportApplyEnabled(false);
}

function bindObservations() {
  renderObservationSettingsForms();
  $("#planObservationsButton").addEventListener("click", () => runObservationImport(false));
  $("#applyObservationsButton").addEventListener("click", () => runObservationImport(true));
  $("#loadObservationsButton").addEventListener("click", loadObservationTypes);
  $("#loadObservationDetailsButton").addEventListener("click", loadSelectedObservationDetails);
  $("#bulkObservationSelect").addEventListener("change", resetObservationBulkSelection);
  $("#previewObservationBulkButton").addEventListener("click", () => runObservationBulkUpdate(false));
  $("#applyObservationBulkButton").addEventListener("click", () => runObservationBulkUpdate(true));
}

async function refreshSession() {
  state.session = await api("/api/session");
  renderSession();
}

function renderSession() {
  const pill = $("#sessionPill");
  const session = state.session || {};
  pill.classList.toggle("active", Boolean(session.authenticated));
  pill.textContent = session.authenticated
    ? `${session.hasUiSession ? "Full session" : "API token"} | ${String(session.region || "").toUpperCase()} | ${session.tenant || "tenant"}`
    : "No session";

  const form = $("#authForm");
  if (session.region) form.elements.region.value = session.region;
  if (session.tenant) form.elements.tenant.value = session.tenant;
  if (session.email) form.elements.email.value = session.email;

  const cookieForm = $("#browserCookieForm");
  if (cookieForm) {
    if (session.region) cookieForm.elements.region.value = session.region;
    if (session.tenant) cookieForm.elements.tenant.value = session.tenant;
  }
}

async function runUserImport(apply) {
  if (apply) {
    if (!requirePreviewReady("userImport", "Preview a user spreadsheet first")) return;
    await applyUserImport();
    return;
  }

  const file = $("#userImportFile").files[0];
  if (!file) {
    toast("Choose a user spreadsheet");
    return;
  }

  const status = $("#userImportStatus");
  status.classList.remove("error");
  status.textContent = "Reading spreadsheet...";
  setPreviewReady("userImport", false);

  await runWithToast(async () => {
    if (!state.userImportLookupsLoaded) await loadUserImportLookups({ quiet: true });
    const params = new URLSearchParams({
      continueOnError: String($("#userImportContinueOnError").checked)
    });
    if ($("#userImportSheetName").value.trim()) params.set("sheet", $("#userImportSheetName").value.trim());
    const result = await api(`/api/users/import/plan?${params}`, {
      method: "POST",
      rawBody: await file.arrayBuffer(),
      headers: {
        "content-type": "application/octet-stream",
        "x-file-name": file.name
      }
    });
    state.userImportOperations = result.operations || (result.results || []).map((item) => item.operation).filter(Boolean);
    renderUserImportPlan(result);
    setPreviewReady("userImport", state.userImportOperations.length > 0);
    return "User spreadsheet preview ready";
  }, (message) => showEntityError("#userImportStatus", message));
}

async function applyUserImport() {
  if (!requirePreviewReady("userImport", "Preview a user spreadsheet first")) return;
  if (!state.userImportOperations.length) {
    toast("Preview a user spreadsheet first");
    setPreviewReady("userImport", false);
    return;
  }

  const status = $("#userImportStatus");
  status.classList.remove("error");
  status.textContent = "Creating users...";

  await runWithToast(async () => {
    const result = await api("/api/users/import/apply", {
      method: "POST",
      body: {
        operations: state.userImportOperations,
        globalSettings: collectUserImportSettingsFromElement($("#userImportSettingsForm")),
        userSettings: collectUserImportOverrides(),
        continueOnError: $("#userImportContinueOnError").checked
      }
    });
    renderUserImportResults(result);
    state.userImportOperations = [];
    setPreviewReady("userImport", false);
    return "User import complete";
  }, (message) => showEntityError("#userImportStatus", message));
}

function renderUserImportPlan(result) {
  const list = $("#userImportList");
  list.innerHTML = "";
  $("#userImportResults").innerHTML = "";
  $("#userImportResultsWrap").hidden = true;

  for (const operation of state.userImportOperations) {
    const card = document.createElement("details");
    card.className = "user-import-card";
    card.dataset.clientId = operation.clientId || "";
    const payload = operation.payload || {};
    const errors = operation.errors || [];
    card.innerHTML = `
      <summary>
        <span class="user-import-summary">
          <span class="user-import-name">${escapeHtml(payload.name || operation.email || "Unnamed user")}</span>
          <span class="user-import-meta">${escapeHtml(payload.email || operation.email || "")} | row ${escapeHtml(operation.rowNumber || "")}</span>
          ${errors.length ? `<span class="status-badge status-invalid">invalid</span>` : ""}
        </span>
      </summary>
      <div class="user-import-detail">
        ${errors.length ? `<div class="inline-error">${escapeHtml(errors.join("; "))}</div>` : ""}
        <div class="user-preview-grid">
          <div><span>Email</span>${escapeHtml(payload.email || "")}</div>
          <div><span>Name</span>${escapeHtml(payload.name || "")}</div>
          <div><span>Title</span>${escapeHtml(payload.title || "")}</div>
          <div><span>Mobile</span>${escapeHtml(payload.mobile || "")}</div>
          <div><span>Internal ID</span>${escapeHtml(payload.internalIdentifier || "")}</div>
        </div>
        <form class="user-import-override-form">
          ${userOverrideSettingsHtml()}
        </form>
      </div>
    `;
    list.appendChild(card);
  }

  const failed = (result.results || []).filter((item) => item.status === "invalid" || item.status === "failed").length;
  $("#userImportStatus").classList.toggle("error", failed > 0);
  $("#userImportStatus").textContent = `${state.userImportOperations.length} users found, ${failed} invalid`;
}

function collectUserImportOverrides() {
  const overrides = {};
  $$(".user-import-card").forEach((card) => {
    const clientId = card.dataset.clientId;
    const settings = collectUserImportSettingsFromElement(card.querySelector(".user-import-override-form"));
    if (clientId && Object.keys(settings).length) overrides[clientId] = settings;
  });
  return overrides;
}

function renderUserImportResults(result) {
  const tbody = $("#userImportResults");
  tbody.innerHTML = "";
  $("#userImportResultsWrap").hidden = false;
  for (const item of result.results || []) {
    const op = item.operation || {};
    const payload = op.payload || {};
    const tr = document.createElement("tr");
    const message = item.error || item.errors?.join("; ") || item.response?.messageText || op.warnings?.join("; ") || "";
    tr.innerHTML = `
      <td>${escapeHtml(op.rowNumber || "")}</td>
      <td>${escapeHtml(payload.email || op.email || payload.name || "")}</td>
      <td><span class="status-badge status-${escapeHtml(item.status || "planned")}">${escapeHtml(item.status || "")}</span></td>
      <td>${escapeHtml(message)}</td>
    `;
    tbody.appendChild(tr);
  }
  const failed = (result.results || []).filter((item) => item.status === "invalid" || item.status === "failed").length;
  $("#userImportStatus").classList.toggle("error", failed > 0);
  $("#userImportStatus").textContent = `${result.results?.length || 0} users processed, ${failed} failed`;
}

async function loadUserImportLookups({ quiet = false } = {}) {
  const status = $("#userImportStatus");
  if (!quiet) {
    status.classList.remove("error");
    status.textContent = "Loading projects and regions...";
  }

  const result = await api("/api/user-import/lookups");
  state.userImportProjects = result.projects || [];
  state.userImportRegions = result.regions || [];
  state.userImportLookupsLoaded = true;
  renderUserImportGlobalSettings();
  if (state.userImportOperations.length) renderUserImportPlan({ results: [] });
  if (!quiet) {
    status.textContent = `${state.userImportProjects.length} projects and ${state.userImportRegions.length} regions loaded`;
    toast("Project and region lists refreshed");
  }
}

function renderUserImportGlobalSettings() {
  const container = $("#userImportGlobalSettings");
  if (!container) return;
  container.innerHTML = userImportSettingsHtml({ scope: "global" });
}

function collectUserImportSettingsFromElement(element) {
  const settings = collectSettingsFromElement(element);
  const projectIds = arrayValue(settings.selectedProjectIds);
  if (projectIds.length) {
    settings.selectedProjectIds = projectIds;
    settings.selectedProjectRegionIds = regionsForProjectIds(projectIds);
  }

  const regionIds = arrayValue(settings.selectedRegionIds);
  if (regionIds.length) settings.selectedRegionIds = regionIds;

  return settings;
}

function regionsForProjectIds(projectIds) {
  const ids = new Set(projectIds);
  return Array.from(new Set(state.userImportProjects
    .filter((project) => ids.has(project.id) && project.regionId)
    .map((project) => project.regionId)));
}

function userImportSettingsHtml({ scope }) {
  const inheritLabel = scope === "global" ? "" : "Use global";
  const noChangeLabel = scope === "global" ? "No change" : "Use global";
  return `
    <div class="settings-grid user-settings-grid">
      <fieldset>
        <legend>Roles</legend>
        <div class="role-options compact-role-options">
          <label class="check-label"><input name="roleNames" type="checkbox" value="admin"><span>Admin</span></label>
          <label class="check-label"><input name="roleNames" type="checkbox" value="regionadmin"><span>Region Admin</span></label>
          <label class="check-label"><input name="roleNames" type="checkbox" value="safetymanager"><span>Safety Manager</span></label>
        </div>
      </fieldset>
      <fieldset class="wide-field">
        <legend>Current Projects</legend>
        <label>
          <span>Project Names</span>
          <select name="selectedProjectIds" multiple size="8">
            ${projectOptionsHtml()}
          </select>
        </label>
        <div class="select-actions">
          <button class="ghost-button select-options-button" type="button" data-select-name="selectedProjectIds" data-action="select">Select All</button>
          <button class="ghost-button select-options-button" type="button" data-select-name="selectedProjectIds" data-action="clear">Clear</button>
        </div>
        ${!state.userImportLookupsLoaded ? `<div class="inline-hint">Sign in, then refresh lists to load project names.</div>` : ""}
        <div class="permission-grid">
          <label class="check-label"><input name="currentRegionAdmin" type="checkbox" value="true"><span>Region Admin</span></label>
          <label class="check-label"><input name="currentProjectAdmin" type="checkbox" value="true"><span>Project Admin</span></label>
          <label class="check-label"><input name="currentIndividualDailyReport" type="checkbox" value="true"><span>Individual Daily Report</span></label>
          <label class="check-label"><input name="currentDailyReportAdmin" type="checkbox" value="true"><span>Daily Report Admin</span></label>
          <label class="check-label"><input name="currentSiteNotifications" type="checkbox" value="true"><span>Site Notifications</span></label>
          <label class="check-label"><input name="currentConfidentialData" type="checkbox" value="true"><span>Confidential Data</span></label>
        </div>
      </fieldset>
      <fieldset class="wide-field">
        <legend>Future Projects By Region</legend>
        <label>
          <span>Automatically Add User To Future Projects</span>
          <select name="futureAddProjects">
            <option value="">${escapeHtml(noChangeLabel)}</option>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        </label>
        <label>
          <span>Regions</span>
          <select name="selectedRegionIds" multiple size="7">
            ${regionOptionsHtml(inheritLabel)}
          </select>
        </label>
        <div class="select-actions">
          <button class="ghost-button select-options-button" type="button" data-select-name="selectedRegionIds" data-action="select">Select All</button>
          <button class="ghost-button select-options-button" type="button" data-select-name="selectedRegionIds" data-action="clear">Clear</button>
        </div>
        <div class="permission-grid">
          <label class="check-label"><input name="futureIndividualDailyReport" type="checkbox" value="true"><span>Individual Daily Report</span></label>
          <label class="check-label"><input name="futureDailyReportAdmin" type="checkbox" value="true"><span>Daily Report Admin</span></label>
          <label class="check-label"><input name="futureSiteNotifications" type="checkbox" value="true"><span>Site Notifications</span></label>
          <label class="check-label"><input name="futureConfidentialData" type="checkbox" value="true"><span>Confidential Data</span></label>
        </div>
      </fieldset>
    </div>
  `;
}

function projectOptionsHtml() {
  if (!state.userImportProjects.length) return "";
  return state.userImportProjects.map((project) => {
    const suffix = project.regionName ? ` (${project.regionName})` : "";
    return `<option value="${escapeHtml(project.id)}">${escapeHtml(`${project.name}${suffix}`)}</option>`;
  }).join("");
}

function regionOptionsHtml(blankLabel = "") {
  const options = blankLabel ? [`<option value="">${escapeHtml(blankLabel)}</option>`] : [];
  options.push(...state.userImportRegions.map((region) => (
    `<option value="${escapeHtml(region.id)}">${escapeHtml(region.name)}</option>`
  )));
  return options.join("");
}

async function runJobTitleImport(apply) {
  if (apply && !requirePreviewReady("jobTitleImport", "Preview a job title spreadsheet first")) return;
  const file = $("#jobTitleImportFile").files[0];
  if (!file) return toast("Choose a job title spreadsheet");

  const status = $("#jobTitleImportStatus");
  status.classList.remove("error");
  status.textContent = apply ? "Creating job titles..." : "Reading spreadsheet...";
  if (!apply) setPreviewReady("jobTitleImport", false);

  await runWithToast(async () => {
    const params = new URLSearchParams({
      continueOnError: String($("#jobTitleContinueOnError").checked),
      skipExisting: String($("#jobTitleSkipExisting").checked)
    });
    if ($("#jobTitleImportSheetName").value.trim()) params.set("sheet", $("#jobTitleImportSheetName").value.trim());
    const endpoint = apply ? "/api/job-titles/import/apply" : "/api/job-titles/import/plan";
    const result = await api(`${endpoint}?${params}`, {
      method: "POST",
      rawBody: await file.arrayBuffer(),
      headers: {
        "content-type": "application/octet-stream",
        "x-file-name": file.name
      }
    });
    renderJobTitleImportResults(result);
    if (apply) {
      setPreviewReady("jobTitleImport", false);
      await loadJobTitles({ quiet: true });
    } else {
      setPreviewReady("jobTitleImport", hasPreviewRows(result));
    }
    return apply ? "Job title import complete" : "Job title preview ready";
  }, (message) => showEntityError("#jobTitleImportStatus", message));
}

function renderJobTitleImportResults(result) {
  const tbody = $("#jobTitleImportResults");
  tbody.innerHTML = "";
  for (const item of result.results || []) {
    const op = item.operation || {};
    const tr = document.createElement("tr");
    const message = item.error || item.errors?.join("; ") || item.message || op.warnings?.join("; ") || "";
    tr.innerHTML = `
      <td>${escapeHtml(op.rowNumber || "")}</td>
      <td>${escapeHtml(op.name || op.payload?.name || "")}</td>
      <td><span class="status-badge status-${escapeHtml(item.status || "planned")}">${escapeHtml(item.status || "")}</span></td>
      <td>${escapeHtml(message)}</td>
    `;
    tbody.appendChild(tr);
  }
  const failed = (result.results || []).filter((item) => ["invalid", "failed"].includes(item.status)).length;
  $("#jobTitleImportStatus").classList.toggle("error", failed > 0);
  $("#jobTitleImportStatus").textContent = `${result.rowCount || 0} rows, ${failed} failed`;
}

async function loadJobTitles({ quiet = false } = {}) {
  const status = $("#jobTitlesStatus");
  if (!quiet) {
    status.classList.remove("error");
    status.textContent = "Loading...";
  }

  await runWithToast(async () => {
    const result = await api("/api/job-titles");
    state.jobTitles = result.jobTitles || [];
    state.selectedJobTitleIds.clear();
    renderJobTitles();
    status.textContent = `${state.jobTitles.length} job titles loaded`;
    return quiet ? "Job titles refreshed" : "Job titles refreshed";
  }, (message) => showEntityError("#jobTitlesStatus", message));
}

function renderJobTitles() {
  const tbody = $("#jobTitlesTable");
  tbody.innerHTML = "";

  for (const item of visibleJobTitles()) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="select-col">
        <input class="job-title-select" type="checkbox" aria-label="Select ${escapeHtml(item.name || "job title")}" data-id="${escapeHtml(item.id)}" ${state.selectedJobTitleIds.has(item.id) ? "checked" : ""}>
      </td>
      <td>${escapeHtml(item.name || "")}</td>
      <td>${escapeHtml(item.id || "")}</td>
    `;
    tr.addEventListener("click", (event) => {
      if (event.target.matches("input")) return;
      toggleJobTitleSelected(item.id);
    });
    tbody.appendChild(tr);
  }

  $$(".job-title-select").forEach((checkbox) => {
    checkbox.addEventListener("change", (event) => {
      setJobTitleSelected(event.target.dataset.id, event.target.checked);
    });
  });
  renderJobTitleSelectionState();
}

function visibleJobTitles() {
  const search = $("#jobTitleSearch").value.trim().toLowerCase();
  if (!search) return state.jobTitles;
  return state.jobTitles.filter((item) => [item.name, item.id]
    .some((value) => String(value || "").toLowerCase().includes(search)));
}

function toggleJobTitleSelected(id) {
  setJobTitleSelected(id, !state.selectedJobTitleIds.has(id));
  renderJobTitles();
}

function setJobTitleSelected(id, selected) {
  if (!id) return;
  if (selected) state.selectedJobTitleIds.add(id);
  else state.selectedJobTitleIds.delete(id);
  renderJobTitleSelectionState();
}

function setVisibleJobTitleSelection(selected) {
  for (const item of visibleJobTitles()) {
    if (selected) state.selectedJobTitleIds.add(item.id);
    else state.selectedJobTitleIds.delete(item.id);
  }
  renderJobTitles();
}

function renderJobTitleSelectionState() {
  const visible = visibleJobTitles();
  const selectedVisible = visible.filter((item) => state.selectedJobTitleIds.has(item.id)).length;
  const allCheckbox = $("#selectAllJobTitles");
  allCheckbox.checked = Boolean(visible.length && selectedVisible === visible.length);
  allCheckbox.indeterminate = selectedVisible > 0 && selectedVisible < visible.length;
  $("#jobTitleSelectionCount").textContent = `${state.selectedJobTitleIds.size} selected`;
  setPreviewReady("jobTitleBulkDelete", false);
}

function previewJobTitleDelete() {
  previewBulkDelete({
    key: "jobTitleBulkDelete",
    ids: Array.from(state.selectedJobTitleIds),
    statusSelector: "#jobTitlesStatus",
    label: "job title"
  });
}

async function bulkDeleteJobTitles() {
  if (!requirePreviewReady("jobTitleBulkDelete", "Preview the job title delete first")) return;
  const ids = Array.from(state.selectedJobTitleIds);
  if (!ids.length) return toast("Select at least one job title");
  if (!window.confirm(`Delete ${ids.length} selected job title${ids.length === 1 ? "" : "s"}?`)) return;

  await runWithToast(async () => {
    const result = await api("/api/job-titles/bulk/delete", {
      method: "POST",
      body: {
        ids,
        continueOnError: $("#jobTitleDeleteContinueOnError").checked
      }
    });
    reportEntityBulkResult("#jobTitlesStatus", result, "deleted");
    state.selectedJobTitleIds.clear();
    setPreviewReady("jobTitleBulkDelete", false);
    await loadJobTitles({ quiet: true });
    return "Job title delete complete";
  }, (message) => showEntityError("#jobTitlesStatus", message));
}

async function runLicenseTypeImport(apply) {
  if (apply && !requirePreviewReady("licenseTypeImport", "Preview a license type spreadsheet first")) return;
  const file = $("#licenseTypeImportFile").files[0];
  if (!file) return toast("Choose a license type spreadsheet");

  const status = $("#licenseTypeImportStatus");
  status.classList.remove("error");
  status.textContent = apply ? "Creating license types..." : "Reading spreadsheet...";
  if (!apply) setPreviewReady("licenseTypeImport", false);

  await runWithToast(async () => {
    const params = new URLSearchParams({
      continueOnError: String($("#licenseTypeContinueOnError").checked),
      skipExisting: String($("#licenseTypeSkipExisting").checked)
    });
    if ($("#licenseTypeImportSheetName").value.trim()) params.set("sheet", $("#licenseTypeImportSheetName").value.trim());
    const endpoint = apply ? "/api/license-types/import/apply" : "/api/license-types/import/plan";
    const result = await api(`${endpoint}?${params}`, {
      method: "POST",
      rawBody: await file.arrayBuffer(),
      headers: {
        "content-type": "application/octet-stream",
        "x-file-name": file.name
      }
    });
    renderLicenseTypeImportResults(result);
    if (apply) {
      setPreviewReady("licenseTypeImport", false);
      await loadLicenseTypes({ quiet: true });
    } else {
      setPreviewReady("licenseTypeImport", hasPreviewRows(result));
    }
    return apply ? "License type import complete" : "License type preview ready";
  }, (message) => showEntityError("#licenseTypeImportStatus", message));
}

function renderLicenseTypeImportResults(result) {
  const tbody = $("#licenseTypeImportResults");
  tbody.innerHTML = "";
  for (const item of result.results || []) {
    const op = item.operation || {};
    const payload = op.payload || {};
    const tr = document.createElement("tr");
    const message = item.error || item.errors?.join("; ") || item.message || op.warnings?.join("; ") || "";
    tr.innerHTML = `
      <td>${escapeHtml(op.rowNumber || "")}</td>
      <td>${escapeHtml(payload.Name || op.name || "")}</td>
      <td>${escapeHtml(payload.Code || "")}</td>
      <td>${escapeHtml(payload.Category || "")}</td>
      <td><span class="status-badge status-${escapeHtml(item.status || "planned")}">${escapeHtml(item.status || "")}</span></td>
      <td>${escapeHtml(message)}</td>
    `;
    tbody.appendChild(tr);
  }
  const failed = (result.results || []).filter((item) => ["invalid", "failed"].includes(item.status)).length;
  $("#licenseTypeImportStatus").classList.toggle("error", failed > 0);
  $("#licenseTypeImportStatus").textContent = `${result.rowCount || 0} rows, ${failed} failed`;
}

async function loadLicenseTypes({ quiet = false } = {}) {
  const status = $("#licenseTypesStatus");
  if (!quiet) {
    status.classList.remove("error");
    status.textContent = "Loading...";
  }

  await runWithToast(async () => {
    const result = await api("/api/license-types");
    state.licenseTypes = result.licenseTypes || [];
    state.selectedLicenseTypeIds.clear();
    renderLicenseTypes();
    if (!state.licenseCategories.length) await loadLicenseCategories({ quiet: true });
    status.textContent = `${state.licenseTypes.length} license types loaded`;
    return quiet ? "License types refreshed" : "License types refreshed";
  }, (message) => showEntityError("#licenseTypesStatus", message));
}

async function loadLicenseCategories({ quiet = false } = {}) {
  const status = $("#licenseTypesStatus");
  if (!quiet) {
    status.classList.remove("error");
    status.textContent = "Loading license categories...";
  }

  await runWithToast(async () => {
    const result = await api("/api/license-types/categories");
    state.licenseCategories = result.categories || [];
    renderLicenseCategoryOptions();
    if (!quiet) status.textContent = `${state.licenseCategories.length} license categories loaded`;
    return "License categories refreshed";
  }, (message) => showEntityError("#licenseTypesStatus", message));
}

function renderLicenseCategoryOptions() {
  const select = $("#licenseBulkCategory");
  if (!select) return;
  const previous = select.value;
  const seen = new Set(["", "0"]);
  select.innerHTML = `
    <option value="">Select</option>
    <option value="0">No Category</option>
    ${state.licenseCategories
    .filter((category) => {
      const value = String(category.value || "");
      if (seen.has(value)) return false;
      seen.add(value);
      return true;
    })
    .map((category) => `<option value="${escapeHtml(category.value)}">${escapeHtml(category.label || category.value)}</option>`)
    .join("")}
  `;
  if (previous && Array.from(select.options).some((option) => option.value === previous)) select.value = previous;
}

function renderLicenseTypes() {
  const tbody = $("#licenseTypesTable");
  tbody.innerHTML = "";

  for (const item of visibleLicenseTypes()) {
    const id = item.id || "";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="select-col">
        <input class="license-type-select" type="checkbox" aria-label="Select ${escapeHtml(item.name || "license type")}" data-id="${escapeHtml(id)}" ${state.selectedLicenseTypeIds.has(id) ? "checked" : ""}>
      </td>
      <td>${escapeHtml(item.name || "")}</td>
      <td>${escapeHtml(item.categoryName || "")}</td>
      <td>${escapeHtml(item.code || "")}</td>
      <td>${escapeHtml(licenseTypeFlagSummary(item))}</td>
      <td>${escapeHtml(id)}</td>
    `;
    tr.addEventListener("click", (event) => {
      if (event.target.matches("input")) return;
      toggleLicenseTypeSelected(id);
    });
    tbody.appendChild(tr);
  }

  $$(".license-type-select").forEach((checkbox) => {
    checkbox.addEventListener("change", (event) => {
      setLicenseTypeSelected(event.target.dataset.id, event.target.checked);
    });
  });
  renderLicenseTypeSelectionState();
}

function visibleLicenseTypes() {
  const search = $("#licenseTypeSearch").value.trim().toLowerCase();
  if (!search) return state.licenseTypes;
  return state.licenseTypes.filter((item) => [
    item.name,
    item.categoryName,
    item.code,
    item.id,
    licenseTypeFlagSummary(item)
  ].some((value) => String(value || "").toLowerCase().includes(search)));
}

function licenseTypeFlagSummary(item) {
  const flags = [
    [item.IsPriority, "Priority"],
    [item.IsCompulsoryForInduction, "Compulsory"],
    [item.HasExpiryDate, "Expiry"],
    [item.HasIssueDate, "Issue"],
    [item.HasRefreshmentDate, "Refreshment"],
    [item.HasIssuer, "Issuer"],
    [item.HasLicenseNo, "Number"],
    [item.HasLicensePhoto, "Photo"],
    [item.IsLicenceFrontPhotoMandatory, "Front Photo"],
    [item.IsLicenceBackPhotoMandatory, "Back Photo"],
    [item.IsFileUploadEnabled, "File Upload"],
    [item.IsFileUploadRequired, "File Required"]
  ].filter(([enabled]) => enabled).map(([, label]) => label);
  return flags.join(", ");
}

function toggleLicenseTypeSelected(id) {
  setLicenseTypeSelected(id, !state.selectedLicenseTypeIds.has(id));
  renderLicenseTypes();
}

function setLicenseTypeSelected(id, selected) {
  if (!id) return;
  if (selected) state.selectedLicenseTypeIds.add(id);
  else state.selectedLicenseTypeIds.delete(id);
  renderLicenseTypeSelectionState();
}

function setVisibleLicenseTypeSelection(selected) {
  for (const item of visibleLicenseTypes()) {
    if (selected) state.selectedLicenseTypeIds.add(item.id);
    else state.selectedLicenseTypeIds.delete(item.id);
  }
  renderLicenseTypes();
}

function renderLicenseTypeSelectionState() {
  const visible = visibleLicenseTypes();
  const selectedVisible = visible.filter((item) => state.selectedLicenseTypeIds.has(item.id)).length;
  const allCheckbox = $("#selectAllLicenseTypes");
  allCheckbox.checked = Boolean(visible.length && selectedVisible === visible.length);
  allCheckbox.indeterminate = selectedVisible > 0 && selectedVisible < visible.length;
  $("#licenseTypeSelectionCount").textContent = `${state.selectedLicenseTypeIds.size} selected`;
  setPreviewReady("licenseTypeBulkUpdate", false);
  setPreviewReady("licenseTypeBulkDelete", false);
}

function previewLicenseTypeUpdate(form) {
  previewBulkUpdate({
    key: "licenseTypeBulkUpdate",
    ids: Array.from(state.selectedLicenseTypeIds),
    form,
    statusSelector: "#licenseTypesStatus",
    label: "license type"
  });
}

async function bulkUpdateLicenseTypes(form) {
  if (!requirePreviewReady("licenseTypeBulkUpdate", "Preview the license type update first")) return;
  const ids = Array.from(state.selectedLicenseTypeIds);
  if (!ids.length) return toast("Select at least one license type");
  const payload = payloadFromEnabledFields(form);
  if (!Object.keys(payload).length) return toast("Choose at least one update field");

  await runWithToast(async () => {
    const result = await api("/api/license-types/bulk/update", {
      method: "POST",
      body: {
        ids,
        payload,
        continueOnError: form.elements.continueOnError.checked
      }
    });
    reportEntityBulkResult("#licenseTypesStatus", result, "updated");
    setPreviewReady("licenseTypeBulkUpdate", false);
    await loadLicenseTypes({ quiet: true });
    return "License type update complete";
  }, (message) => showEntityError("#licenseTypesStatus", message));
}

function previewLicenseTypeDelete() {
  previewBulkDelete({
    key: "licenseTypeBulkDelete",
    ids: Array.from(state.selectedLicenseTypeIds),
    statusSelector: "#licenseTypesStatus",
    label: "license type"
  });
}

async function bulkDeleteLicenseTypes() {
  if (!requirePreviewReady("licenseTypeBulkDelete", "Preview the license type delete first")) return;
  const ids = Array.from(state.selectedLicenseTypeIds);
  if (!ids.length) return toast("Select at least one license type");
  if (!window.confirm(`Delete ${ids.length} selected license type${ids.length === 1 ? "" : "s"}?`)) return;

  const form = $("#bulkLicenseTypeUpdateForm");
  await runWithToast(async () => {
    const result = await api("/api/license-types/bulk/delete", {
      method: "POST",
      body: {
        ids,
        continueOnError: form.elements.continueOnError.checked
      }
    });
    reportEntityBulkResult("#licenseTypesStatus", result, "deleted");
    state.selectedLicenseTypeIds.clear();
    setPreviewReady("licenseTypeBulkDelete", false);
    await loadLicenseTypes({ quiet: true });
    return "License type delete complete";
  }, (message) => showEntityError("#licenseTypesStatus", message));
}

async function runImport(apply) {
  if (apply && !requirePreviewReady("genericImport", "Preview the spreadsheet first")) return;
  const file = $("#importFile").files[0];
  if (!file) {
    toast("Choose a spreadsheet");
    return;
  }

  const status = $("#importStatus");
  status.classList.remove("error");
  status.textContent = apply ? "Applying..." : "Planning...";
  if (!apply) setPreviewReady("genericImport", false);

  await runWithToast(async () => {
    const entity = $("#importEntity").value;
    const params = new URLSearchParams({
      continueOnError: String($("#continueOnError").checked)
    });
    if ($("#sheetName").value.trim()) params.set("sheet", $("#sheetName").value.trim());
    const endpoint = apply ? `/api/${entity}/import/apply` : `/api/${entity}/import/plan`;
    const result = await api(`${endpoint}?${params}`, {
      method: "POST",
      rawBody: await file.arrayBuffer(),
      headers: {
        "content-type": "application/octet-stream",
        "x-file-name": file.name
      }
    });
    renderImportResults(result);
    setPreviewReady("genericImport", apply ? false : hasPreviewRows(result));
    return apply ? "Import applied" : "Dry run complete";
  }, (message) => {
    status.classList.add("error");
    status.textContent = message;
  });
}

function renderImportResults(result) {
  const tbody = $("#importResults");
  tbody.innerHTML = "";
  for (const item of result.results || []) {
    const op = item.operation || {};
    const tr = document.createElement("tr");
    const message = item.error || item.errors?.join("; ") || item.response?.messageText || op.warnings?.join("; ") || "";
    tr.innerHTML = `
      <td>${escapeHtml(op.rowNumber || "")}</td>
      <td>${escapeHtml(importTarget(op))}</td>
      <td><span class="status-badge status-${escapeHtml(item.status || "planned")}">${escapeHtml(item.status || "")}</span></td>
      <td>${escapeHtml(message)}</td>
    `;
    tbody.appendChild(tr);
  }
  $("#importStatus").textContent = `${result.rowCount || 0} rows`;
}

function setImportEntity(entity, { resetResults = true } = {}) {
  const labels = {
    users: "Users",
    projects: "Projects",
    "employer-profiles": "Employer Profiles",
    "equipment-profiles": "Equipment Profiles"
  };
  const select = $("#importEntity");
  select.value = entity;
  $("#importTitle").textContent = `${labels[entity] || "Module"} Spreadsheet Import`;
  $("#sheetName").placeholder = labels[entity] || "";
  updateTemplateLink();
  setPreviewReady("genericImport", false);
  if (resetResults) {
    $("#importStatus").classList.remove("error");
    $("#importStatus").textContent = "Ready";
    $("#importResults").innerHTML = "";
  }
}

function updateTemplateLink() {
  const entity = $("#importEntity").value;
  $("#templateLink").href = `/api/templates/${entity}.csv`;
}

function importTarget(operation) {
  const payload = operation.payload || {};
  return payload.email || payload.name || payload.businessName || operation.email || operation.name || equipmentLabel(payload) || operation.id || "";
}

async function loadUsers() {
  const status = $("#usersStatus");
  status.classList.remove("error");
  status.textContent = "Loading...";

  await runWithToast(async () => {
    const params = new URLSearchParams({
      includeNotAssigned: String($("#includeNotAssigned").checked)
    });
    const result = await api(`/api/users?${params}`);
    state.users = result.users || [];
    state.selectedIds.clear();
    renderUsers();
    status.textContent = `${state.users.length} users loaded`;
    return "Users refreshed";
  }, (message) => {
    status.classList.add("error");
    status.textContent = message;
  });
}

function renderUsers() {
  const tbody = $("#usersTable");
  tbody.innerHTML = "";

  for (const user of visibleUsers()) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="select-col">
        <input class="user-select" type="checkbox" aria-label="Select ${escapeHtml(user.email || user.fullName || "user")}" data-id="${escapeHtml(user.id)}" ${state.selectedIds.has(user.id) ? "checked" : ""}>
      </td>
      <td>${escapeHtml(user.fullName || "")}</td>
      <td>${escapeHtml(user.email || "")}</td>
      <td>${escapeHtml((user.roleNames || []).join(", "))}</td>
      <td>${escapeHtml(user.isDeleted ? "Deleted" : user.isInactive ? "Inactive" : "Active")}</td>
    `;
    tr.addEventListener("click", (event) => {
      if (event.target.matches("input")) return;
      toggleSelected(user.id);
    });
    tbody.appendChild(tr);
  }

  $$(".user-select").forEach((checkbox) => {
    checkbox.addEventListener("change", (event) => {
      setSelected(event.target.dataset.id, event.target.checked);
    });
  });
  renderSelectionState();
}

function visibleUsers() {
  const search = $("#userSearch").value.trim().toLowerCase();
  if (!search) return state.users;
  return state.users.filter((user) => {
    return [user.fullName, user.email, (user.roleNames || []).join(", ")]
      .some((value) => String(value || "").toLowerCase().includes(search));
  });
}

function toggleSelected(id) {
  setSelected(id, !state.selectedIds.has(id));
  renderUsers();
}

function setSelected(id, selected) {
  if (!id) return;
  if (selected) state.selectedIds.add(id);
  else state.selectedIds.delete(id);
  renderSelectionState();
}

function setVisibleSelection(selected) {
  for (const user of visibleUsers()) {
    if (selected) state.selectedIds.add(user.id);
    else state.selectedIds.delete(user.id);
  }
  renderUsers();
}

function renderSelectionState() {
  const visible = visibleUsers();
  const selectedVisible = visible.filter((user) => state.selectedIds.has(user.id)).length;
  const allCheckbox = $("#selectAllUsers");
  allCheckbox.checked = Boolean(visible.length && selectedVisible === visible.length);
  allCheckbox.indeterminate = selectedVisible > 0 && selectedVisible < visible.length;
  $("#selectionCount").textContent = `${state.selectedIds.size} selected`;
  setPreviewReady("userBulkUpdate", false);
  setPreviewReady("userBulkDelete", false);
}

function collectUserBulkUpdatePayload(form) {
  const payload = {};
  if ($("#updateTitleEnabled").checked) {
    const title = form.elements.title.value.trim();
    if (!title) {
      toast("Enter a title");
      return null;
    }
    payload.title = title;
  }

  if ($("#updateRolesEnabled").checked) {
    const roles = checkedValues(form.elements.roleNames);
    if (!roles.length) {
      toast("Choose at least one role");
      return null;
    }
    payload.roleNames = roles;
  }

  if ($("#updateProjectsEnabled").checked) {
    const projectIds = splitList(form.elements.userProjectIds.value);
    if (!projectIds.length) {
      toast("Enter at least one project ID");
      return null;
    }
    payload.userProjectIds = projectIds;
  }

  return payload;
}

function previewUserBulkUpdate(form) {
  previewBulkUpdate({
    key: "userBulkUpdate",
    ids: Array.from(state.selectedIds),
    form,
    statusSelector: "#usersStatus",
    label: "user",
    payloadBuilder: collectUserBulkUpdatePayload
  });
}

async function bulkUpdateUsers(form) {
  if (!requirePreviewReady("userBulkUpdate", "Preview the user update first")) return;
  const ids = Array.from(state.selectedIds);
  if (!ids.length) return toast("Select at least one user");

  const payload = collectUserBulkUpdatePayload(form);
  if (!payload) return;
  if (!Object.keys(payload).length) return toast("Choose at least one update field");

  await runWithToast(async () => {
    const result = await api("/api/users/bulk/update", {
      method: "POST",
      body: {
        ids,
        payload,
        resetProjectPermissions: form.elements.resetProjectPermissions.checked,
        continueOnError: form.elements.continueOnError.checked
      }
    });
    reportBulkResult(result, "updated");
    setPreviewReady("userBulkUpdate", false);
    await loadUsers();
    return "Bulk update complete";
  }, showUsersError);
}

function previewUserBulkDelete() {
  previewBulkDelete({
    key: "userBulkDelete",
    ids: Array.from(state.selectedIds),
    statusSelector: "#usersStatus",
    label: "user"
  });
}

async function bulkDeleteUsers() {
  if (!requirePreviewReady("userBulkDelete", "Preview the user delete first")) return;
  const ids = Array.from(state.selectedIds);
  if (!ids.length) return toast("Select at least one user");
  if (!window.confirm(`Delete ${ids.length} selected user${ids.length === 1 ? "" : "s"}?`)) return;

  const form = $("#bulkUpdateForm");
  await runWithToast(async () => {
    const result = await api("/api/users/bulk/delete", {
      method: "POST",
      body: {
        ids,
        continueOnError: form.elements.continueOnError.checked
      }
    });
    reportBulkResult(result, "deleted");
    state.selectedIds.clear();
    setPreviewReady("userBulkDelete", false);
    await loadUsers();
    return "Bulk delete complete";
  }, showUsersError);
}

function reportBulkResult(result, verb) {
  const results = result.results || [];
  const failed = results.filter((item) => item.status === "failed");
  $("#usersStatus").textContent = `${results.length - failed.length} ${verb}, ${failed.length} failed`;
  $("#usersStatus").classList.toggle("error", failed.length > 0);
}

function showUsersError(message) {
  const status = $("#usersStatus");
  status.classList.add("error");
  status.textContent = message;
}

async function loadProjects() {
  const status = $("#projectsStatus");
  status.classList.remove("error");
  status.textContent = "Loading...";

  await runWithToast(async () => {
    const params = new URLSearchParams({
      includeArchived: String($("#includeArchivedProjects").checked)
    });
    const result = await api(`/api/projects?${params}`);
    state.projects = result.projects || [];
    state.selectedProjectIds.clear();
    renderProjects();
    status.textContent = `${state.projects.length} projects loaded`;
    return "Projects refreshed";
  }, (message) => showEntityError("#projectsStatus", message));
}

function renderProjects() {
  const tbody = $("#projectsTable");
  tbody.innerHTML = "";

  for (const project of visibleProjects()) {
    const id = project.projectId || project.id;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="select-col">
        <input class="project-select" type="checkbox" aria-label="Select ${escapeHtml(project.name || "project")}" data-id="${escapeHtml(id)}" ${state.selectedProjectIds.has(id) ? "checked" : ""}>
      </td>
      <td>${escapeHtml(project.name || "")}</td>
      <td>${escapeHtml(project.clientName || "")}</td>
      <td>${escapeHtml(project.country || "")}</td>
      <td>${escapeHtml(project.state || "")}</td>
      <td>${escapeHtml(project.isArchived ? "Archived" : "Active")}</td>
    `;
    tr.addEventListener("click", (event) => {
      if (event.target.matches("input")) return;
      toggleProjectSelected(id);
    });
    tbody.appendChild(tr);
  }

  $$(".project-select").forEach((checkbox) => {
    checkbox.addEventListener("change", (event) => {
      setProjectSelected(event.target.dataset.id, event.target.checked);
    });
  });
  renderProjectSelectionState();
}

function visibleProjects() {
  const search = $("#projectSearch").value.trim().toLowerCase();
  if (!search) return state.projects;
  return state.projects.filter((project) => {
    return [project.name, project.clientName, project.internalIdentifier, project.country, project.state]
      .some((value) => String(value || "").toLowerCase().includes(search));
  });
}

function toggleProjectSelected(id) {
  setProjectSelected(id, !state.selectedProjectIds.has(id));
  renderProjects();
}

function setProjectSelected(id, selected) {
  if (!id) return;
  if (selected) state.selectedProjectIds.add(id);
  else state.selectedProjectIds.delete(id);
  renderProjectSelectionState();
}

function setVisibleProjectSelection(selected) {
  for (const project of visibleProjects()) {
    const id = project.projectId || project.id;
    if (selected) state.selectedProjectIds.add(id);
    else state.selectedProjectIds.delete(id);
  }
  renderProjects();
}

function renderProjectSelectionState() {
  const visible = visibleProjects();
  const selectedVisible = visible.filter((project) => state.selectedProjectIds.has(project.projectId || project.id)).length;
  const allCheckbox = $("#selectAllProjects");
  allCheckbox.checked = Boolean(visible.length && selectedVisible === visible.length);
  allCheckbox.indeterminate = selectedVisible > 0 && selectedVisible < visible.length;
  $("#projectSelectionCount").textContent = `${state.selectedProjectIds.size} selected`;
  setPreviewReady("projectBulkUpdate", false);
}

function previewProjectBulkUpdate(form) {
  previewBulkUpdate({
    key: "projectBulkUpdate",
    ids: Array.from(state.selectedProjectIds),
    form,
    statusSelector: "#projectsStatus",
    label: "project"
  });
}

async function bulkUpdateProjects(form) {
  if (!requirePreviewReady("projectBulkUpdate", "Preview the project update first")) return;
  const ids = Array.from(state.selectedProjectIds);
  if (!ids.length) return toast("Select at least one project");
  const payload = payloadFromEnabledFields(form);
  if (!Object.keys(payload).length) return toast("Choose at least one update field");

  await runWithToast(async () => {
    const result = await api("/api/projects/bulk/update", {
      method: "POST",
      body: {
        ids,
        payload,
        continueOnError: form.elements.continueOnError.checked
      }
    });
    reportEntityBulkResult("#projectsStatus", result, "updated");
    setPreviewReady("projectBulkUpdate", false);
    await loadProjects();
    return "Project update complete";
  }, (message) => showEntityError("#projectsStatus", message));
}

async function loadEmployers() {
  const status = $("#employersStatus");
  status.classList.remove("error");
  status.textContent = "Loading...";

  await runWithToast(async () => {
    const result = await api("/api/employer-profiles");
    state.employerProfiles = result.employerProfiles || [];
    state.selectedEmployerIds.clear();
    renderEmployers();
    status.textContent = `${state.employerProfiles.length} employer profiles loaded`;
    return "Employer profiles refreshed";
  }, (message) => showEntityError("#employersStatus", message));
}

function renderEmployers() {
  const tbody = $("#employersTable");
  tbody.innerHTML = "";

  for (const employer of visibleEmployers()) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="select-col">
        <input class="employer-select" type="checkbox" aria-label="Select ${escapeHtml(employer.businessName || "employer profile")}" data-id="${escapeHtml(employer.id)}" ${state.selectedEmployerIds.has(employer.id) ? "checked" : ""}>
      </td>
      <td>${escapeHtml(employer.businessName || "")}</td>
      <td>${escapeHtml(employer.regionalEntityIdentifier || "")}</td>
      <td>${escapeHtml(employer.internalIdentifier || "")}</td>
      <td>${escapeHtml(employer.deactivatedDate ? "Deactivated" : "Active")}</td>
    `;
    tr.addEventListener("click", (event) => {
      if (event.target.matches("input")) return;
      toggleEmployerSelected(employer.id);
    });
    tbody.appendChild(tr);
  }

  $$(".employer-select").forEach((checkbox) => {
    checkbox.addEventListener("change", (event) => {
      setEmployerSelected(event.target.dataset.id, event.target.checked);
    });
  });
  renderEmployerSelectionState();
}

function visibleEmployers() {
  const search = $("#employerSearch").value.trim().toLowerCase();
  if (!search) return state.employerProfiles;
  return state.employerProfiles.filter((employer) => {
    return [employer.businessName, employer.regionalEntityIdentifier, employer.internalIdentifier]
      .some((value) => String(value || "").toLowerCase().includes(search));
  });
}

function toggleEmployerSelected(id) {
  setEmployerSelected(id, !state.selectedEmployerIds.has(id));
  renderEmployers();
}

function setEmployerSelected(id, selected) {
  if (!id) return;
  if (selected) state.selectedEmployerIds.add(id);
  else state.selectedEmployerIds.delete(id);
  renderEmployerSelectionState();
}

function setVisibleEmployerSelection(selected) {
  for (const employer of visibleEmployers()) {
    if (selected) state.selectedEmployerIds.add(employer.id);
    else state.selectedEmployerIds.delete(employer.id);
  }
  renderEmployers();
}

function renderEmployerSelectionState() {
  const visible = visibleEmployers();
  const selectedVisible = visible.filter((employer) => state.selectedEmployerIds.has(employer.id)).length;
  const allCheckbox = $("#selectAllEmployers");
  allCheckbox.checked = Boolean(visible.length && selectedVisible === visible.length);
  allCheckbox.indeterminate = selectedVisible > 0 && selectedVisible < visible.length;
  $("#employerSelectionCount").textContent = `${state.selectedEmployerIds.size} selected`;
  setPreviewReady("employerBulkUpdate", false);
}

function previewEmployerBulkUpdate(form) {
  previewBulkUpdate({
    key: "employerBulkUpdate",
    ids: Array.from(state.selectedEmployerIds),
    form,
    statusSelector: "#employersStatus",
    label: "employer profile"
  });
}

async function bulkUpdateEmployers(form) {
  if (!requirePreviewReady("employerBulkUpdate", "Preview the employer profile update first")) return;
  const ids = Array.from(state.selectedEmployerIds);
  if (!ids.length) return toast("Select at least one employer profile");
  const payload = payloadFromEnabledFields(form);
  if (!Object.keys(payload).length) return toast("Choose at least one update field");

  await runWithToast(async () => {
    const result = await api("/api/employer-profiles/bulk/update", {
      method: "POST",
      body: {
        ids,
        payload,
        continueOnError: form.elements.continueOnError.checked
      }
    });
    reportEntityBulkResult("#employersStatus", result, "updated");
    setPreviewReady("employerBulkUpdate", false);
    await loadEmployers();
    return "Employer profile update complete";
  }, (message) => showEntityError("#employersStatus", message));
}

async function loadEquipmentProfiles() {
  const status = $("#equipmentStatus");
  status.classList.remove("error");
  status.textContent = "Loading...";

  await runWithToast(async () => {
    const result = await api("/api/equipment-profiles");
    state.equipmentProfiles = result.equipmentProfiles || [];
    state.selectedEquipmentIds.clear();
    renderEquipmentProfiles();
    renderEquipmentAssignmentOverrides();
    status.textContent = `${state.equipmentProfiles.length} equipment profiles loaded`;
    return "Equipment profiles refreshed";
  }, (message) => showEntityError("#equipmentStatus", message));
}

function renderEquipmentProfiles() {
  const tbody = $("#equipmentTable");
  tbody.innerHTML = "";

  for (const equipment of visibleEquipmentProfiles()) {
    const id = equipment.id || "";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="select-col">
        <input class="equipment-select" type="checkbox" aria-label="Select ${escapeHtml(equipmentLabel(equipment) || "equipment profile")}" data-id="${escapeHtml(id)}" ${state.selectedEquipmentIds.has(id) ? "checked" : ""}>
      </td>
      <td>${escapeHtml(equipmentLabel(equipment))}</td>
      <td>${escapeHtml(equipment.owner || "")}</td>
      <td>${escapeHtml(equipment.registrationNumber || "")}</td>
      <td>${escapeHtml(equipment.serialNumber || "")}</td>
      <td>${escapeHtml(lookupLabel(equipment.equipmentType))}</td>
      <td>${escapeHtml(id)}</td>
    `;
    tr.addEventListener("click", (event) => {
      if (event.target.matches("input")) return;
      toggleEquipmentSelected(id);
    });
    tbody.appendChild(tr);
  }

  $$(".equipment-select").forEach((checkbox) => {
    checkbox.addEventListener("change", (event) => {
      setEquipmentSelected(event.target.dataset.id, event.target.checked);
    });
  });
  renderEquipmentSelectionState();
}

function visibleEquipmentProfiles() {
  const search = $("#equipmentSearch").value.trim().toLowerCase();
  if (!search) return state.equipmentProfiles;
  return state.equipmentProfiles.filter((equipment) => {
    return [
      equipmentLabel(equipment),
      equipment.owner,
      equipment.registrationNumber,
      equipment.serialNumber,
      lookupLabel(equipment.equipmentType),
      equipment.id
    ].some((value) => String(value || "").toLowerCase().includes(search));
  });
}

function lookupLabel(value) {
  if (!value || typeof value !== "object") return value || "";
  return value.name || value.displayName || value.businessName || value.id || "";
}

function equipmentLabel(equipment) {
  if (!equipment) return "";
  return [
    equipment.make,
    equipment.model,
    equipment.registrationNumber || equipment.serialNumber || equipment.humanReferenceNumber
  ].filter(Boolean).join(" ");
}

function toggleEquipmentSelected(id) {
  setEquipmentSelected(id, !state.selectedEquipmentIds.has(id));
  renderEquipmentProfiles();
}

function setEquipmentSelected(id, selected) {
  if (!id) return;
  if (selected) state.selectedEquipmentIds.add(id);
  else state.selectedEquipmentIds.delete(id);
  renderEquipmentSelectionState();
  renderEquipmentAssignmentOverrides();
}

function setVisibleEquipmentSelection(selected) {
  for (const equipment of visibleEquipmentProfiles()) {
    if (selected) state.selectedEquipmentIds.add(equipment.id);
    else state.selectedEquipmentIds.delete(equipment.id);
  }
  renderEquipmentProfiles();
}

function renderEquipmentSelectionState() {
  const visible = visibleEquipmentProfiles();
  const selectedVisible = visible.filter((equipment) => state.selectedEquipmentIds.has(equipment.id)).length;
  const allCheckbox = $("#selectAllEquipment");
  allCheckbox.checked = Boolean(visible.length && selectedVisible === visible.length);
  allCheckbox.indeterminate = selectedVisible > 0 && selectedVisible < visible.length;
  $("#equipmentSelectionCount").textContent = `${state.selectedEquipmentIds.size} selected`;
  setPreviewReady("equipmentBulkUpdate", false);
  setPreviewReady("equipmentBulkDelete", false);
  setPreviewReady("equipmentAssignmentCreate", false);
}

function previewEquipmentProfileUpdate(form) {
  previewBulkUpdate({
    key: "equipmentBulkUpdate",
    ids: Array.from(state.selectedEquipmentIds),
    form,
    statusSelector: "#equipmentStatus",
    label: "equipment profile"
  });
}

async function bulkUpdateEquipmentProfiles(form) {
  if (!requirePreviewReady("equipmentBulkUpdate", "Preview the equipment profile update first")) return;
  const ids = Array.from(state.selectedEquipmentIds);
  if (!ids.length) return toast("Select at least one equipment profile");
  const payload = payloadFromEnabledFields(form);
  if (!Object.keys(payload).length) return toast("Choose at least one update field");

  await runWithToast(async () => {
    const result = await api("/api/equipment-profiles/bulk/update", {
      method: "POST",
      body: {
        ids,
        payload,
        continueOnError: form.elements.continueOnError.checked
      }
    });
    reportEntityBulkResult("#equipmentStatus", result, "updated");
    setPreviewReady("equipmentBulkUpdate", false);
    await loadEquipmentProfiles();
    return "Equipment profile update complete";
  }, (message) => showEntityError("#equipmentStatus", message));
}

function previewEquipmentProfileDelete() {
  previewBulkDelete({
    key: "equipmentBulkDelete",
    ids: Array.from(state.selectedEquipmentIds),
    statusSelector: "#equipmentStatus",
    label: "equipment profile"
  });
}

async function bulkDeleteEquipmentProfiles() {
  if (!requirePreviewReady("equipmentBulkDelete", "Preview the equipment profile delete first")) return;
  const ids = Array.from(state.selectedEquipmentIds);
  if (!ids.length) return toast("Select at least one equipment profile");
  if (!window.confirm(`Delete ${ids.length} selected equipment profile${ids.length === 1 ? "" : "s"}?`)) return;

  const form = $("#bulkEquipmentUpdateForm");
  await runWithToast(async () => {
    const result = await api("/api/equipment-profiles/bulk/delete", {
      method: "POST",
      body: {
        ids,
        continueOnError: form.elements.continueOnError.checked
      }
    });
    reportEntityBulkResult("#equipmentStatus", result, "deleted");
    state.selectedEquipmentIds.clear();
    setPreviewReady("equipmentBulkDelete", false);
    await loadEquipmentProfiles();
    return "Equipment profile delete complete";
  }, (message) => showEntityError("#equipmentStatus", message));
}

async function loadEquipmentProjects() {
  const status = $("#equipmentAssignmentStatus");
  status.classList.remove("error");
  status.textContent = "Loading projects...";

  await runWithToast(async () => {
    const result = await api("/api/projects?includeArchived=false");
    state.equipmentProjects = normalizeProjectList(result.projects || []);
    renderEquipmentAssignmentProjectOptions();
    status.textContent = `${state.equipmentProjects.length} projects loaded`;
    return "Equipment project list refreshed";
  }, (message) => showEntityError("#equipmentAssignmentStatus", message));
}

function renderEquipmentAssignmentProjectOptions() {
  const selectors = [
    $("#equipmentAssignmentProjectIds"),
    $("#equipmentInductionProjectFilter"),
    $("#equipmentInductionUpdateProjectId"),
    ...$$(".equipment-assignment-project-select")
  ].filter(Boolean);

  for (const select of selectors) {
    const previous = new Set(Array.from(select.selectedOptions || []).map((option) => option.value));
    const includeBlank = !select.multiple;
    select.innerHTML = `${includeBlank ? `<option value="">${select.id === "equipmentInductionProjectFilter" ? "All projects" : "Select"}</option>` : ""}${equipmentProjectOptionsHtml(previous)}`;
  }
}

function equipmentProjectOptionsHtml(selected = new Set()) {
  return state.equipmentProjects.map((project) => (
    `<option value="${escapeHtml(project.id)}"${selected.has(project.id) ? " selected" : ""}>${escapeHtml(project.name)}</option>`
  )).join("");
}

function normalizeProjectList(projects) {
  return projects.map((project) => ({
    id: project.projectId || project.id || "",
    name: project.name || project.projectName || project.projectId || project.id || ""
  })).filter((project) => project.id).sort((a, b) => a.name.localeCompare(b.name));
}

function renderEquipmentAssignmentOverrides() {
  const container = $("#equipmentAssignmentOverrides");
  if (!container) return;
  container.innerHTML = "";

  const selected = state.equipmentProfiles.filter((equipment) => state.selectedEquipmentIds.has(equipment.id));
  if (!selected.length) {
    container.innerHTML = `<div class="inline-hint">Select equipment profiles above to configure per-equipment overrides.</div>`;
    return;
  }

  for (const equipment of selected) {
    const details = document.createElement("details");
    details.className = "equipment-assignment-card";
    details.dataset.equipmentId = equipment.id;
    details.innerHTML = `
      <summary>
        <span class="equipment-assignment-summary">
          <span class="equipment-assignment-name">${escapeHtml(equipmentLabel(equipment) || equipment.id)}</span>
          <span class="equipment-assignment-meta">${escapeHtml(equipment.owner || "")}</span>
        </span>
      </summary>
      <div class="equipment-assignment-detail">
        <form class="equipment-assignment-override-form">
          <div class="settings-grid import-override-grid">
            <fieldset class="wide-field">
              <legend>Project Override</legend>
              <label>
                <span>Project Names</span>
                <select name="projectIds" multiple size="6" class="equipment-assignment-project-select">
                  ${equipmentProjectOptionsHtml()}
                </select>
              </label>
              <div class="select-actions">
                <button class="ghost-button select-options-button" type="button" data-select-name="projectIds" data-action="select">Select All</button>
                <button class="ghost-button select-options-button" type="button" data-select-name="projectIds" data-action="clear">Use Global</button>
              </div>
            </fieldset>
            <fieldset>
              <legend>Dates</legend>
              <label><span>Induction Date</span><input name="inductionDate" type="datetime-local"></label>
              <label><span>Date Updated</span><input name="dateUpdated" type="datetime-local"></label>
            </fieldset>
            <fieldset>
              <legend>Required Checks</legend>
              <label>
                <span>Service Record Available</span>
                <select name="serviceRecordAvailable">
                  <option value="">Use global</option>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              </label>
              <label>
                <span>Good Condition</span>
                <select name="isGoodCondition">
                  <option value="">Use global</option>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              </label>
              <label>
                <span>Inspection Failed</span>
                <select name="isInspectionFailed">
                  <option value="">Use global</option>
                  <option value="false">No</option>
                  <option value="true">Yes</option>
                </select>
              </label>
            </fieldset>
          </div>
        </form>
      </div>
    `;
    container.appendChild(details);
  }
}

function previewEquipmentAssignments() {
  setPreviewReady("equipmentAssignmentCreate", false);
  const equipmentProfileIds = Array.from(state.selectedEquipmentIds);
  if (!equipmentProfileIds.length) return toast("Select at least one equipment profile");
  const form = $("#equipmentAssignmentForm");
  const settings = collectEquipmentInductionSettings(form);
  const projectIds = arrayValue(settings.projectIds);
  if (!projectIds.length) return toast("Select at least one project");
  markPreviewReady(
    "equipmentAssignmentCreate",
    "#equipmentAssignmentStatus",
    `Preview ready: ${equipmentProfileIds.length} equipment profile${equipmentProfileIds.length === 1 ? "" : "s"} will be assigned to ${projectIds.length} project${projectIds.length === 1 ? "" : "s"}.`
  );
}

async function createEquipmentAssignments() {
  if (!requirePreviewReady("equipmentAssignmentCreate", "Preview the equipment assignments first")) return;
  const equipmentProfileIds = Array.from(state.selectedEquipmentIds);
  if (!equipmentProfileIds.length) return toast("Select at least one equipment profile");
  const form = $("#equipmentAssignmentForm");
  const settings = collectEquipmentInductionSettings(form);
  const projectIds = arrayValue(settings.projectIds);
  delete settings.projectIds;
  if (!projectIds.length) return toast("Select at least one project");

  await runWithToast(async () => {
    const result = await api("/api/equipment-inductions/bulk/create", {
      method: "POST",
      body: {
        equipmentProfileIds,
        projectIds,
        settings,
        equipmentOverrides: collectEquipmentAssignmentOverrides(),
        skipExisting: form.elements.skipExisting.checked,
        continueOnError: form.elements.continueOnError.checked
      }
    });
    reportEquipmentAssignmentResult(result);
    setPreviewReady("equipmentAssignmentCreate", false);
    await loadEquipmentInductions({ quiet: true });
    return "Equipment assignments complete";
  }, (message) => showEntityError("#equipmentAssignmentStatus", message));
}

function collectEquipmentAssignmentOverrides() {
  const overrides = {};
  $$(".equipment-assignment-card").forEach((card) => {
    const equipmentId = card.dataset.equipmentId;
    const form = card.querySelector(".equipment-assignment-override-form");
    const settings = collectEquipmentInductionSettings(form);
    if (equipmentId && Object.keys(settings).length) overrides[equipmentId] = settings;
  });
  return overrides;
}

function collectEquipmentInductionSettings(element) {
  const settings = collectSettingsFromElement(element);
  for (const field of ["inductionDate", "dateUpdated"]) {
    if (settings[field]) settings[field] = normalizeDateTimeInput(settings[field]);
  }
  const projectIds = arrayValue(settings.projectIds);
  if (projectIds.length) settings.projectIds = projectIds;
  return settings;
}

function normalizeDateTimeInput(value) {
  const text = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text) ? `${text}:00` : text;
}

function reportEquipmentAssignmentResult(result) {
  const results = result.results || [];
  const failed = results.filter((item) => ["invalid", "failed"].includes(item.status));
  const skipped = results.filter((item) => item.status === "skipped");
  const success = results.filter((item) => item.status === "success");
  const status = $("#equipmentAssignmentStatus");
  status.classList.toggle("error", failed.length > 0);
  status.textContent = `${success.length} created, ${skipped.length} skipped, ${failed.length} failed`;
}

async function loadEquipmentInductions({ quiet = false } = {}) {
  const status = $("#equipmentInductionsStatus");
  if (!quiet) {
    status.classList.remove("error");
    status.textContent = "Loading assignments...";
  }

  await runWithToast(async () => {
    if (!state.equipmentProjects.length) await loadEquipmentProjects();
    const params = new URLSearchParams({
      includeDeleted: String($("#includeDeletedEquipmentInductions").checked)
    });
    const projectId = $("#equipmentInductionProjectFilter").value;
    if (projectId) params.set("projectId", projectId);
    const result = await api(`/api/equipment-inductions?${params}`);
    state.equipmentInductions = result.equipmentInductions || [];
    state.selectedEquipmentInductionIds.clear();
    renderEquipmentInductions();
    status.textContent = `${state.equipmentInductions.length} equipment assignments loaded`;
    return quiet ? "Assignments refreshed" : "Equipment assignments refreshed";
  }, (message) => showEntityError("#equipmentInductionsStatus", message));
}

function renderEquipmentInductions() {
  const tbody = $("#equipmentInductionsTable");
  tbody.innerHTML = "";

  for (const induction of visibleEquipmentInductions()) {
    const id = induction.id || "";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="select-col">
        <input class="equipment-induction-select" type="checkbox" aria-label="Select ${escapeHtml(equipmentInductionLabel(induction) || "equipment assignment")}" data-id="${escapeHtml(id)}" ${state.selectedEquipmentInductionIds.has(id) ? "checked" : ""}>
      </td>
      <td>${escapeHtml(equipmentInductionLabel(induction))}</td>
      <td>${escapeHtml(lookupLabel(induction.project))}</td>
      <td>${escapeHtml(formatShortDate(induction.inductionDate))}</td>
      <td>${escapeHtml(induction.isDeleted ? "Deleted" : lookupLabel(induction.status) || induction.status || "")}</td>
      <td>${escapeHtml(id)}</td>
    `;
    tr.addEventListener("click", (event) => {
      if (event.target.matches("input")) return;
      toggleEquipmentInductionSelected(id);
    });
    tbody.appendChild(tr);
  }

  $$(".equipment-induction-select").forEach((checkbox) => {
    checkbox.addEventListener("change", (event) => {
      setEquipmentInductionSelected(event.target.dataset.id, event.target.checked);
    });
  });
  renderEquipmentInductionSelectionState();
}

function visibleEquipmentInductions() {
  const search = $("#equipmentInductionSearch").value.trim().toLowerCase();
  if (!search) return state.equipmentInductions;
  return state.equipmentInductions.filter((induction) => {
    return [
      equipmentInductionLabel(induction),
      lookupLabel(induction.project),
      induction.status,
      induction.id,
      induction.uniqueCode
    ].some((value) => String(value || "").toLowerCase().includes(search));
  });
}

function equipmentInductionLabel(induction) {
  return equipmentLabel(induction.equipmentProfile) || lookupLabel(induction.equipmentProfile);
}

function toggleEquipmentInductionSelected(id) {
  setEquipmentInductionSelected(id, !state.selectedEquipmentInductionIds.has(id));
  renderEquipmentInductions();
}

function setEquipmentInductionSelected(id, selected) {
  if (!id) return;
  if (selected) state.selectedEquipmentInductionIds.add(id);
  else state.selectedEquipmentInductionIds.delete(id);
  renderEquipmentInductionSelectionState();
}

function setVisibleEquipmentInductionSelection(selected) {
  for (const induction of visibleEquipmentInductions()) {
    if (selected) state.selectedEquipmentInductionIds.add(induction.id);
    else state.selectedEquipmentInductionIds.delete(induction.id);
  }
  renderEquipmentInductions();
}

function renderEquipmentInductionSelectionState() {
  const visible = visibleEquipmentInductions();
  const selectedVisible = visible.filter((induction) => state.selectedEquipmentInductionIds.has(induction.id)).length;
  const allCheckbox = $("#selectAllEquipmentInductions");
  allCheckbox.checked = Boolean(visible.length && selectedVisible === visible.length);
  allCheckbox.indeterminate = selectedVisible > 0 && selectedVisible < visible.length;
  $("#equipmentInductionSelectionCount").textContent = `${state.selectedEquipmentInductionIds.size} selected`;
  setPreviewReady("equipmentInductionBulkUpdate", false);
  setPreviewReady("equipmentInductionBulkDelete", false);
}

function collectEquipmentInductionBulkPayload(form) {
  const payload = payloadFromEnabledFields(form);
  for (const field of ["inductionDate", "dateUpdated"]) {
    if (payload[field]) payload[field] = normalizeDateTimeInput(payload[field]);
  }
  return payload;
}

function previewEquipmentInductionUpdate(form) {
  previewBulkUpdate({
    key: "equipmentInductionBulkUpdate",
    ids: Array.from(state.selectedEquipmentInductionIds),
    form,
    statusSelector: "#equipmentInductionsStatus",
    label: "equipment assignment",
    payloadBuilder: collectEquipmentInductionBulkPayload
  });
}

async function bulkUpdateEquipmentInductions(form) {
  if (!requirePreviewReady("equipmentInductionBulkUpdate", "Preview the equipment assignment update first")) return;
  const ids = Array.from(state.selectedEquipmentInductionIds);
  if (!ids.length) return toast("Select at least one equipment assignment");
  const payload = collectEquipmentInductionBulkPayload(form);
  if (!Object.keys(payload).length) return toast("Choose at least one update field");

  await runWithToast(async () => {
    const result = await api("/api/equipment-inductions/bulk/update", {
      method: "POST",
      body: {
        ids,
        payload,
        continueOnError: form.elements.continueOnError.checked
      }
    });
    reportEntityBulkResult("#equipmentInductionsStatus", result, "updated");
    setPreviewReady("equipmentInductionBulkUpdate", false);
    await loadEquipmentInductions({ quiet: true });
    return "Equipment assignment update complete";
  }, (message) => showEntityError("#equipmentInductionsStatus", message));
}

function previewEquipmentInductionDelete() {
  previewBulkDelete({
    key: "equipmentInductionBulkDelete",
    ids: Array.from(state.selectedEquipmentInductionIds),
    statusSelector: "#equipmentInductionsStatus",
    label: "equipment assignment"
  });
}

async function bulkDeleteEquipmentInductions() {
  if (!requirePreviewReady("equipmentInductionBulkDelete", "Preview the equipment assignment delete first")) return;
  const ids = Array.from(state.selectedEquipmentInductionIds);
  if (!ids.length) return toast("Select at least one equipment assignment");
  if (!window.confirm(`Delete ${ids.length} selected equipment assignment${ids.length === 1 ? "" : "s"}?`)) return;

  const form = $("#bulkEquipmentInductionUpdateForm");
  await runWithToast(async () => {
    const result = await api("/api/equipment-inductions/bulk/delete", {
      method: "POST",
      body: {
        ids,
        continueOnError: form.elements.continueOnError.checked
      }
    });
    reportEntityBulkResult("#equipmentInductionsStatus", result, "deleted");
    state.selectedEquipmentInductionIds.clear();
    setPreviewReady("equipmentInductionBulkDelete", false);
    await loadEquipmentInductions({ quiet: true });
    return "Equipment assignment delete complete";
  }, (message) => showEntityError("#equipmentInductionsStatus", message));
}

function setDefaultEquipmentInductionDates() {
  const value = localDateTimeValue(new Date());
  const form = $("#equipmentAssignmentForm");
  if (!form) return;
  if (!form.elements.inductionDate.value) form.elements.inductionDate.value = value;
  if (!form.elements.dateUpdated.value) form.elements.dateUpdated.value = value;
  if (!form.elements.serviceRecordAvailable.value) form.elements.serviceRecordAvailable.value = "true";
  if (!form.elements.isGoodCondition.value) form.elements.isGoodCondition.value = "true";
  if (!form.elements.isInspectionFailed.value) form.elements.isInspectionFailed.value = "false";
}

function localDateTimeValue(date) {
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatShortDate(value) {
  return String(value || "").replace("T", " ").slice(0, 16);
}

async function loadInspectionChecklists() {
  const status = $("#checklistsStatus");
  status.classList.remove("error");
  status.textContent = "Loading...";

  await runWithToast(async () => {
    const result = await api("/api/inspection-checklists");
    state.inspectionChecklists = result.checklists || [];
    renderInspectionChecklists();
    renderBulkChecklistSelect();
    await loadInspectionObservationTypes();
    status.textContent = `${state.inspectionChecklists.length} checklists loaded`;
    return "Inspection checklists refreshed";
  }, (message) => showEntityError("#checklistsStatus", message));
}

function renderInspectionChecklists() {
  const tbody = $("#checklistsTable");
  if (!tbody) return;
  tbody.innerHTML = "";

  for (const checklist of state.inspectionChecklists) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(checklist.name || "")}</td>
      <td>${escapeHtml(checklist.displayName || "")}</td>
      <td>${escapeHtml(checklist.isInactive ? "Inactive" : checklist.isHiddenFromMainList ? "Hidden" : "Active")}</td>
      <td>${escapeHtml(checklist.id || "")}</td>
    `;
    tbody.appendChild(tr);
  }
}

function renderBulkChecklistSelect() {
  const select = $("#bulkChecklistSelect");
  const previous = new Set(selectedChecklistIds());
  select.innerHTML = "";

  if (!state.inspectionChecklists.length) {
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.disabled = true;
    placeholder.textContent = "Refresh checklists first";
    select.appendChild(placeholder);
  }

  for (const checklist of state.inspectionChecklists) {
    const option = document.createElement("option");
    option.value = checklist.id;
    option.textContent = checklist.name || checklist.displayName || checklist.id;
    option.selected = previous.has(checklist.id);
    select.appendChild(option);
  }
}

async function loadInspectionObservationTypes() {
  try {
    const result = await api("/api/inspection-checklists/observation-types");
    state.inspectionObservationTypes = result.observationTypes || [];
    renderDefaultObservationOptions();
  } catch {
    state.inspectionObservationTypes = [];
    renderDefaultObservationOptions();
  }
}

function renderDefaultObservationOptions(extraIds = []) {
  const select = $("#defaultObservationTypeSelect");
  if (!select) return;
  const previous = select.value;
  select.innerHTML = observationTypeOptionsHtml(previous, { blankLabel: "No change", extraIds });
  if (previous) select.value = previous;
  renderChecklistImportObservationOptions();
}

function renderChecklistImportObservationOptions() {
  const globalSelect = $("#checklistImportDefaultObservationTypeSelect");
  if (globalSelect) {
    const previous = globalSelect.value;
    globalSelect.innerHTML = observationTypeOptionsHtml(previous, { blankLabel: "No default" });
    if (previous) globalSelect.value = previous;
  }

  $$(".checklist-import-observation-select").forEach((select) => {
    const previous = select.value;
    select.innerHTML = observationTypeOptionsHtml(previous, { blankLabel: "Use global" });
    if (previous) select.value = previous;
  });
}

function observationTypeOptionsHtml(selected = "", { blankLabel = "No change", extraIds = [] } = {}) {
  const seen = new Set(["", "__clear"]);
  const options = [
    `<option value=""${selected === "" ? " selected" : ""}>${escapeHtml(blankLabel)}</option>`,
    `<option value="__clear"${selected === "__clear" ? " selected" : ""}>Clear</option>`
  ];

  for (const item of state.inspectionObservationTypes) {
    if (!item.id || seen.has(item.id)) continue;
    seen.add(item.id);
    options.push(`<option value="${escapeHtml(item.id)}"${selected === item.id ? " selected" : ""}>${escapeHtml(item.name || item.id)}</option>`);
  }

  for (const id of extraIds) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    options.push(`<option value="${escapeHtml(id)}"${selected === id ? " selected" : ""}>${escapeHtml(`Existing ${id}`)}</option>`);
  }

  return options.join("");
}

async function loadChecklistForBulkUpdate() {
  const ids = selectedChecklistIds();
  if (!ids.length) return toast("Select at least one checklist");
  setPreviewReady("checklistBulk", false);

  const status = $("#checklistsStatus");
  status.classList.remove("error");
  status.textContent = "Loading checklists...";

  await runWithToast(async () => {
    state.checklistBulkDetails.clear();
    for (const id of ids) {
      state.checklistBulkDetails.set(id, await api(`/api/inspection-checklists/${encodeURIComponent(id)}`));
    }
    renderDefaultObservationOptions(defaultIssueTypeIdsFromChecklists(Array.from(state.checklistBulkDetails.values())));
    renderChecklistBulkSummary();
    renderLoadedChecklistDetails();
    status.textContent = `${ids.length} checklist${ids.length === 1 ? "" : "s"} loaded`;
    return "Checklists loaded";
  }, (message) => showEntityError("#checklistsStatus", message));
}

function resetChecklistBulkSelection() {
  state.checklistBulkDetails.clear();
  setPreviewReady("checklistBulk", false);
  renderDefaultObservationOptions();
  renderChecklistBulkResults([]);
  renderChecklistBulkSummary();
}

function renderChecklistBulkSummary(result) {
  const element = $("#checklistBulkSummary");
  if (result?.summary) {
    const summary = result.summary;
    element.textContent = `${summary.targetQuestions} questions across ${summary.completedCount} checklist${summary.completedCount === 1 ? "" : "s"}; ${summary.failedCount} failed`;
    return;
  }

  const summaries = Array.from(state.checklistBulkDetails.values()).map(summarizeChecklistQuestions).filter(Boolean);
  if (!summaries.length) {
    const ids = selectedChecklistIds();
    element.textContent = ids.length ? `${ids.length} checklist${ids.length === 1 ? "" : "s"} selected` : "No checklist selected";
    return;
  }
  const summary = summarizeChecklistSummaries(summaries);
  element.textContent = `${summary.targetQuestions} will update across ${summaries.length} checklist${summaries.length === 1 ? "" : "s"} (${summary.yesNoQuestions} Y/N, ${summary.yesNoNaQuestions} Y/N/NA); ${summary.skippedQuestions} skipped`;
}

function renderLoadedChecklistDetails() {
  const results = Array.from(state.checklistBulkDetails.entries()).map(([id, checklist]) => {
    const summary = summarizeChecklistQuestions(checklist) || {};
    return {
      status: "loaded",
      checklist: {
        id,
        name: checklist?.name || checklist?.Name || checklist?.displayName || checklist?.DisplayName || id,
        displayName: checklist?.displayName || checklist?.DisplayName || ""
      },
      summary
    };
  });
  renderChecklistBulkResults(results);
}

async function runChecklistBulkUpdate(apply) {
  if (apply && !requirePreviewReady("checklistBulk", "Preview the checklist update first")) return;
  const ids = selectedChecklistIds();
  if (!ids.length) return toast("Select at least one checklist");
  const settings = collectChecklistBulkSettings();
  if (!Object.keys(settings).length) return toast("Choose at least one checklist setting");
  if (apply && !window.confirm(`Update all Yes/No and Yes/No/NA questions in ${ids.length} selected checklist${ids.length === 1 ? "" : "s"}?`)) return;

  const status = $("#checklistsStatus");
  status.classList.remove("error");
  status.textContent = apply ? "Updating checklists..." : "Previewing checklist updates...";
  if (!apply) setPreviewReady("checklistBulk", false);

  await runWithToast(async () => {
    const action = apply ? "apply" : "plan";
    const result = await api(`/api/inspection-checklists/bulk-yn-update/${action}`, {
      method: "POST",
      body: {
        ids,
        settings,
        continueOnError: true
      }
    });
    renderChecklistBulkSummary(result);
    renderChecklistBulkResults(result.results || []);
    status.textContent = `${result.summary.completedCount} checklist${result.summary.completedCount === 1 ? "" : "s"} ${apply ? "updated" : "ready"}, ${result.summary.failedCount} failed`;
    setPreviewReady("checklistBulk", !apply && result.summary.completedCount > 0);
    return apply ? "Checklist updates complete" : "Preview complete";
  }, (message) => showEntityError("#checklistsStatus", message));
}

function selectedChecklistIds() {
  return Array.from($("#bulkChecklistSelect").selectedOptions || [])
    .map((option) => option.value)
    .filter(Boolean);
}

function renderChecklistBulkResults(results) {
  const tbody = $("#checklistBulkResults");
  tbody.innerHTML = "";
  for (const result of results) {
    const tr = document.createElement("tr");
    const summary = result.summary || {};
    tr.innerHTML = `
      <td>${escapeHtml(result.checklist?.name || result.checklist?.displayName || result.checklist?.id || "")}</td>
      <td><span class="status-badge status-${escapeHtml(result.status || "planned")}">${escapeHtml(result.status || "")}</span></td>
      <td>${escapeHtml(summary.yesNoQuestions ?? "")}</td>
      <td>${escapeHtml(summary.yesNoNaQuestions ?? "")}</td>
      <td>${escapeHtml(summary.skippedQuestions ?? "")}</td>
      <td>${escapeHtml(result.error || "")}</td>
    `;
    tbody.appendChild(tr);
  }
}

function collectChecklistBulkSettings() {
  return collectSettingsFromElement($("#checklistBulkForm"));
}

function collectSettingsFromElement(element) {
  const formData = new FormData(element);
  const settings = {};
  for (const [key, rawValue] of formData.entries()) {
    const value = String(rawValue || "").trim();
    if (value === "" && !key.includes("CustomField")) continue;
    if (settings[key] === undefined) settings[key] = value;
    else if (Array.isArray(settings[key])) settings[key].push(value);
    else settings[key] = [settings[key], value];
  }
  return settings;
}

function userOverrideSettingsHtml() {
  return userImportSettingsHtml({ scope: "override" });
}

function checklistOverrideSettingsHtml() {
  return `
    <div class="settings-grid import-override-grid">
      <fieldset>
        <legend>Question</legend>
        <label>
          <span>Question Type</span>
          <select name="questionType">
            <option value="">Use global</option>
            <option value="2">Yes / No</option>
            <option value="3">Yes / No / N/A</option>
          </select>
        </label>
        <label>
          <span>Question Is Compulsory</span>
          <select name="isCompulsory">
            <option value="">Use global</option>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        </label>
        <label>
          <span>Question Can Be Ignored</span>
          <select name="excludeFromChecklistCompleteCheck">
            <option value="">Use global</option>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        </label>
      </fieldset>
      <fieldset>
        <legend>Custom Text</legend>
        <label><span>For Yes</span><input name="yesText" placeholder="Use global"></label>
        <label><span>For No</span><input name="noText" placeholder="Use global"></label>
        <label><span>For N/A</span><input name="naText" placeholder="Use global"></label>
      </fieldset>
      <fieldset class="wide-field">
        <legend>Observations</legend>
        <div class="three-col">
          <label>
            <span>Raise On Yes</span>
            <select name="raiseObservationOnYesOption">
              <option value="">Use global</option>
              <option value="0">Do Not Raise</option>
              <option value="1">Allow To Be Raised</option>
              <option value="2">Automatically Raise</option>
              <option value="compulsory">Compulsory on Status</option>
            </select>
          </label>
          <label>
            <span>Raise On No</span>
            <select name="raiseObservationOnNoOption">
              <option value="">Use global</option>
              <option value="0">Do Not Raise</option>
              <option value="1">Allow To Be Raised</option>
              <option value="2">Automatically Raise</option>
              <option value="compulsory">Compulsory on Status</option>
            </select>
          </label>
          <label>
            <span>Raise On N/A</span>
            <select name="raiseObservationOnNaOption">
              <option value="">Use global</option>
              <option value="0">Do Not Raise</option>
              <option value="1">Allow To Be Raised</option>
              <option value="2">Automatically Raise</option>
              <option value="compulsory">Compulsory on Status</option>
            </select>
          </label>
        </div>
        <div class="three-col">
          <label>
            <span>Yes Type</span>
            <select name="issueDefaultObservationTypeOnYes">
              <option value="">Use global</option>
              <option value="0">Clear</option>
              <option value="1">Positive</option>
              <option value="-1">Negative</option>
            </select>
          </label>
          <label>
            <span>No Type</span>
            <select name="issueDefaultObservationTypeOnNo">
              <option value="">Use global</option>
              <option value="0">Clear</option>
              <option value="1">Positive</option>
              <option value="-1">Negative</option>
            </select>
          </label>
          <label>
            <span>N/A Type</span>
            <select name="issueDefaultObservationTypeOnNa">
              <option value="">Use global</option>
              <option value="0">Clear</option>
              <option value="1">Positive</option>
              <option value="-1">Negative</option>
            </select>
          </label>
        </div>
      </fieldset>
      <fieldset>
        <legend>Default Details</legend>
        <label>
          <span>Force Default Type</span>
          <select name="isDefaultIssueTypeForced">
            <option value="">Use global</option>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        </label>
        <label>
          <span>Default Priority</span>
          <select name="defaultIssuePriority">
            <option value="">Use global</option>
            <option value="__clear">Clear</option>
            <option value="0">Low</option>
            <option value="1">Medium</option>
            <option value="2">High</option>
            <option value="3">Critical</option>
          </select>
        </label>
      </fieldset>
      <fieldset>
        <legend>Signature</legend>
        <label><span>On Yes</span><select name="signatureOnYes"><option value="">Use global</option><option value="true">Yes</option><option value="false">No</option></select></label>
        <label><span>On No</span><select name="signatureOnNo"><option value="">Use global</option><option value="true">Yes</option><option value="false">No</option></select></label>
        <label><span>On N/A</span><select name="signatureOnNa"><option value="">Use global</option><option value="true">Yes</option><option value="false">No</option></select></label>
      </fieldset>
    </div>
  `;
}

function summarizeChecklistQuestions(checklist) {
  if (!checklist) return null;
  const questions = checklistQuestions(checklist);
  const yesNoQuestions = questions.filter((question) => String(question.checklistQuestionType) === "2").length;
  const yesNoNaQuestions = questions.filter((question) => String(question.checklistQuestionType) === "3").length;
  const targetQuestions = yesNoQuestions + yesNoNaQuestions;
  return {
    totalQuestions: questions.length,
    targetQuestions,
    yesNoQuestions,
    yesNoNaQuestions,
    skippedQuestions: questions.length - targetQuestions
  };
}

function summarizeChecklistSummaries(summaries) {
  return summaries.reduce((total, summary) => ({
    totalQuestions: total.totalQuestions + summary.totalQuestions,
    targetQuestions: total.targetQuestions + summary.targetQuestions,
    yesNoQuestions: total.yesNoQuestions + summary.yesNoQuestions,
    yesNoNaQuestions: total.yesNoNaQuestions + summary.yesNoNaQuestions,
    skippedQuestions: total.skippedQuestions + summary.skippedQuestions
  }), {
    totalQuestions: 0,
    targetQuestions: 0,
    yesNoQuestions: 0,
    yesNoNaQuestions: 0,
    skippedQuestions: 0
  });
}

function checklistQuestions(checklist) {
  if (Array.isArray(checklist?.checklistQuestions)) return checklist.checklistQuestions;
  if (Array.isArray(checklist?.questions)) return checklist.questions;
  if (Array.isArray(checklist?.Questions)) return checklist.Questions;
  return [];
}

function defaultIssueTypeIdsFromChecklists(checklists) {
  return checklists
    .flatMap((checklist) => checklistQuestions(checklist))
    .map((question) => String(question.defaultIssueTypeId || "").trim())
    .filter(Boolean);
}

async function runChecklistImport(apply) {
  if (apply) {
    await applyChecklistImport();
    return;
  }

  const file = $("#checklistFile").files[0];
  if (!file) {
    toast("Choose a checklist spreadsheet");
    return;
  }

  const status = $("#checklistImportStatus");
  status.classList.remove("error");
  status.textContent = "Reading spreadsheet...";
  state.checklistImportOperations = [];
  setChecklistImportApplyEnabled(false);

  await runWithToast(async () => {
    await loadInspectionObservationTypes();
    const params = new URLSearchParams({
      continueOnError: String($("#checklistContinueOnError").checked)
    });
    if ($("#checklistSheetName").value.trim()) params.set("sheet", $("#checklistSheetName").value.trim());
    const result = await api(`/api/inspection-checklists/import/plan?${params}`, {
      method: "POST",
      rawBody: await file.arrayBuffer(),
      headers: {
        "content-type": "application/octet-stream",
        "x-file-name": file.name
      }
    });
    state.checklistImportOperations = result.operations || (result.results || []).map((item) => item.operation).filter(Boolean);
    renderChecklistImportPlan(result);
    return "Spreadsheet preview ready";
  }, (message) => showEntityError("#checklistImportStatus", message));
}

async function applyChecklistImport() {
  if (!requirePreviewReady("checklistImport", "Preview a checklist spreadsheet first")) return;
  if (!state.checklistImportOperations.length) {
    toast("Preview a checklist spreadsheet first");
    setChecklistImportApplyEnabled(false);
    return;
  }

  const status = $("#checklistImportStatus");
  status.classList.remove("error");
  status.textContent = "Creating checklists...";

  await runWithToast(async () => {
    const result = await api("/api/inspection-checklists/import/apply", {
      method: "POST",
      body: {
        operations: state.checklistImportOperations,
        globalSettings: collectSettingsFromElement($("#checklistImportSettingsForm")),
        checklistSettings: collectChecklistImportOverrides(),
        continueOnError: $("#checklistContinueOnError").checked
      }
    });
    renderChecklistImportResults(result);
    await loadInspectionChecklists();
    state.checklistImportOperations = [];
    setChecklistImportApplyEnabled(false);
    return "Checklist upload complete";
  }, (message) => showEntityError("#checklistImportStatus", message));
}

function resetChecklistImportPreview() {
  state.checklistImportOperations = [];
  setChecklistImportApplyEnabled(false);
  const list = $("#checklistImportList");
  if (list) list.innerHTML = "";
  const tbody = $("#checklistImportResults");
  if (tbody) tbody.innerHTML = "";
  const resultsWrap = $("#checklistImportResultsWrap");
  if (resultsWrap) resultsWrap.hidden = true;
  const status = $("#checklistImportStatus");
  if (status) {
    status.classList.remove("error");
    status.textContent = "Preview Spreadsheet before creating checklists";
  }
}

function setChecklistImportApplyEnabled(enabled) {
  setPreviewReady("checklistImport", enabled);
}

function renderChecklistImportPlan(result) {
  const list = $("#checklistImportList");
  list.innerHTML = "";
  $("#checklistImportResults").innerHTML = "";
  $("#checklistImportResultsWrap").hidden = true;

  for (const operation of state.checklistImportOperations) {
    const card = document.createElement("details");
    card.className = "checklist-import-card";
    card.dataset.clientId = operation.clientId || "";
    const errors = operation.errors || [];
    const rowText = checklistOperationRowText(operation);
    card.innerHTML = `
      <summary>
        <span class="checklist-import-summary">
          <span class="checklist-import-name">${escapeHtml(operation.name || "Unnamed checklist")}</span>
          <span class="checklist-import-meta">${escapeHtml(operation.questions?.length || 0)} questions | rows ${escapeHtml(rowText)}</span>
          ${errors.length ? `<span class="status-badge status-invalid">invalid</span>` : ""}
        </span>
        <label class="quick-observation-select">
          <span>Default Observation Type</span>
          <select class="checklist-import-observation-select" data-client-id="${escapeHtml(operation.clientId || "")}">
            ${observationTypeOptionsHtml("", { blankLabel: "Use global" })}
          </select>
        </label>
      </summary>
      <div class="checklist-import-detail">
        ${errors.length ? `<div class="inline-error">${escapeHtml(errors.join("; "))}</div>` : ""}
        <div class="question-preview">${operation.questions?.map((question) => `<div>${escapeHtml(question.zIndex || "")}. ${escapeHtml(question.questionText || "")}</div>`).join("") || ""}</div>
        <form class="checklist-import-override-form">
          ${checklistOverrideSettingsHtml()}
        </form>
      </div>
    `;
    list.appendChild(card);
  }

  $$(".checklist-import-observation-select").forEach((select) => {
    select.addEventListener("click", (event) => event.stopPropagation());
  });

  const failed = (result.results || []).filter((item) => item.status === "invalid" || item.status === "failed").length;
  setChecklistImportApplyEnabled(state.checklistImportOperations.length > 0);
  $("#checklistImportStatus").classList.toggle("error", failed > 0);
  $("#checklistImportStatus").textContent = `${state.checklistImportOperations.length} checklists found, ${failed} invalid`;
}

function collectChecklistImportOverrides() {
  const overrides = {};
  $$(".checklist-import-card").forEach((card) => {
    const clientId = card.dataset.clientId;
    const settings = collectSettingsFromElement(card.querySelector(".checklist-import-override-form"));
    const observationType = card.querySelector(".checklist-import-observation-select")?.value || "";
    if (observationType) settings.defaultIssueTypeId = observationType;
    if (clientId && Object.keys(settings).length) overrides[clientId] = settings;
  });
  return overrides;
}

function renderChecklistImportResults(result) {
  const tbody = $("#checklistImportResults");
  tbody.innerHTML = "";
  $("#checklistImportResultsWrap").hidden = false;
  for (const item of result.results || []) {
    const op = item.operation || {};
    const tr = document.createElement("tr");
    const message = item.error || item.errors?.join("; ") || item.response?.messageText || op.warnings?.join("; ") || "";
    tr.innerHTML = `
      <td>${escapeHtml(checklistOperationRowText(op))}</td>
      <td>${escapeHtml(op.name || op.id || "")}</td>
      <td>${escapeHtml(op.questions?.length || op.payload?.checklistQuestions?.length || "")}</td>
      <td><span class="status-badge status-${escapeHtml(item.status || "planned")}">${escapeHtml(item.status || "")}</span></td>
      <td>${escapeHtml(message)}</td>
    `;
    tbody.appendChild(tr);
  }
  const failed = (result.results || []).filter((item) => item.status === "invalid" || item.status === "failed").length;
  $("#checklistImportStatus").classList.toggle("error", failed > 0);
  $("#checklistImportStatus").textContent = `${result.results?.length || 0} checklists processed, ${failed} failed`;
}

function checklistOperationRowText(operation = {}) {
  return formatRowNumbers(operation.rowNumbers?.length ? operation.rowNumbers : [operation.rowNumber]);
}

function formatRowNumbers(values = []) {
  const numbers = Array.from(new Set(values.map((value) => Number(value)).filter(Number.isFinite)))
    .sort((a, b) => a - b);
  const ranges = [];
  for (let index = 0; index < numbers.length; index += 1) {
    const start = numbers[index];
    let end = start;
    while (numbers[index + 1] === end + 1) {
      end = numbers[index + 1];
      index += 1;
    }
    ranges.push(start === end ? String(start) : `${start}-${end}`);
  }
  return ranges.join(", ");
}

async function loadObservationLookups({ quiet = false, statusSelector = "#observationImportStatus" } = {}) {
  const status = $(statusSelector);
  const load = async () => {
    if (status && !quiet) {
      status.classList.remove("error");
      status.textContent = "Loading categories...";
    }
    const result = await api("/api/observations/lookups");
    state.observationCategories = result.categories || [];
    state.observationLookupsLoaded = true;
    renderObservationSettingsForms();
    renderObservationImportCategoryOptions();
    if (status && !quiet) {
      status.classList.toggle("error", Boolean(result.errors?.length));
      status.textContent = `${state.observationCategories.length} categories loaded${result.errors?.length ? `; ${result.errors.join("; ")}` : ""}`;
    }
    return result;
  };

  if (quiet) {
    try {
      return await load();
    } catch (error) {
      state.observationCategories = [];
      state.observationLookupsLoaded = false;
      renderObservationSettingsForms();
      return { categories: [], errors: [error.message || "Observation categories failed to load"] };
    }
  }

  await runWithToast(async () => {
    await load();
    return "Observation lists refreshed";
  }, (message) => showEntityError(statusSelector, message));
}

function observationLookupErrorText(result) {
  const errors = result?.errors || [];
  return errors.length ? `; ${errors.join("; ")}` : "";
}

function observationLookupHasErrors(result) {
  return Boolean(result?.errors?.length);
}

function observationCategoryCount(result) {
  return result?.categories?.length ?? state.observationCategories.length;
}

function observationRefreshStatusText(typeCount, lookupResult) {
  return `${typeCount} observation types loaded; ${observationCategoryCount(lookupResult)} categories loaded${observationLookupErrorText(lookupResult)}`;
}

function observationRefreshToastText(lookupResult) {
  if (observationLookupHasErrors(lookupResult)) return "Observation types refreshed; categories need attention";
  return "Observation types and categories refreshed";
}

async function refreshObservationLookupsForManage() {
  return loadObservationLookups({
    quiet: true,
    statusSelector: "#observationsStatus"
  });
}

function renderObservationSettingsForms() {
  const importContainer = $("#observationImportGlobalSettings");
  if (importContainer) importContainer.innerHTML = observationSettingsHtml({
    scope: "global",
    blankCategoryLabel: "Select category",
    includeDefaults: true
  });

  const bulkContainer = $("#observationBulkSettings");
  if (bulkContainer) bulkContainer.innerHTML = observationSettingsHtml({
    scope: "bulk",
    blankCategoryLabel: "No change",
    includeDefaults: false
  });
  updateObservationColorPreviews();
  updateCustomFieldAnswerOptions();
}

function observationSettingsHtml({ scope = "global", blankCategoryLabel = "No change", includeDefaults = false } = {}) {
  const checkboxLabel = scope === "override" ? "Use global" : "No change";
  const selectedColor = includeDefaults ? "#3ea3fe" : "";
  return `
    <div class="settings-grid observation-settings-grid">
      <fieldset>
        <legend>Details</legend>
        <label>
          <span>Category</span>
          <select name="categoryId">
            ${observationCategoryOptionsHtml("", { blankLabel: blankCategoryLabel })}
          </select>
        </label>
        <label>
          <span>Color</span>
          <select name="colour" class="observation-color-select">
            ${observationColorOptionsHtml(selectedColor, { blankLabel: checkboxLabel })}
          </select>
          <span class="color-preview" aria-hidden="true"></span>
        </label>
        <label>
          <span>Suggested Priority</span>
          <select name="suggestedPriority">
            <option value="">${escapeHtml(checkboxLabel)}</option>
            <option value="__clear">Clear</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </label>
        <label>
          <span>Force Priority</span>
          <select name="forcePriority">
            <option value="">${escapeHtml(checkboxLabel)}</option>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        </label>
      </fieldset>

      <fieldset>
        <legend>Classification</legend>
        <div class="checkbox-stack">
          ${observationCheckboxHtml("allowableClassifications", "Negative", "Negative", includeDefaults)}
          ${observationCheckboxHtml("allowableClassifications", "Neutral", "Neutral", false)}
          ${observationCheckboxHtml("allowableClassifications", "Positive", "Positive", false)}
        </div>
      </fieldset>

      <fieldset>
        <legend>Availability</legend>
        <div class="checkbox-stack">
          ${observationCheckboxHtml("canRaiseIn", "ObservationsModule", "Observations Module", includeDefaults)}
          ${observationCheckboxHtml("canRaiseIn", "Incidents", "Incidents", false)}
          ${observationCheckboxHtml("canRaiseIn", "Meetings", "Meetings", false)}
          ${observationCheckboxHtml("canRaiseIn", "CustomSections", "Custom Modules", false)}
          ${observationCheckboxHtml("canRaiseIn", "PreTaskPlans", "Pre-Task Plans", false)}
          ${observationCheckboxHtml("canRaiseIn", "SiteDiary", "Daily Report", false)}
        </div>
      </fieldset>

      <fieldset>
        <legend>Who Can Create</legend>
        <div class="checkbox-stack">
          ${observationCheckboxHtml("whoCanCreate", "Employers", "Employers", includeDefaults)}
          ${observationCheckboxHtml("whoCanCreate", "Workers", "Workers", includeDefaults)}
        </div>
      </fieldset>

      <fieldset class="wide-field">
        <legend>Custom Fields</legend>
        <div class="custom-field-sections">
          ${customFieldSettingsHtml("opening", "Raising", checkboxLabel)}
          ${customFieldSettingsHtml("closing", "Closeout", checkboxLabel)}
        </div>
      </fieldset>
    </div>
  `;
}

function customFieldSettingsHtml(prefix, label, blankLabel) {
  return `
    <fieldset class="custom-field-panel custom-field-subsection">
      <legend class="custom-field-panel-heading">
        <span>${escapeHtml(label)}</span>
        <button class="ghost-button add-custom-field-button" type="button" data-prefix="${escapeHtml(prefix)}" data-blank-label="${escapeHtml(blankLabel)}">Add Field</button>
      </legend>
      <div class="custom-field-list" data-prefix="${escapeHtml(prefix)}" data-blank-label="${escapeHtml(blankLabel)}">
        ${customFieldRowHtml(prefix, blankLabel)}
      </div>
    </fieldset>
  `;
}

function observationColorOptionsHtml(selected = "", { blankLabel = "No change" } = {}) {
  const options = [`<option value=""${selected === "" ? " selected" : ""}>${escapeHtml(blankLabel)}</option>`];
  for (const [value, label] of OBSERVATION_COLOR_OPTIONS) {
    options.push(`<option value="${escapeHtml(value)}"${selected.toLowerCase() === value.toLowerCase() ? " selected" : ""}>${escapeHtml(label)} (${escapeHtml(value)})</option>`);
  }
  return options.join("");
}

function customFieldRowHtml(prefix, blankLabel) {
  return `
    <div class="custom-field-row">
      <label>
        <span>Action</span>
        <select name="${prefix}CustomFieldAction" class="custom-field-action-select">
          <option value="">${escapeHtml(blankLabel)}</option>
          <option value="add">Add field</option>
          <option value="update">Update existing</option>
          <option value="delete">Delete existing</option>
          <option value="clear">Delete all fields</option>
        </select>
      </label>
      <label class="custom-field-existing-field" hidden>
        <span>Existing Field</span>
        <select name="${prefix}CustomFieldTarget" class="custom-field-target-select">
          ${customFieldTargetOptionsHtml(prefix)}
        </select>
      </label>
      <div class="custom-field-current-meta" hidden></div>
      <label class="custom-field-name-field">
        <span>Field Name</span>
        <input name="${prefix}CustomFieldName" placeholder="Field name">
      </label>
      <label class="custom-field-type-field">
        <span>Field Type</span>
        <select name="${prefix}CustomFieldType" class="custom-field-type-select">
          <option value="">${escapeHtml(blankLabel)}</option>
          ${customFieldTypeOptionsHtml()}
        </select>
      </label>
      <label class="answer-options-field" hidden>
        <span>Answer Options</span>
        <textarea name="${prefix}CustomFieldAnswerOptions" rows="3" placeholder="One option per line"></textarea>
      </label>
      <label class="custom-field-compulsory-field">
        <span>Compulsory</span>
        <select name="${prefix}CustomFieldIsCompulsory">
          <option value="">${escapeHtml(blankLabel)}</option>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      </label>
      <button class="ghost-button remove-custom-field-button" type="button">Remove Row</button>
    </div>
  `;
}

function customFieldTargetOptionsHtml(prefix) {
  const options = [`<option value="">Select existing field</option>`];
  for (const item of observationCustomFieldTargets(prefix)) {
    options.push([
      `<option value="${escapeHtml(item.value)}"`,
      ` data-field-type="${escapeHtml(item.type || "")}"`,
      ` data-field-type-label="${escapeHtml(item.typeLabel || "")}"`,
      ` data-answer-options="${escapeHtml(item.answerOptions || "")}"`,
      ` data-compulsory="${escapeHtml(item.compulsory || "")}"`,
      ` data-coverage="${escapeHtml(item.coverage || "")}"`,
      `>${escapeHtml(item.label)}</option>`
    ].join(""));
  }
  return options.join("");
}

function customFieldTypeOptionsHtml() {
  return CUSTOM_FIELD_TYPE_OPTIONS.map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`).join("");
}

function addCustomFieldRow(button) {
  const list = button.closest(".custom-field-panel")?.querySelector(".custom-field-list");
  if (!list) return;
  list.insertAdjacentHTML("beforeend", customFieldRowHtml(list.dataset.prefix || "", list.dataset.blankLabel || "No change"));
  updateCustomFieldRows(list.lastElementChild);
}

function removeCustomFieldRow(button) {
  const row = button.closest(".custom-field-row");
  const list = row?.closest(".custom-field-list");
  if (!row || !list) return;
  if (list.querySelectorAll(".custom-field-row").length <= 1) {
    resetSettingsElement(row);
    updateCustomFieldRows(row);
    return;
  }
  row.remove();
}

function updateObservationColorPreviews(root = document) {
  root.querySelectorAll(".observation-color-select").forEach(updateObservationColorPreview);
}

function updateObservationColorPreview(select) {
  const preview = select.parentElement?.querySelector(".color-preview");
  if (!preview) return;
  const value = select.value || "";
  const option = select.selectedOptions?.[0];
  preview.textContent = value ? `${option?.textContent || value}` : "";
  preview.style.setProperty("--preview-color", value || "transparent");
  preview.classList.toggle("empty", !value);
}

function updateCustomFieldAnswerOptions(root = document) {
  updateCustomFieldRows(root);
}

function updateCustomFieldRows(root = document) {
  const rows = root.matches?.(".custom-field-row")
    ? [root]
    : root.closest?.(".custom-field-row")
      ? [root.closest(".custom-field-row")]
      : Array.from(root.querySelectorAll?.(".custom-field-row") || []);
  for (const row of rows) {
    const action = row.querySelector(".custom-field-action-select")?.value || "";
    const targetSelect = row.querySelector(".custom-field-target-select");
    const selectedTarget = targetSelect?.selectedOptions?.[0];
    const selectedCurrentType = selectedTarget?.dataset.fieldType || "";
    const requiresExisting = ["update", "delete"].includes(action);
    const showsExisting = ["add", "update", "delete"].includes(action);
    const editsField = ["add", "update"].includes(action);
    const existingField = row.querySelector(".custom-field-existing-field");

    if (existingField) {
      existingField.hidden = !showsExisting;
      existingField.classList.toggle("is-disabled", action === "add");
    }
    if (targetSelect) {
      targetSelect.disabled = action === "add";
      if (action === "add") targetSelect.value = "";
    }
    row.querySelector(".custom-field-name-field").hidden = !editsField;
    row.querySelector(".custom-field-type-field").hidden = !editsField;
    row.querySelector(".custom-field-compulsory-field").hidden = !editsField;
    updateCustomFieldCurrentMeta(row, requiresExisting);

    const type = row.querySelector(".custom-field-type-select")?.value || (action === "update" ? selectedCurrentType : "");
    const answerField = row.querySelector(".answer-options-field");
    if (!answerField) continue;
    answerField.hidden = !editsField || !customFieldTypeAllowsOptions(type);
    if (answerField.hidden) {
      const textarea = answerField.querySelector("textarea");
      if (textarea) textarea.value = "";
    }
  }
}

function updateCustomFieldCurrentMeta(row, visible) {
  const meta = row.querySelector(".custom-field-current-meta");
  if (!meta) return;
  if (!visible) {
    meta.hidden = true;
    meta.innerHTML = "";
    return;
  }

  const selected = row.querySelector(".custom-field-target-select")?.selectedOptions?.[0];
  if (!selected?.value) {
    meta.hidden = false;
    meta.textContent = "Select an existing field to see its current setup.";
    return;
  }

  const options = selected.dataset.answerOptions || "";
  const optionsHtml = options
    ? `<div><strong>Current options</strong><pre>${escapeHtml(options)}</pre></div>`
    : "";
  meta.hidden = false;
  meta.innerHTML = `
    <div><strong>Current type</strong> ${escapeHtml(selected.dataset.fieldTypeLabel || "Unknown")}</div>
    <div><strong>Current compulsory</strong> ${escapeHtml(selected.dataset.compulsory || "Varies")}</div>
    <div><strong>Applies to</strong> ${escapeHtml(selected.dataset.coverage || "")}</div>
    ${optionsHtml}
  `;
}

function customFieldTypeAllowsOptions(type) {
  return CUSTOM_FIELD_TYPES_REQUIRING_OPTIONS.has(normalizeCustomFieldType(type));
}

function observationCustomFieldTargets(prefix) {
  const details = Array.from(state.observationBulkDetails.values()).filter(Boolean);
  if (!details.length) return [];
  const selectedCount = selectedObservationIds().length || details.length;
  const fieldsByKey = new Map();
  for (const detail of details) {
    for (const field of observationCustomFields(detail, prefix)) {
      const key = customFieldKey(field);
      if (!key) continue;
      if (!fieldsByKey.has(key)) {
        fieldsByKey.set(key, {
          value: key,
          name: field.FieldName || field.fieldName || key,
          count: 0,
          types: new Set(),
          answerOptions: new Set(),
          compulsory: new Set()
        });
      }
      const target = fieldsByKey.get(key);
      target.count += 1;
      target.types.add(normalizeCustomFieldType(field.CustomFieldType ?? field.customFieldType));
      target.answerOptions.add(customFieldAnswerOptionsText(field));
      target.compulsory.add(customFieldCompulsoryText(field));
    }
  }
  return Array.from(fieldsByKey.values())
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((field) => {
      const coverage = field.count === selectedCount ? "All Selected" : "Not Applicable to All";
      const type = field.types.size === 1 ? Array.from(field.types)[0] : "";
      const typeLabel = field.types.size === 1 ? customFieldTypeLabel(type) : "Varies";
      const answerOptions = field.answerOptions.size === 1 ? Array.from(field.answerOptions)[0] : "Varies by observation type";
      const compulsory = field.compulsory.size === 1 ? Array.from(field.compulsory)[0] : "Varies";
      return {
        value: field.value,
        label: `${field.name} - ${coverage}`,
        type,
        typeLabel,
        answerOptions,
        compulsory,
        coverage
      };
    });
}

function observationCustomFields(detail, prefix) {
  const key = prefix === "closing" ? "CustomFieldsForClosing" : "CustomFieldsForOpening";
  const camelKey = prefix === "closing" ? "customFieldsForClosing" : "customFieldsForOpening";
  return Array.isArray(detail?.[key])
    ? detail[key]
    : Array.isArray(detail?.[camelKey])
      ? detail[camelKey]
      : [];
}

function customFieldKey(field) {
  return String(field.InternalName || field.internalName || field.FieldName || field.fieldName || "").trim();
}

function normalizeCustomFieldType(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const compact = text.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (CUSTOM_FIELD_TYPE_ALIASES.has(compact)) return CUSTOM_FIELD_TYPE_ALIASES.get(compact);
  const option = CUSTOM_FIELD_TYPE_OPTIONS.find(([key]) => key.toLowerCase() === compact);
  return option?.[0] || text;
}

function customFieldTypeLabel(value) {
  const normalized = normalizeCustomFieldType(value);
  const option = CUSTOM_FIELD_TYPE_OPTIONS.find(([key]) => key === normalized);
  return option?.[1] || normalized || "Unknown";
}

function customFieldAnswerOptionsText(field) {
  const direct = field.AnswerOptions ?? field.answerOptions ?? field.Options ?? field.options;
  if (Array.isArray(direct)) return direct.map((item) => String(item ?? "").trim()).filter(Boolean).join("\n");
  if (direct) return String(direct).trim();
  const localised = field.LocalisedAnswerOptions || field.localisedAnswerOptions;
  if (Array.isArray(localised)) {
    return localised
      .map((item) => item?.Text ?? item?.text ?? item?.Name ?? item?.name ?? item?.Value ?? item?.value ?? "")
      .map((item) => String(item).trim())
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function customFieldCompulsoryText(field) {
  const value = field.IsCompulsory ?? field.isCompulsory;
  if (value === undefined || value === null || value === "") return "No";
  return String(value).toLowerCase() === "true" || value === true ? "Yes" : "No";
}

function observationCheckboxHtml(name, value, label, checked) {
  return `
    <label class="check-label compact-check">
      <input type="checkbox" name="${escapeHtml(name)}" value="${escapeHtml(value)}"${checked ? " checked" : ""}>
      <span>${escapeHtml(label)}</span>
    </label>
  `;
}

function observationCategoryOptionsHtml(selected = "", { blankLabel = "No change" } = {}) {
  const seen = new Set([""]);
  const options = [
    `<option value=""${selected === "" ? " selected" : ""}>${escapeHtml(blankLabel)}</option>`,
    `<option value="__clear"${selected === "__clear" ? " selected" : ""}>Clear</option>`
  ];
  seen.add("__clear");
  for (const category of state.observationCategories) {
    if (!category.id || seen.has(category.id)) continue;
    seen.add(category.id);
    options.push(`<option value="${escapeHtml(category.id)}"${selected === category.id ? " selected" : ""}>${escapeHtml(category.name || category.id)}</option>`);
  }
  if (selected && !seen.has(selected)) {
    options.push(`<option value="${escapeHtml(selected)}" selected>${escapeHtml(`Existing ${selected}`)}</option>`);
  }
  return options.join("");
}

function renderObservationImportCategoryOptions() {
  $$(".observation-import-category-select").forEach((select) => {
    const previous = select.value;
    select.innerHTML = observationCategoryOptionsHtml(previous, { blankLabel: "Use global" });
    if (previous) select.value = previous;
  });
}

async function runObservationImport(apply) {
  if (apply) {
    if (!requirePreviewReady("observationImport", "Preview an observations spreadsheet first")) return;
    await applyObservationImport();
    return;
  }

  const file = $("#observationFile").files[0];
  if (!file) {
    toast("Choose an observations spreadsheet");
    return;
  }

  const status = $("#observationImportStatus");
  status.classList.remove("error");
  status.textContent = "Reading spreadsheet...";
  setPreviewReady("observationImport", false);

  await runWithToast(async () => {
    if (!state.observationLookupsLoaded) await loadObservationLookups({ quiet: true });
    const params = new URLSearchParams({
      continueOnError: String($("#observationContinueOnError").checked)
    });
    if ($("#observationSheetName").value.trim()) params.set("sheet", $("#observationSheetName").value.trim());
    const result = await api(`/api/observations/import/plan?${params}`, {
      method: "POST",
      rawBody: await file.arrayBuffer(),
      headers: {
        "content-type": "application/octet-stream",
        "x-file-name": file.name
      }
    });
    state.observationImportOperations = result.operations || (result.results || []).map((item) => item.operation).filter(Boolean);
    renderObservationImportPlan(result);
    setPreviewReady("observationImport", state.observationImportOperations.length > 0);
    return "Observation spreadsheet preview ready";
  }, (message) => showEntityError("#observationImportStatus", message));
}

async function applyObservationImport() {
  if (!requirePreviewReady("observationImport", "Preview an observations spreadsheet first")) return;
  if (!state.observationImportOperations.length) {
    toast("Preview an observations spreadsheet first");
    setPreviewReady("observationImport", false);
    return;
  }

  const status = $("#observationImportStatus");
  status.classList.remove("error");
  status.textContent = "Creating observation types...";

  await runWithToast(async () => {
    const result = await api("/api/observations/import/apply", {
      method: "POST",
      body: {
        operations: state.observationImportOperations,
        globalSettings: collectSettingsFromElement($("#observationImportSettingsForm")),
        observationSettings: collectObservationImportOverrides(),
        continueOnError: $("#observationContinueOnError").checked
      }
    });
    renderObservationImportResults(result);
    state.observationImportOperations = [];
    setPreviewReady("observationImport", false);
    return "Observation import complete";
  }, (message) => showEntityError("#observationImportStatus", message));
}

function renderObservationImportPlan(result) {
  const list = $("#observationImportList");
  list.innerHTML = "";
  $("#observationImportResults").innerHTML = "";
  $("#observationImportResultsWrap").hidden = true;

  for (const operation of state.observationImportOperations) {
    const card = document.createElement("details");
    card.className = "observation-import-card";
    card.dataset.clientId = operation.clientId || "";
    const errors = operation.errors || [];
    card.innerHTML = `
      <summary>
        <span class="observation-import-summary">
          <span class="observation-import-name">${escapeHtml(operation.name || "Unnamed observation type")}</span>
          <span class="observation-import-meta">row ${escapeHtml(operation.rowNumber || "")}</span>
          ${errors.length ? `<span class="status-badge status-invalid">invalid</span>` : ""}
        </span>
        <label class="quick-observation-select">
          <span>Category</span>
          <select class="observation-import-category-select" data-client-id="${escapeHtml(operation.clientId || "")}">
            ${observationCategoryOptionsHtml("", { blankLabel: "Use global" })}
          </select>
        </label>
      </summary>
      <div class="observation-import-detail">
        ${errors.length ? `<div class="inline-error">${escapeHtml(errors.join("; "))}</div>` : ""}
        <form class="observation-import-override-form">
          ${observationSettingsHtml({ scope: "override", blankCategoryLabel: "Use global", includeDefaults: false })}
        </form>
      </div>
    `;
    list.appendChild(card);
  }

  $$(".observation-import-category-select").forEach((select) => {
    select.addEventListener("click", (event) => event.stopPropagation());
  });

  const failed = (result.results || []).filter((item) => item.status === "invalid" || item.status === "failed").length;
  $("#observationImportStatus").classList.toggle("error", failed > 0);
  $("#observationImportStatus").textContent = `${state.observationImportOperations.length} observation types found, ${failed} invalid`;
}

function collectObservationImportOverrides() {
  const overrides = {};
  $$(".observation-import-card").forEach((card) => {
    const clientId = card.dataset.clientId;
    const settings = collectSettingsFromElement(card.querySelector(".observation-import-override-form"));
    const categoryId = card.querySelector(".observation-import-category-select")?.value || "";
    if (categoryId) settings.categoryId = categoryId;
    if (clientId && Object.keys(settings).length) overrides[clientId] = settings;
  });
  return overrides;
}

function renderObservationImportResults(result) {
  const tbody = $("#observationImportResults");
  tbody.innerHTML = "";
  $("#observationImportResultsWrap").hidden = false;
  for (const item of result.results || []) {
    const op = item.operation || {};
    const tr = document.createElement("tr");
    const message = item.error || item.errors?.join("; ") || item.response?.messageText || op.warnings?.join("; ") || "";
    tr.innerHTML = `
      <td>${escapeHtml(op.rowNumber || "")}</td>
      <td>${escapeHtml(op.name || "")}</td>
      <td><span class="status-badge status-${escapeHtml(item.status || "planned")}">${escapeHtml(item.status || "")}</span></td>
      <td>${escapeHtml(message)}</td>
    `;
    tbody.appendChild(tr);
  }
  const failed = (result.results || []).filter((item) => item.status === "invalid" || item.status === "failed").length;
  $("#observationImportStatus").classList.toggle("error", failed > 0);
  $("#observationImportStatus").textContent = `${result.results?.length || 0} observation types processed, ${failed} failed`;
}

async function loadObservationTypes() {
  const status = $("#observationsStatus");
  status.classList.remove("error");
  status.textContent = "Loading...";

  await runWithToast(async () => {
    const lookupResult = await refreshObservationLookupsForManage();
    const result = await api("/api/observations");
    state.observationTypes = result.observationTypes || [];
    state.observationBulkDetails.clear();
    renderObservationTypes();
    renderBulkObservationSelect();
    renderObservationBulkResults([]);
    renderObservationBulkSummary();
    status.classList.toggle("error", observationLookupHasErrors(lookupResult));
    status.textContent = observationRefreshStatusText(state.observationTypes.length, lookupResult);
    return observationRefreshToastText(lookupResult);
  }, (message) => showEntityError("#observationsStatus", message));
}

function renderObservationTypes() {
  const tbody = $("#observationsTable");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (!state.observationBulkDetails.size) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="5">No selected observation types loaded</td>`;
    tbody.appendChild(tr);
    return;
  }

  for (const [id, detail] of state.observationBulkDetails.entries()) {
    const summary = observationTypeSummaryById(id);
    const name = detail?.Name || detail?.name || summary?.name || id;
    const category = observationCategoryText(detail, summary);
    const openingCount = observationCustomFields(detail, "opening").length;
    const closingCount = observationCustomFields(detail, "closing").length;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(name)}</td>
      <td><span class="status-badge status-loaded">loaded</span></td>
      <td>${escapeHtml(category)}</td>
      <td>${escapeHtml(`${openingCount} raising, ${closingCount} closeout`)}</td>
      <td>${escapeHtml(id)}</td>
    `;
    tbody.appendChild(tr);
  }
}

function observationTypeSummaryById(id) {
  return state.observationTypes.find((item) => item.id === id);
}

function observationCategoryText(detail, summary) {
  const category = detail?.Category || detail?.category || {};
  const categoryId = detail?.CategoryId || detail?.categoryId || category.Id || category.id || summary?.categoryId || "";
  return detail?.CategoryName
    || detail?.categoryName
    || category.Name
    || category.name
    || summary?.categoryName
    || state.observationCategories.find((item) => item.id === categoryId)?.name
    || categoryId
    || "";
}

function renderBulkObservationSelect() {
  const select = $("#bulkObservationSelect");
  const previous = new Set(selectedObservationIds());
  select.innerHTML = "";
  if (!state.observationTypes.length) {
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.disabled = true;
    placeholder.textContent = "Load observation types first";
    select.appendChild(placeholder);
  }
  for (const item of state.observationTypes) {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item.name || item.id;
    option.selected = previous.has(item.id);
    select.appendChild(option);
  }
}

async function loadSelectedObservationDetails() {
  const ids = selectedObservationIds();
  state.observationBulkDetails.clear();
  setPreviewReady("observationBulk", false);
  if (!ids.length) {
    renderObservationSettingsForms();
    renderObservationTypes();
    renderObservationBulkSummary();
    renderObservationBulkResults([]);
    return;
  }

  const status = $("#observationsStatus");
  const previousStatus = status.textContent;
  status.classList.remove("error");
  status.textContent = "Loading selected observation custom fields...";

  try {
    for (const id of ids) {
      state.observationBulkDetails.set(id, await api(`/api/observations/${encodeURIComponent(id)}`));
    }
    renderObservationSettingsForms();
    renderObservationTypes();
    renderObservationBulkSummary();
    status.textContent = previousStatus && previousStatus !== "Ready"
      ? previousStatus
      : `${ids.length} observation type${ids.length === 1 ? "" : "s"} selected`;
  } catch (error) {
    state.observationBulkDetails.clear();
    renderObservationSettingsForms();
    renderObservationTypes();
    showEntityError("#observationsStatus", error.message || "Failed to load selected observation custom fields");
  }
}

function resetObservationBulkSelection() {
  state.observationBulkDetails.clear();
  setPreviewReady("observationBulk", false);
  renderObservationSettingsForms();
  renderObservationBulkResults([]);
  renderObservationBulkSummary();
  renderObservationTypes();
}

function selectedObservationIds() {
  return Array.from($("#bulkObservationSelect").selectedOptions || [])
    .map((option) => option.value)
    .filter(Boolean);
}

function renderObservationBulkSummary(result) {
  const element = $("#observationBulkSummary");
  if (!element) return;
  if (result?.summary) {
    element.textContent = `${result.summary.completedCount} observation type${result.summary.completedCount === 1 ? "" : "s"} ready; ${result.summary.failedCount} failed`;
    return;
  }
  const count = selectedObservationIds().length;
  element.textContent = count ? `${count} observation type${count === 1 ? "" : "s"} selected` : "No observation type selected";
}

async function runObservationBulkUpdate(apply) {
  if (apply && !requirePreviewReady("observationBulk", "Preview the observation type update first")) return;
  const ids = selectedObservationIds();
  if (!ids.length) return toast("Select at least one observation type");
  const settings = collectSettingsFromElement($("#observationBulkForm"));
  if (!Object.keys(settings).length) return toast("Choose at least one observation type setting");
  if (apply && !window.confirm(`Update ${ids.length} selected observation type${ids.length === 1 ? "" : "s"}?`)) return;

  const status = $("#observationsStatus");
  status.classList.remove("error");
  status.textContent = apply ? "Updating observation types..." : "Previewing observation updates...";
  if (!apply) setPreviewReady("observationBulk", false);

  await runWithToast(async () => {
    const action = apply ? "apply" : "plan";
    const result = await api(`/api/observations/bulk-update/${action}`, {
      method: "POST",
      body: {
        ids,
        settings,
        continueOnError: true
      }
    });
    renderObservationBulkSummary(result);
    renderObservationBulkResults(result.results || []);
    status.textContent = `${result.summary.completedCount} observation type${result.summary.completedCount === 1 ? "" : "s"} ${apply ? "updated" : "ready"}, ${result.summary.failedCount} failed`;
    setPreviewReady("observationBulk", !apply && result.summary.completedCount > 0);
    return apply ? "Observation updates complete" : "Preview complete";
  }, (message) => showEntityError("#observationsStatus", message));
}

function renderObservationBulkResults(results) {
  const tbody = $("#observationBulkResults");
  tbody.innerHTML = "";
  for (const result of results || []) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(result.observationType?.name || result.observationType?.id || "")}</td>
      <td><span class="status-badge status-${escapeHtml(result.status || "planned")}">${escapeHtml(result.status || "")}</span></td>
      <td>${escapeHtml((result.appliedFields || []).join(", "))}</td>
      <td>${escapeHtml(result.error || "")}</td>
    `;
    tbody.appendChild(tr);
  }
}

function payloadFromEnabledFields(form) {
  const enabled = checkedValues(form.elements.enabledFields);
  const payload = {};
  for (const field of enabled) {
    const input = form.elements[field];
    if (!input) continue;
    const value = input.value.trim();
    if (value !== "") payload[field] = value;
  }
  return payload;
}

function reportEntityBulkResult(statusSelector, result, verb) {
  const results = result.results || [];
  const failed = results.filter((item) => item.status === "failed");
  const status = $(statusSelector);
  status.textContent = `${results.length - failed.length} ${verb}, ${failed.length} failed`;
  status.classList.toggle("error", failed.length > 0);
}

function showEntityError(statusSelector, message) {
  const status = $(statusSelector);
  status.classList.add("error");
  status.textContent = message;
}

async function api(path, options = {}) {
  const headers = {
    ...(options.headers || {})
  };
  let body;
  if (options.rawBody !== undefined) {
    body = options.rawBody;
  } else if (options.body !== undefined) {
    headers["content-type"] = headers["content-type"] || "application/json";
    body = JSON.stringify(options.body);
  }

  const response = await fetch(path, {
    method: options.method || "GET",
    headers,
    body
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(data?.error || `${response.status} ${response.statusText}`);
  }
  return data;
}

async function runWithToast(task, onError) {
  try {
    toast(await task());
  } catch (error) {
    const message = error.message || "Request failed";
    if (onError) onError(message);
    toast(message);
  }
}

function toast(message) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.add("visible");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove("visible"), 2600);
}

function splitList(value) {
  return String(value || "").split(/[\n;,]+/g).map((item) => item.trim()).filter(Boolean);
}

function arrayValue(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return value === undefined || value === null || value === "" ? [] : [String(value).trim()];
}

function checkedValues(inputOrList) {
  const values = inputOrList && typeof inputOrList.length === "number" && !("checked" in inputOrList)
    ? Array.from(inputOrList)
    : [inputOrList];
  return values.filter((input) => input.checked).map((input) => input.value);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");
}
