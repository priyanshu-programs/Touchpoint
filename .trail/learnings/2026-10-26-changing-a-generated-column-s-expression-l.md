---
title: "Changing a generated column's expression: drizzle-kit drops and re-adds the column but not its indexes"
author: L
date: 2026-10-26
branch: main
cost: { minutes: 33, tokens: 298792 }
id: l-f476e902
scope: repo
status: active
src: agent
touches:
  - src/modules/search/queries.test.ts
  - src/modules/fields/sort.ts
  - src/app/(app)/people/(lists)/list-toolbar.tsx
  - src/app/(app)/people/(lists)/sort-head.tsx
  - src/app/(app)/people/(lists)/list-controls.tsx
  - src/app/(app)/people/(lists)/organizations/page.tsx
  - src/app/(app)/people/(lists)/contacts/page.tsx
  - src/modules/contacts/service.test.ts
  - src/modules/organizations/service.test.ts
  - e2e/12-columns-and-selection.spec.ts
---

## Decided
- Migration 0031 (src/db/migrations/0031_search_custom_values.sql) re-makes the generated `search` columns on organizations and contacts with `|| jsonb_to_tsvector('simple', custom, '["string"]')` so custom text, dropdown and date values are searched. The expression is immutable, so Postgres accepts it in a STORED generated column (checked on the test database's stock Postgres).
- Numbers are left out of search on purpose (`["string"]` only).

## Watch out
- drizzle-kit 0.31 turns a changed `generatedAlwaysAs` expression into `DROP COLUMN` + `ADD COLUMN`. Dropping the column silently drops every index on it (here `organizations_search_idx` and `contacts_search_idx`, GIN), and drizzle-kit does NOT emit `CREATE INDEX` again because its snapshot thinks the index never changed. The two `CREATE INDEX ... USING gin ("search")` lines were added by hand at the end of the generated file. Do the same for any future change to a generated `search` expression (activities, tasks too).
- The timeline view does not read `search`, so dropping it is safe; check views before dropping any other column.
