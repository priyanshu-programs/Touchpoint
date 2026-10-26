---
title: Removing a dropdown option clears it from the records that held it; the owner chose that over refusing or keeping old values
author: L
date: 2026-10-26
branch: main
cost: { minutes: 28, tokens: 256996 }
id: l-a28ac1be
scope: repo
status: active
src: agent
touches:
  - src/modules/organizations/service.ts
  - src/modules/contacts/service.ts
  - src/app/(app)/people/organizations/actions.ts
  - src/app/(app)/people/contacts/actions.ts
  - src/app/(app)/people/organizations/new/page.tsx
  - src/app/(app)/people/contacts/new/page.tsx
  - src/modules/fields/service.ts
  - src/modules/fields/queries.ts
  - src/app/(app)/people/fields/actions.ts
  - src/app/(app)/people/(lists)/fields-panel.tsx
---

## Decided
- Removing a custom dropdown's option (removeCustomFieldOption in src/modules/fields/service.ts) clears that value from every record of that kind that held it, archived ones included, after a confirmation in the option's row that gives the count (optionUse in src/modules/fields/queries.ts). The owner chose this on 2026-10-26.
- The last option of a dropdown cannot be removed, because customFieldInput requires at least one.
- Owner's other choices for Step 9 slice 4: only custom fields are edited in place on Details (standard fields stay on Edit), custom list columns are shown and sortable but have no filter, and custom values are searched in Ctrl+K and in the lists' own search boxes.

## Tried and ruled out
- Refusing to remove an option while records hold it: the owner preferred clearing it.
- Keeping old values shown as "(removed)": this would leave values on records that no dropdown offers any more.
- Editing standard fields in place: each has its own rules (domain uniqueness, website reads, phone format), so it is too much for this slice.

## Watch out
- The People list has no sort and pages by a name cursor (`after`). Sorting it by a custom column (slice 4 part 3) means moving it to numbered pages like Companies.
