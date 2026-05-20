import test from "node:test";
import assert from "node:assert/strict";
import {
  executeWorkerProfileImportOperations,
  normalizeDateOfBirth,
  planWorkerProfileImportOperations,
  workerProfileTemplateCsv
} from "../src/workers.js";

test("workerProfileTemplateCsv uses selected friendly headers", () => {
  const csv = workerProfileTemplateCsv(["firstName", "lastName", "dateOfBirth", "jobTitle", "mobile"]);

  assert.match(csv, /First Name,Last Name,Date of Birth,Job Title,Mobile/);
  assert.match(csv, /Jane,Safety,1985-04-12,Electrician,555-0100/);
});

test("planWorkerProfileImportOperations maps selected fields and matches job title by name", () => {
  const plan = planWorkerProfileImportOperations([{
    "First Name": "Jane",
    "Last Name": "Safety",
    DOB: "04/12/1985",
    "Job Title": "Electrician",
    Mobile: "555",
    "Ignored Column": "ignored"
  }], {
    selectedFields: ["firstName", "lastName", "dateOfBirth", "jobTitle", "mobile"],
    jobTitles: [{ id: "job-title-1", name: "Electrician" }],
    globalSettings: { preferredCommunicationLanguage: "en-US" }
  });

  assert.equal(plan.hasErrors, false);
  assert.equal(plan.operations[0].payload.firstName, "Jane");
  assert.equal(plan.operations[0].payload.dateOfBirth, "1985-04-12T00:00:00");
  assert.equal(plan.operations[0].payload.jobTitleId, "job-title-1");
  assert.equal(plan.operations[0].payload.jobTitle, undefined);
  assert.equal(plan.operations[0].payload.mobile, "555");
  assert.equal(plan.operations[0].jobTitleMatch.status, "matched");
});

test("planWorkerProfileImportOperations reports required profile fields", () => {
  const plan = planWorkerProfileImportOperations([{ "First Name": "Jane" }], {
    selectedFields: ["firstName", "lastName", "dateOfBirth"]
  });

  assert.equal(plan.hasErrors, true);
  assert.match(plan.operations[0].errors.join(" "), /Last Name/);
  assert.match(plan.operations[0].errors.join(" "), /Date of Birth/);
});

test("executeWorkerProfileImportOperations creates profile before project worker", async () => {
  const plan = planWorkerProfileImportOperations([{
    "First Name": "Jane",
    "Last Name": "Safety",
    "Date of Birth": "1985-04-12"
  }]);
  const calls = [];
  const client = {
    async createWorkerProfile(payload) {
      calls.push({ type: "profile", payload });
      return { createdEntityId: "worker-profile-1" };
    },
    async createWorker(payload) {
      calls.push({ type: "worker", payload });
      return { createdEntityId: "worker-1" };
    }
  };

  const results = await executeWorkerProfileImportOperations(client, plan.operations, {
    apply: true,
    globalSettings: {
      preferredCommunicationLanguage: "fr-CA",
      projectId: "project-1",
      defaultEmployerId: "employer-1",
      sendTest: "true"
    }
  });

  assert.equal(results[0].status, "success");
  assert.equal(calls[0].type, "profile");
  assert.equal(calls[0].payload.preferredCommunicationLanguage, "fr-CA");
  assert.equal(calls[1].type, "worker");
  assert.deepEqual(calls[1].payload, {
    projectId: "project-1",
    employerId: "employer-1",
    sendTest: true,
    workerProfileId: "worker-profile-1"
  });
});

test("executeWorkerProfileImportOperations allows per-worker employer override", async () => {
  const plan = planWorkerProfileImportOperations([{
    "First Name": "Jane",
    "Last Name": "Safety",
    "Date of Birth": "1985-04-12"
  }]);
  const workerPayloads = [];
  const client = {
    async createWorkerProfile() {
      return { createdEntityId: "worker-profile-1" };
    },
    async createWorker(payload) {
      workerPayloads.push(payload);
      return { createdEntityId: "worker-1" };
    }
  };

  await executeWorkerProfileImportOperations(client, plan.operations, {
    apply: true,
    globalSettings: {
      projectId: "project-1",
      defaultEmployerId: "employer-default",
      sendTest: "false"
    },
    workerSettings: {
      [plan.operations[0].clientId]: { employerId: "employer-override" }
    }
  });

  assert.equal(workerPayloads[0].employerId, "employer-override");
});

test("normalizeDateOfBirth accepts ISO and US date formats", () => {
  assert.equal(normalizeDateOfBirth("1985-04-12"), "1985-04-12T00:00:00");
  assert.equal(normalizeDateOfBirth("04/12/1985"), "1985-04-12T00:00:00");
});
