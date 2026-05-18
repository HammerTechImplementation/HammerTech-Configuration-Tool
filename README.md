# HammerTech Configuration Tool

Internal CLI for configuring HammerTech tenants through the public API and, where needed, authenticated UI endpoints discovered from the HammerTech app.

The first implemented workflow is user configuration from a spreadsheet. It authenticates directly against HammerTech's regional auth API, stores no passwords, and defaults spreadsheet imports to a dry run.

## Install

```powershell
npm install
```

Optional, for local command linking:

```powershell
npm link
```

Without linking, run commands with:

```powershell
node ./src/cli.js --help
```

## Local UI

Start the local web UI:

```powershell
npm run dev
```

Then open:

```text
http://127.0.0.1:8787
```

The UI has employee-facing work areas for users, projects, and employer profiles:

- `Spreadsheet Import`: choose Users, Projects, or Employer Profiles; download the template; upload new records; run a dry run; then create them.
- `Manage Users`: retrieve users into a selectable table, filter the table, bulk update selected users, or bulk delete selected users.
- `Manage Projects`: retrieve projects into a selectable table, filter the table, and bulk update selected projects.
- `Manage Employers`: retrieve employer profiles into a selectable table, filter the table, and bulk update selected employer profiles.
- `Inspection Checklists`: create a HammerTech UI session, retrieve existing inspection checklists, download the checklist template, and create or update checklists from a spreadsheet.

Use **Sign In** for public API workflows. Use **Create UI Session** when you need hidden UI endpoints such as Inspection Checklists; it uses the same region, tenant, email, and password fields, captures HammerTech's tenant UI cookies in Node, and stores them locally with the bearer token.

Use `PORT` to choose another port:

```powershell
$env:PORT="8790"
npm run dev
```

## Authentication

Public API bearer tokens are retrieved directly from HammerTech:

| Region | Auth endpoint |
| --- | --- |
| `us` | `https://us-auth.hammertechonline.com/api/login/generatetoken` |
| `au` | `https://au-auth.hammertechonline.com/api/login/generatetoken` |
| `eu` | `https://eu-auth.hammertechonline.com/api/login/generatetoken` |

You can pass credentials with environment variables:

```powershell
$env:HAMMERTECH_REGION="us"
$env:HAMMERTECH_TENANT="tenant-name"
$env:HAMMERTECH_EMAIL="employee@example.com"
$env:HAMMERTECH_PASSWORD="..."
```

Then save a local token session:

```powershell
node ./src/cli.js auth token --save-session
```

The session file is written to `.hammertech/session.json` by default and is ignored by git. Passwords are never stored.

## Spreadsheet Imports

Start from one of the templates, or use **Download Template** in the local UI:

- [docs/users-template.csv](docs/users-template.csv)
- [docs/projects-template.csv](docs/projects-template.csv)
- [docs/employer-profiles-template.csv](docs/employer-profiles-template.csv)
- [docs/inspection-checklists-template.csv](docs/inspection-checklists-template.csv)

The local UI spreadsheet import is create-only. Use the matching **Manage** tab for updates. User delete is available in **Manage Users**; public Project and EmployerProfile delete endpoints were not exposed in the API docs I verified.

Required user columns:

| Column | Notes |
| --- | --- |
| `email` | Required. |
| `name` | Required. |
| `title` | Required. |
| `roleNames` | Comma, semicolon, newline, or JSON array. Valid public API examples are `admin`, `regionadmin`, `safetymanager`. |

Optional API columns include `mobile`, `internalIdentifier`, `userProjectIds`, `regionAdminRegionIds`, `functionIds`, permission set IDs, future project flags, notification fields, confidential data fields, site diary fields, and project admin fields. Use HammerTech UUIDs for ID arrays.

Required project columns are `name`, `country`, and `timeZoneString`.

Required employer profile column is `businessName`.

Supported import file types are `.csv`, `.xlsx`, and `.xlsm`.

Inspection checklist imports use the hidden tenant endpoint from HammerTech's UI:

```text
https://<tenant>.hammertechonline.com/company/api/ChecklistTypesApi
```

Creates post JSON to that endpoint. Updates use `PUT` to the same endpoint with the checklist `id` in the JSON body, matching the browser request shape. Because this endpoint is cookie-authenticated, use **Create UI Session** before loading or applying checklist changes. The UI cookies are captured by the local Node process and stored only in `.hammertech/session.json`. The advanced cookie paste field remains available for troubleshooting.

Checklist spreadsheet rows are grouped by `checklistName` or `checklistId`; use `action=create` for new checklists and `action=update` with `checklistId` or `checklistName` for updates. Question rows use HammerTech UI payload fields such as `questionText`, `checklistQuestionType`, `zIndex`, and `isCompulsory`. Use `questionId` on update rows when you are updating an existing question.

Dry run:

```powershell
node ./src/cli.js users import --file .\docs\users-template.csv
```

Apply changes:

```powershell
node ./src/cli.js users import --file .\users.xlsx --sheet Users --apply
```

By default, execution stops at the first failed row. Add `--continue-on-error` when batch imports should keep going.

## Direct User Commands

```powershell
node ./src/cli.js users list --include-not-assigned --output users.json
node ./src/cli.js users get --id <user-uuid>
node ./src/cli.js users create --json '{"email":"a@example.com","name":"A User","title":"Manager","roleNames":["safetymanager"]}'
node ./src/cli.js users update --id <user-uuid> --json '{"title":"Director"}'
node ./src/cli.js users delete --id <user-uuid>
```

## Hidden UI APIs

The tool intentionally does not use Playwright. For employee-facing UI workflows, use the local UI's **Create UI Session** button so Node captures the HammerTech tenant cookies during login.

Generic cookie capture is still available for troubleshooting:

```powershell
node ./src/cli.js auth cookie-login `
  --url "https://tenant.hammertechonline.com/path/to/login/api" `
  --body-template '{"email":"{{email}}","password":"{{password}}","tenant":"{{tenant}}"}' `
  --save-session
```

Then call a discovered hidden endpoint:

```powershell
node ./src/cli.js request POST "https://tenant.hammertechonline.com/hidden/api/path" --body-json '{"example":true}'
```

Once a hidden endpoint is verified, wrap it in a typed command instead of keeping it as a raw request.
