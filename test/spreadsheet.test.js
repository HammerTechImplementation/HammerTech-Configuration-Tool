import test from "node:test";
import assert from "node:assert/strict";
import { parseCsv } from "../src/spreadsheet.js";

test("parseCsv handles quoted commas and escaped quotes", () => {
  const rows = parseCsv('email,name,roleNames\nj@example.com,"Jane, Q","admin,regionadmin"\nq@example.com,"Quote ""Test""",safetymanager\n');
  assert.deepEqual(rows, [
    {
      email: "j@example.com",
      name: "Jane, Q",
      roleNames: "admin,regionadmin"
    },
    {
      email: "q@example.com",
      name: 'Quote "Test"',
      roleNames: "safetymanager"
    }
  ]);
});

