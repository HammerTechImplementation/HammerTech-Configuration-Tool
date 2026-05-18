import test from "node:test";
import assert from "node:assert/strict";
import { CookieJar } from "../src/http.js";
import {
  applyBulkYesNoQuestionSettings,
  buildChecklistPayload,
  executeInspectionChecklistOperations,
  executeSimpleInspectionChecklistCreateOperations,
  listInspectionChecklists,
  planInspectionChecklistOperations,
  planSimpleInspectionChecklistCreateOperations,
  tenantHost
} from "../src/checklists.js";

test("tenantHost accepts tenant names and full HammerTech hosts", () => {
  assert.equal(tenantHost("acme"), "acme.hammertechonline.com");
  assert.equal(tenantHost("https://acme.hammertechonline.com/company"), "acme.hammertechonline.com");
});

test("CookieJar can store a pasted browser Cookie header for the tenant host", () => {
  const jar = new CookieJar();
  jar.addCookieHeader("Cookie: HAMMERTECHAUTH1ACME.HAMMERTECHONLINE.COM=abc; other=value", "https://acme.hammertechonline.com/");

  assert.equal(
    jar.headerFor("https://acme.hammertechonline.com/company/api/ChecklistTypesApi"),
    "HAMMERTECHAUTH1ACME.HAMMERTECHONLINE.COM=abc; other=value"
  );
  assert.equal(jar.headerFor("https://other.hammertechonline.com/company/api/ChecklistTypesApi"), "");
});

test("planInspectionChecklistOperations groups spreadsheet rows into checklist payloads", () => {
  const plan = planInspectionChecklistOperations([
    {
      action: "create",
      checklistName: "Daily Site Inspection",
      displayName: "Daily Site Inspection",
      questionText: "Is the work area clean?",
      checklistQuestionType: "2",
      isCompulsory: "true",
      zIndex: "0"
    },
    {
      action: "create",
      checklistName: "Daily Site Inspection",
      questionText: "Describe corrective actions.",
      checklistQuestionType: "6",
      isCompulsory: "false",
      zIndex: "1"
    }
  ]);

  assert.equal(plan.hasErrors, false);
  assert.equal(plan.operations.length, 1);
  assert.equal(plan.operations[0].payload.name, "Daily Site Inspection");
  assert.equal(plan.operations[0].payload.checklistQuestions.length, 2);
  assert.equal(plan.operations[0].payload.checklistQuestions[0].questionText, "Is the work area clean?");
  assert.equal(plan.operations[0].payload.checklistQuestions[0].checklistQuestionType, "2");
  assert.equal(plan.operations[0].payload.checklistQuestions[0].isCompulsory, true);
});

test("planSimpleInspectionChecklistCreateOperations creates a checklist when the name changes", () => {
  const plan = planSimpleInspectionChecklistCreateOperations([
    {
      "Checklist Name": "Daily Site Inspection",
      "Checklist Display Name": "Daily Site Inspection",
      "Checklist Questions": "Is the work area clean?"
    },
    {
      "Checklist Name": "Daily Site Inspection",
      "Checklist Display Name": "Daily Site Inspection",
      "Checklist Questions": "Are access paths clear?"
    },
    {
      "Checklist Name": "Weekly Safety Walk",
      "Checklist Display Name": "Weekly Safety Walk",
      "Checklist Questions": "Are required postings visible?"
    }
  ]);

  assert.equal(plan.hasErrors, false);
  assert.equal(plan.operations.length, 2);
  assert.equal(plan.operations[0].name, "Daily Site Inspection");
  assert.equal(plan.operations[0].questions.length, 2);
  assert.equal(plan.operations[1].name, "Weekly Safety Walk");
  assert.equal(plan.operations[1].questions.length, 1);
});

