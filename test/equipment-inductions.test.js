import test from "node:test";
import assert from "node:assert/strict";
import {
  buildEquipmentInductionCreateOperations,
  executeEquipmentInductionCreateOperations,
  normalizeEquipmentInductionPatchPayload
} from "../src/equipment-inductions.js";

test("buildEquipmentInductionCreateOperations applies global settings and equipment overrides", () => {
  const plan = buildEquipmentInductionCreateOperations({
    equipmentProfileIds: ["equipment-1", "equipment-2"],
    projectIds: ["project-1"],
    settings: {
      inductionDate: "2026-05-15T08:00:00",
      serviceRecordAvailable: "true",
      isGoodCondition: "true",
      isInspectionFailed: "false"
    },
    equipmentOverrides: {
      "equipment-2": {
        projectIds: ["project-2", "project-3"],
        isGoodCondition: "false"
      }
    }
  });

  assert.equal(plan.hasErrors, false);
  assert.equal(plan.operations.length, 3);
  assert.deepEqual(plan.operations.map((operation) => operation.payload.projectId), [
    "project-1",
    "project-2",
    "project-3"
  ]);
  assert.equal(plan.operations[0].payload.equipmentProfileId, "equipment-1");
  assert.equal(plan.operations[0].payload.dateUpdated, "2026-05-15T08:00:00");
  assert.equal(plan.operations[0].payload.serviceRecordAvailable, true);
  assert.equal(plan.operations[1].payload.equipmentProfileId, "equipment-2");
  assert.equal(plan.operations[1].payload.isGoodCondition, false);
});

test("buildEquipmentInductionCreateOperations reports missing required fields", () => {
  const plan = buildEquipmentInductionCreateOperations({
    equipmentProfileIds: ["equipment-1"],
    projectIds: ["project-1"],
    settings: {
      inductionDate: "2026-05-15T08:00:00",
      serviceRecordAvailable: "true",
      isGoodCondition: "true"
    }
  });

  assert.equal(plan.hasErrors, true);
  assert.match(plan.operations[0].errors.join(" "), /isInspectionFailed/);
});

test("normalizeEquipmentInductionPatchPayload coerces supported fields", () => {
  assert.deepEqual(normalizeEquipmentInductionPatchPayload({
    projectId: "project-2",
    serviceRecordAvailable: "no",
    isGoodCondition: "yes",
    isInspectionFailed: "false",
    averageWorkingDaysPerWeek: "4.5",
    associatedWorkerIds: "worker-1,worker-2",
    customFieldFormId: "ignored"
  }), {
    projectId: "project-2",
    serviceRecordAvailable: false,
    isGoodCondition: true,
    isInspectionFailed: false,
    averageWorkingDaysPerWeek: 4.5,
    associatedWorkerIds: ["worker-1", "worker-2"]
  });
});

test("executeEquipmentInductionCreateOperations skips existing project assignments", async () => {
  const calls = [];
  const client = {
    async listEquipmentInductions(query) {
      assert.equal(query.projectId, "project-1");
      return [{
        id: "existing",
        project: { id: "project-1" },
        equipmentProfile: { id: "equipment-1" }
      }];
    },
    async createEquipmentInduction(payload) {
      calls.push(payload);
      return { isSuccess: true };
    }
  };
  const plan = buildEquipmentInductionCreateOperations({
    equipmentProfileIds: ["equipment-1", "equipment-2"],
    projectIds: ["project-1"],
    settings: {
      inductionDate: "2026-05-15T08:00:00",
      serviceRecordAvailable: "true",
      isGoodCondition: "true",
      isInspectionFailed: "false"
    }
  });

  const results = await executeEquipmentInductionCreateOperations(client, plan.operations, {
    continueOnError: true
  });

  assert.deepEqual(results.map((result) => result.status), ["skipped", "success"]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].equipmentProfileId, "equipment-2");
});
