---
title: "Data export streams one zip of data.json and spreadsheets, records only; a web stream stalls if a pull enqueues nothing"
author: L
date: 2026-10-29
branch: feat/data-export
cost: { minutes: 1, tokens: 12008 }
id: l-848695a6
scope: repo
status: active
src: agent
---

## Decided
- Owner's choices, 2026-10-29 (Phase 4 step 5): one zip download from Settings → Export, records only (the bytes of files, pictures, logos and photos stay out; files.csv lists them), and spreadsheets readable in Excel with names in place of ids. data.json carries every table as stored.
- POST /api/export (src/app/api/export/route.ts) streams the zip with fflate's Zip/ZipDeflate (src/modules/export/stream.ts), reading everything in one read-only repeatable-read transaction on a pooled client, a page of 1,000 rows at a time. Vercel's 4.5 MB body cap is for buffered responses; this is a stream (check a big export on the preview).
- What is left out is a rule by column type in src/modules/export/tables.ts (bytea, tsvector, plus enrichment_runs.raw_result and the sign-in and jobs tables). tables.test.ts fails when a new table is neither exported nor in LEFT_OUT_TABLES: add it to one of the two.
- 5 exports an hour, counted from data.export audit rows written before reading starts (src/modules/export/service.ts).

## Tried and ruled out
- One pull per piece in the ReadableStream: the download hung for good once there was data. A web ReadableStream calls pull again only after a pull that enqueued something, and the zip compressor holds small pieces back, so pull now loops until the zip has given out a chunk.

## Watch out
- In a drizzle select, an outer column interpolated into a raw subquery (sql`... where e.contact_id = ${contacts.id}`) is written as a bare "id", which the subquery's own table answers to when it has an id column. The person's email came out empty that way. Write the outer column in full ("contacts"."id"), as invoices/queries.ts does with "invoices"."id".
- getTableConfig(table).primaryKeys[0].columns are not the same objects as getTableColumns(table); match them by column name.
- TextDecoder (fflate's strFromU8) drops a byte order mark, so check the BOM in the raw bytes.
- In e2e, playwright.request.newContext() inside a spec with test.use({ storageState }) still carries the owner's cookies; pass storageState: { cookies: [], origins: [] } for a signed-out request. Next's route announcer is also a role=alert, so scope alerts to main.