test("executeSimpleInspectionChecklistCreateOperations applies global and checklist override settings", async () => {
  const plan = planSimpleInspectionChecklistCreateOperations([
    {
      "Checklist Name": "Daily Site Inspection",
      "Checklist Display Name": "Daily",
      "Checklist Questions": "Is the work area clean?"
    }
  ]);
  const calls = [];
  const client = {
    async request(method, url, options) {
      calls.push({ method, url, options });
      return { ok: true };
    }
  };

  const results = await executeSimpleInspectionChecklistCreateOperations(client, "tenant", plan.operations, {
    apply: true,
    globalSettings: {
      questionType: "3",
      raiseObservationOnNoOption: "2",
      defaultIssueTypeId: "global-type"
    },
    checklistSettings: {
      [plan.operations[0].clientId]: {
        defaultIssueTypeId: "checklist-type",
        isCompulsory: "true"
      }
    }
  });

  assert.equal(results[0].status, "success");
  const payload = calls[0].options.body;
  assert.equal(payload.name, "Daily Site Inspection");
  assert.equal(payload.displayName, "Daily");
  assert.equal(payload.checklistQuestions[0].questionText, "Is the work area clean?");
  assert.equal(payload.checklistQuestions[0].checklistQuestionType, "3");
  assert.equal(payload.checklistQuestions[0].raiseObservationOnNoOption, 2);
  assert.equal(payload.checklistQuestions[0].raiseIssueOnNo, true);
  assert.equal(payload.checklistQuestions[0].defaultIssueTypeId, "checklist-type");
  assert.equal(payload.checklistQuestions[0].isCompulsory, true);
});

test("listInspectionChecklists returns only inspection checklists and uses checklist names", async () => {
  const client = {
    async request() {
      return {
        checkListTypes: [
          {
            id: "custom",
            type: "CustomModuleChecklist",
            typeDisplayName: "Custom Module Checklist",
            name: "Custom Form"
          },
          {
            id: "inspection",
            type: "InspectionChecklist",
            typeDisplayName: "Inspection Checklist",
            name: "Weekly Safety Walk"
          },
          {
            id: "orientation",
            type: "InductionSectionChecklist",
            typeDisplayName: "Orientation Checklist",
            name: "Site Orientation"
          }
        ]
      };
    }
  };

  const checklists = await listInspectionChecklists(client, "tenant");

  assert.equal(checklists.length, 1);
  assert.equal(checklists[0].id, "inspection");
  assert.equal(checklists[0].name, "Weekly Safety Walk");
  assert.equal(checklists[0].displayName, "Weekly Safety Walk");
  assert.equal(checklists[0].typeDisplayName, "Inspection Checklist");
});

test("buildChecklistPayload preserves existing questions for update payloads", () => {
  const payload = buildChecklistPayload({
    id: "readonly",
    name: "Existing",
    displayName: "Existing",
    isHiddenFromMainList: "true"
  }, [
    { id: "question-readonly", question: "Keep me", zIndex: 0 }
  ]);

  assert.equal(payload.name, "Existing");
  assert.equal(payload.isHiddenFromMainList, true);
  assert.equal(payload.checklistQuestions[0].id, undefined);
  assert.equal(payload.checklistQuestions[0].questionText, "Keep me");
  assert.equal(payload.checklistQuestions[0].zIndex, 0);
});

test("executeInspectionChecklistOperations preserves existing name on id-only updates", async () => {
  const plan = planInspectionChecklistOperations([
    { action: "update", checklistId: "abc" }
  ]);
  const calls = [];
  const client = {
    async request(method, url, options) {
      calls.push({ method, url, options });
      if (method === "GET") {
        return {
          id: "abc",
          name: "Existing Checklist",
          displayName: "Existing Checklist",
          questions: [{ id: "q1", questionText: "Existing question", checklistQuestionType: "6", zIndex: 0 }]
        };
      }
      return { ok: true, payload: options.body };
    }
  };

  const results = await executeInspectionChecklistOperations(client, "tenant", plan.operations, { apply: true });
  assert.equal(results[0].status, "success");
  const putCall = calls.find((call) => call.method === "PUT");
  assert.equal(putCall.url, "https://tenant.hammertechonline.com/company/api/ChecklistTypesApi");
  assert.equal(putCall.options.body.id, "abc");
  assert.equal(putCall.options.body.name, "Existing Checklist");
  assert.equal(putCall.options.body.checklistQuestions[0].id, "q1");
  assert.equal(putCall.options.body.checklistQuestions[0].questionText, "Existing question");
});

