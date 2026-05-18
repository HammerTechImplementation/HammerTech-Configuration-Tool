import test from "node:test";
import assert from "node:assert/strict";
import {
  applyBulkObservationTypeSettings,
  buildObservationTypeCreatePayload,
  executeSimpleObservationTypeCreateOperations,
  listObservationTypes,
  planSimpleObservationTypeCreateOperations
} from "../src/observations.js";

test("planSimpleObservationTypeCreateOperations reads observation type names", () => {
  const plan = planSimpleObservationTypeCreateOperations([
    { "Observation Type Name": "Permit to work" },
    { "Observation Type Name": "Housekeeping" }
  ]);

  assert.equal(plan.hasErrors, false);
  assert.equal(plan.operations.length, 2);
  assert.equal(plan.operations[0].name, "Permit to work");
  assert.equal(plan.operations[1].clientId, "observation-2");
});

test("buildObservationTypeCreatePayload applies global settings and custom fields", () => {
  const result = buildObservationTypeCreatePayload({ name: "Permit to work" }, {
    categoryId: "category-1",
    colour: "#3ea3fe",
    allowableClassifications: ["Negative", "Neutral", "Positive"],
    suggestedPriority: "low",
    forcePriority: "true",
    canRaiseIn: ["ObservationsModule", "Incidents"],
    whoCanCreate: ["Employers", "Workers"],
    openingCustomFieldsMode: "replace",
    openingCustomFieldName: "Raising custom",
    openingCustomFieldType: "Checkbox",
    openingCustomFieldIsCompulsory: "false",
    closingCustomFieldsMode: "replace",
    closingCustomFieldName: "Closeout note",
    closingCustomFieldType: "TextArea",
    closingCustomFieldIsCompulsory: "true"
  });

  assert.deepEqual(result.errors, []);
  assert.equal(result.payload.Name, "Permit to work");
  assert.equal(result.payload.CategoryId, "category-1");
  assert.deepEqual(result.payload.AllowableClassifications, ["Negative", "Neutral", "Positive"]);
  assert.equal(result.payload.SuggestedPriority, "low");
  assert.equal(result.payload.ForcePriority, true);
  assert.deepEqual(result.payload.CanRaiseIn, ["ObservationsModule", "Incidents"]);
  assert.equal(result.payload.CustomFieldsForOpening[0].FieldName, "Raising custom");
  assert.equal(result.payload.CustomFieldsForClosing[0].CustomFieldType, "TextArea");
});

test("executeSimpleObservationTypeCreateOperations posts create payloads", async () => {
  const operations = planSimpleObservationTypeCreateOperations([
    { "Observation Type Name": "Permit to work" }
  ]).operations;
  const calls = [];
  const client = {
    async request(method, url, options) {
      calls.push({ method, url, options });
      return { ok: true };
    }
  };

  const results = await executeSimpleObservationTypeCreateOperations(client, "tenant", operations, {
    apply: true,
    globalSettings: {
      categoryId: "category-1",
      allowableClassifications: ["Negative"],
      canRaiseIn: ["ObservationsModule"],
      whoCanCreate: ["Employers"]
    }
  });

  assert.equal(results[0].status, "success");
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].url, "https://tenant.hammertechonline.com/company/api/ObservationTypes/Create");
  assert.equal(calls[0].options.body.Name, "Permit to work");
});

test("listObservationTypes paginates and normalizes rows", async () => {
  const calls = [];
  const client = {
    async request(method, url, options) {
      calls.push({ method, url, options });
      if (options.body.FromIndex === 0) {
        return {
          observationTypes: [
            { Id: "a", Name: "A Observation", Category: { Id: "cat-a", Name: "Safety" }, SuggestedPriority: 1 },
            { Id: "b", Name: "B Observation" }
          ]
        };
      }
      return { observationTypes: [] };
    }
  };

  const result = await listObservationTypes(client, "tenant");

  assert.equal(calls[0].method, "POST");
  assert.equal(result.observationTypes.length, 2);
  assert.equal(result.observationTypes[0].id, "a");
  assert.equal(result.observationTypes[0].categoryId, "cat-a");
  assert.equal(result.observationTypes[0].suggestedPriority, "medium");
});

