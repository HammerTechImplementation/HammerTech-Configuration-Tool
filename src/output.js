export function writeJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export function toCsv(rows) {
  if (!rows.length) return "";
  const headers = Array.from(rows.reduce((set, row) => {
    for (const key of Object.keys(row)) set.add(key);
    return set;
  }, new Set()));

  const lines = [headers.map(csvEscape).join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => csvEscape(flattenValue(row[header]))).join(","));
  }
  return lines.join("\n");
}

export function printOperationResults(results, { json = false } = {}) {
  if (json) {
    writeJson(results);
    return;
  }

  for (const result of results) {
    const op = result.operation;
    const target = op.id || op.email || op.payload.email || "";
    const prefix = `row ${op.rowNumber} ${op.action}${target ? ` ${target}` : ""}`;
    if (result.status === "planned") {
      process.stdout.write(`${prefix}: planned\n`);
    } else if (result.status === "success") {
      const created = result.response?.createdEntityId ? ` (${result.response.createdEntityId})` : "";
      process.stdout.write(`${prefix}: success${created}\n`);
    } else if (result.status === "invalid") {
      process.stdout.write(`${prefix}: invalid - ${result.errors.join("; ")}\n`);
    } else {
      process.stdout.write(`${prefix}: failed - ${result.error}\n`);
    }

    for (const warning of op.warnings || []) {
      process.stdout.write(`  warning: ${warning}\n`);
    }
  }
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replaceAll("\"", "\"\"")}"`;
}

function flattenValue(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return value;
}