test("applyBulkYesNoQuestionSettings updates only Yes/No and Yes/No/NA questions", () => {
  const result = applyBulkYesNoQuestionSettings({
    id: "checklist-1",
    name: "Weekly Inspection",
    displayName: "Weekly Inspection",
    checklistQuestions: [
      { id: "yn", questionText: "Safe?", checklistQuestionType: "2", yesText: "Yes", noText: "No" },
      { id: "ynna", questionText: "Clean?", checklistQuestionType: "3", yesText: "Yes", noText: "No", naText: "N/A" },
      {
        id: "dropdown",
        questionText: "Dropdown?",
        checklistQuestionType: "13",
        dropdownOptions: "Yes\nNo\nMaybe\nN/A",
        enableDropdownAuditScore: true,
        dropdownAuditScores: "3\n2\n1\n0"
      },
      { id: "text", questionText: "Notes", checklistQuestionType: "6", yesText: "Leave me" }
    ]
  }, {
    questionType: "3",
    yesText: "Adequate",
    noText: "Needs attention",
    naText: "Not applicable",
    raiseObservationOnYesOption: "compulsory",
    raiseObservationOnNoOption: "2",
    raiseObservationOnNaOption: "1",
    issueDefaultObservationTypeOnYes: "0",
    issueDefaultObservationTypeOnNo: "-1",
    isIssueDefaultObservationTypeOnNoLocked: "true",
    defaultIssueTypeId: "issue-type-1",
    isDefaultIssueTypeForced: "true",
    defaultIssuePriority: "1",
    auditScoreOnYes: "5",
    signatureOnYes: "true",
    isCompulsory: "true",
    excludeFromChecklistCompleteCheck: "true"
  });

  assert.equal(result.summary.targetQuestions, 2);
  assert.equal(result.summary.skippedQuestions, 2);
  assert.equal(result.payload.checklistQuestions[0].checklistQuestionType, "3");
  assert.equal(result.payload.checklistQuestions[0].yesText, "Adequate");
  assert.equal(result.payload.checklistQuestions[0].noText, "Needs attention");
  assert.equal(result.payload.checklistQuestions[0].naText, "Not applicable");
  assert.equal(result.payload.checklistQuestions[0].raiseObservationOnYesOption, 1);
  assert.equal(result.payload.checklistQuestions[0].raiseIssueOnYes, true);
  assert.equal(result.payload.checklistQuestions[0].additionalDetailsRequiredForYes, true);
  assert.equal(result.payload.checklistQuestions[0].issueCompulsoryOnYes, true);
  assert.equal(result.payload.checklistQuestions[0].raiseObservationOnNoOption, 2);
  assert.equal(result.payload.checklistQuestions[0].raiseIssueOnNo, true);
  assert.equal(result.payload.checklistQuestions[0].issueCompulsoryOnNo, false);
  assert.equal(result.payload.checklistQuestions[0].raiseObservationOnNaOption, 1);
  assert.equal(result.payload.checklistQuestions[0].raiseIssueOnNa, true);
  assert.equal(result.payload.checklistQuestions[0].issueDefaultObservationTypeOnYes, "0");
  assert.equal(result.payload.checklistQuestions[0].issueDefaultObservationTypeOnNo, "-1");
  assert.equal(result.payload.checklistQuestions[0].isIssueDefaultObservationTypeOnNoLocked, true);
  assert.equal(result.payload.checklistQuestions[0].defaultIssueTypeId, "issue-type-1");
  assert.equal(result.payload.checklistQuestions[0].isDefaultIssueTypeForced, true);
  assert.equal(result.payload.checklistQuestions[0].defaultIssuePriority, "1");
  assert.equal(result.payload.checklistQuestions[0].auditScoreOnYes, "5");
  assert.equal(result.payload.checklistQuestions[0].signatureOnYes, true);
  assert.equal(result.payload.checklistQuestions[0].isCompulsory, true);
  assert.equal(result.payload.checklistQuestions[0].excludeFromChecklistCompleteCheck, true);
  assert.equal(result.payload.checklistQuestions[2].checklistQuestionType, "13");
  assert.equal(result.payload.checklistQuestions[2].dropdownOptions, "Yes\nNo\nMaybe\nN/A");
  assert.equal(result.payload.checklistQuestions[2].dropdownAuditScores, "3\n2\n1\n0");
  assert.equal(result.payload.checklistQuestions[3].checklistQuestionType, "6");
  assert.equal(result.payload.checklistQuestions[3].yesText, "Leave me");
});