test("applyBulkObservationTypeSettings maps existing detail shape for edit payloads", () => {
  const result = applyBulkObservationTypeSettings({
    Id: "obs-1",
    Name: "Existing",
    Category: { Id: "cat-old", Name: "Old" },
    Colour: "#808080",
    CanBeNegative: true,
    CanBePositive: false,
    CanBeNeutral: true,
    CanRaiseIn: [0, 5],
    CanBeCreatedByEmployer: true,
    CanBeCreatedByWorker: false,
    CustomFieldsForOpening: [{ id: "readonly", FieldName: "Keep", CustomFieldType: 2 }]
  }, {
    categoryId: "cat-new",
    colour: "#ff0000",
    allowableClassifications: ["Positive"],
    openingCustomFieldsMode: "clear"
  });

  assert.equal(result.payload.Id, "obs-1");
  assert.equal(result.payload.CategoryId, "cat-new");
  assert.equal(result.payload.Colour, "#ff0000");
  assert.deepEqual(result.payload.AllowableClassifications, ["Positive"]);
  assert.deepEqual(result.payload.CanRaiseIn, ["ObservationsModule", "Incidents"]);
  assert.deepEqual(result.payload.WhoCanCreate, ["Employers"]);
  assert.deepEqual(result.payload.CustomFieldsForOpening, []);
});

test("applyBulkObservationTypeSettings supports custom field add update delete operations", () => {
  const result = applyBulkObservationTypeSettings({
    Id: "obs-1",
    Name: "Existing",
    CategoryId: "cat-old",
    AllowableClassifications: ["Negative"],
    CanRaiseIn: ["ObservationsModule"],
    WhoCanCreate: ["Employers"],
    CustomFieldsForOpening: [
      { FieldName: "Keep", InternalName: "keep", CustomFieldType: "Checkbox", IsCompulsory: false, Index: 0 },
      { FieldName: "Remove", InternalName: "remove", CustomFieldType: "TextArea", IsCompulsory: true, Index: 1 }
    ]
  }, {
    categoryId: "__clear",
    openingCustomFieldAction: ["update", "delete", "add"],
    openingCustomFieldTarget: ["keep", "remove", ""],
    openingCustomFieldName: ["Keep Renamed", "", "New Select"],
    openingCustomFieldType: ["SingleSelectList", "", "MultipleChoiceList"],
    openingCustomFieldAnswerOptions: ["A\nB", "", "One\nTwo"],
    openingCustomFieldIsCompulsory: ["true", "", "false"]
  });

  assert.equal(result.payload.CategoryId, "");
  assert.equal(result.payload.CustomFieldsForOpening.length, 2);
  assert.equal(result.payload.CustomFieldsForOpening[0].FieldName, "Keep Renamed");
  assert.equal(result.payload.CustomFieldsForOpening[0].InternalName, "keep");
  assert.equal(result.payload.CustomFieldsForOpening[0].CustomFieldType, "Dropdown");
  assert.equal(result.payload.CustomFieldsForOpening[0].IsCompulsory, true);
  assert.equal(result.payload.CustomFieldsForOpening[1].FieldName, "New Select");
  assert.equal(result.payload.CustomFieldsForOpening[1].CustomFieldType, "MultiSelectDropdown");
  assert.equal(result.payload.CustomFieldsForOpening[1].Index, 1);
});

test("applyBulkObservationTypeSettings ignores blank custom field rows", () => {
  const existingField = {
    FieldName: "Keep",
    InternalName: "keep",
    CustomFieldType: "Checkbox",
    IsCompulsory: false,
    Index: 0
  };
  const result = applyBulkObservationTypeSettings({
    Id: "obs-1",
    Name: "Existing",
    CategoryId: "cat-old",
    AllowableClassifications: ["Negative"],
    CanRaiseIn: ["ObservationsModule"],
    WhoCanCreate: ["Employers"],
    CustomFieldsForOpening: [existingField]
  }, {
    openingCustomFieldAction: [""],
    openingCustomFieldTarget: [""],
    openingCustomFieldName: [""],
    openingCustomFieldType: ["SingleSelectList"],
    openingCustomFieldAnswerOptions: [""],
    openingCustomFieldIsCompulsory: [""]
  });

  assert.ok(!result.appliedFields.includes("CustomFieldsForOpening"));
  assert.equal(result.payload.CustomFieldsForOpening.length, 1);
  assert.equal(result.payload.CustomFieldsForOpening[0].FieldName, existingField.FieldName);
  assert.equal(result.payload.CustomFieldsForOpening[0].InternalName, existingField.InternalName);
  assert.equal(result.payload.CustomFieldsForOpening[0].CustomFieldType, existingField.CustomFieldType);
});
