import { MEMORY_MAX_LENGTH, MEMORY_TERMS_MAX_LENGTH } from "@/db/schema";
import { companyHref, contactHref } from "@/lib/record-href";
import type { ListedMemory } from "@/modules/memory/service";
import type { MemoryRowData } from "./memory-forms";

export const LIMITS = { content: MEMORY_MAX_LENGTH, terms: MEMORY_TERMS_MAX_LENGTH };

const hrefOf = (memory: ListedMemory) =>
  memory.recordId
    ? memory.scope === "person"
      ? contactHref(memory.recordId)
      : companyHref(memory.recordId)
    : null;

export const rowOf = (memory: ListedMemory): MemoryRowData => ({
  id: memory.id,
  content: memory.content,
  terms: memory.terms,
  recordName: memory.recordName,
  recordHref: hrefOf(memory),
  fromAssistant: memory.source === "ai",
});

// Settings → Memory's graph, opened on one person or company.
export const graphHref = (node: string) => `/settings/memory?view=graph&focus=${node}`;
