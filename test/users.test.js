import test from "node:test";
import assert from "node:assert/strict";
import {
  executeSimpleUserCreateOperations,
  planSimpleUserCreateOperations,
  planUserOperations,
  rowToUserOperation
} from "../src/users.js";

test("rowToUserOperation maps create rows into HammerTech payload", () => {
  const op = rowToUserOperation({
    action: "create",
    email: "jane@example.com",
    "Full Name": "Jane Safety",
    title: "Safety Manager",
    roles: "admin;safetymanager",
    isRegionAdmin: "true",
    userProjectIds: "11111111-1111-1111-1111-111111111111,22222222-2222-2222-2222-222222222222"
  }, { rowNumber: 2 });

  assert.equal(op.action, "create");
  assert.deepEqual(op.errors, []);
  assert.deepEqual(op.payload, {
    email: "jane@example.com",
    name: "Jane Safety",
    title: "Safety Manager",
    roleNames: ["admin", "safetymanager"],
    isRegionAdmin: true,
    userProjectIds: [
      "11111111-1111-1111-1111-111111111111",
      "22222222-2222-2222-2222-222222222222"
    ]
  });
});

test("planUserOperations reports missing create required fields", () => {
  const plan = planUserOperations([{ action: "create", email: "missing@example.com" }]);
  assert.equal(plan.hasErrors, true);
  assert.match(plan.operations[0].errors.join(" "), /name/);
  assert.match(plan.operations[0].errors.join(" "), /title/);
  assert.match(plan.operations[0].errors.join(" "), /roleNames/);
});

test("planSimpleUserCreateOperations maps five-column user upload rows", () => {
  const plan = planSimpleUserCreateOperations([{
    email: "jane@example.com",
    name: "Jane Safety",
    title: "Safety Manager",
    mobile: "555",
    internalid: "EMP-1001"
  }]);

  assert.equal(plan.hasErrors, false);
  assert.equal(plan.operations.length, 1);
  assert.equal(plan.operations[0].payload.email, "jane@example.com");
  assert.equal(plan.operations[0].payload.internalIdentifier, "EMP-1001");
});

test("executeSimpleUserCreateOperations applies global and user override access settings", async () => {
  const plan = planSimpleUserCreateOperations([{
    email: "jane@example.com",
    name: "Jane Safety",
    title: "Safety Manager",
    mobile: "555",
    internalid: "EMP-1001"
  }]);
  const calls = [];
  const client = {
    async createUser(payload) {
      calls.push(payload);
      return { ok: true };
    }
  };

  const results = await executeSimpleUserCreateOperations(client, plan.operations, {
    apply: true,
    globalSettings: {
      roleNames: ["safetymanager"],
      selectedProjectIds: ["project-1", "project-2"],
      selectedProjectRegionIds: ["region-1"],
      currentProjectAdmin: "true",
      currentSiteNotifications: "true",
      selectedRegionIds: ["region-1"],
      futureAddProjects: "true",
      futureSiteNotifications: "true",
      isRegionAdmin: "false"
    },
    userSettings: {
      [plan.operations[0].clientId]: {
        roleNames: ["admin"],
        currentRegionAdmin: "true"
      }
    }
  });

  assert.equal(results[0].status, "success");
  assert.equal(calls[0].email, "jane@example.com");
  assert.deepEqual(calls[0].roleNames, ["admin", "regionadmin"]);
  assert.deepEqual(calls[0].userProjectIds, ["project-1", "project-2"]);
  assert.deepEqual(calls[0].isProjectAdminProjectIds, ["project-1", "project-2"]);
  assert.deepEqual(calls[0].receiveSiteNotificationProjectIds, ["project-1", "project-2"]);
  assert.equal(calls[0].isRegionAdmin, true);
  assert.deepEqual(calls[0].regionAdminRegionIds, ["region-1"]);
  assert.equal(calls[0].isAddToFutureProjects, true);
  assert.deepEqual(calls[0].addUserToFutureProjectsInRegionIds, ["region-1"]);
  assert.equal(calls[0].isReceiveSiteNotificationsForFutureProjects, true);
  assert.deepEqual(calls[0].receiveSiteNotificationFutureProjectsInRegionIds, ["region-1"]);
});

test("rowToUserOperation accepts update rows resolved by email", () => {
  const op = rowToUserOperation({
    action: "update",
    email: "existing@example.com",
    title: "Director",
    mobile: "555"
  });

  assert.deepEqual(op.errors, []);
  assert.deepEqual(op.payload, {
    title: "Director",
    mobile: "555"
  });
});

test("rowToUserOperation can force create for UI spreadsheet imports", () => {
  const op = rowToUserOperation({
    action: "delete",
    id: "11111111-1111-1111-1111-111111111111",
    email: "new@example.com",
    name: "New User",
    title: "Manager",
    roleNames: "safetymanager"
  }, { forceAction: "create" });

  assert.equal(op.action, "create");
  assert.deepEqual(op.errors, []);
  assert.equal(op.payload.email, "new@example.com");
});
