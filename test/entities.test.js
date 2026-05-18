import test from "node:test";
import assert from "node:assert/strict";
import { planEntityCreateOperations, rowToEntityCreateOperation, normalizePatchPayload } from "../src/entities.js";

test("rowToEntityCreateOperation maps project create rows", () => {
  const op = rowToEntityCreateOperation("projects", {
    name: "Downtown Tower",
    country: "United States",
    timeZoneString: "Central Standard Time",
    value: "12345.67",
    isArchived: "false"
  }, { rowNumber: 2 });

  assert.equal(op.action, "create");
  assert.deepEqual(op.errors, []);
  assert.equal(op.payload.name, "Downtown Tower");
  assert.equal(op.payload.value, 12345.67);
  assert.equal(op.payload.isArchived, false);
});

test("planEntityCreateOperations reports missing project required fields", () => {
  const plan = planEntityCreateOperations("projects", [{ name: "Missing Data" }]);
  assert.equal(plan.hasErrors, true);
  assert.match(plan.operations[0].errors.join(" "), /country/);
  assert.match(plan.operations[0].errors.join(" "), /timeZoneString/);
});

test("rowToEntityCreateOperation maps employer profile create rows", () => {
  const op = rowToEntityCreateOperation("employer-profiles", {
    businessName: "Acme Contractors",
    "Regional ID": "12-3456789",
    internalId: "EMPLOYER-1001"
  });

  assert.deepEqual(op.errors, []);
  assert.deepEqual(op.payload, {
    businessName: "Acme Contractors",
    abn: "12-3456789",
    internalIdentifier: "EMPLOYER-1001"
  });
});

test("normalizePatchPayload keeps only allowed fields", () => {
  assert.deepEqual(normalizePatchPayload("employer-profiles", {
    businessName: "Updated",
    regionalEntityIdentifier: "99",
    unknown: "ignored"
  }), {
    businessName: "Updated",
    abn: "99"
  });
});

test("rowToEntityCreateOperation maps equipment profile create rows", () => {
  const op = rowToEntityCreateOperation("equipment-profiles", {
    make: "JLG",
    model: "450AJ",
    registration: "REG-1001",
    serial: "SN-1001",
    equipmentTypeId: "type-1",
    serviceByMethod: "hours",
    currentHours: "42.5",
    isEquipmentShared: "yes",
    canImport: "no",
    customFieldValues: "[{\"internalName\":\"fleet\",\"value\":\"A1\"}]"
  }, { rowNumber: 2 });

  assert.deepEqual(op.errors, []);
  assert.equal(op.name, "JLG 450AJ REG-1001");
  assert.equal(op.payload.registrationNumber, "REG-1001");
  assert.equal(op.payload.serialNumber, "SN-1001");
  assert.equal(op.payload.equipmentTypeId, "type-1");
  assert.equal(op.payload.serviceByMethod, "Hours");
  assert.equal(op.payload.currentHours, 42.5);
  assert.equal(op.payload.isEquipmentShared, true);
  assert.equal(op.payload.canImport, false);
  assert.deepEqual(op.payload.customFieldValues, [{
    internalName: "fleet",
    value: "A1"
  }]);
});

test("planEntityCreateOperations reports missing equipment type", () => {
  const plan = planEntityCreateOperations("equipment-profiles", [{
    make: "JLG",
    model: "450AJ"
  }]);

  assert.equal(plan.hasErrors, true);
  assert.match(plan.operations[0].errors.join(" "), /equipmentTypeId/);
});

test("normalizePatchPayload maps equipment profile update fields", () => {
  assert.deepEqual(normalizePatchPayload("equipment-profiles", {
    currentHours: "12",
    canImport: "false",
    serviceBy: "date",
    customFieldFormId: "ignored",
    unknown: "ignored"
  }), {
    currentHours: 12,
    canImport: false,
    serviceByMethod: "Date"
  });
});
