import type { AiMemoryScope } from "@/db/schema";
import { wordsOf } from "./words";

// The memory graph: you in the middle, the people and companies memories are about around
// you, each memory hanging off its subject, people tied to their companies, and memories
// that share a word tied faintly to each other. Built from rows already read; no model call.

export type GraphMemory = {
  id: string;
  scope: AiMemoryScope;
  content: string;
  terms: string | null;
  recordId: string | null;
  recordName: string | null;
};

export type AtCompany = { contactId: string; organizationId: string; name: string };

export type GraphNode = {
  id: string;
  kind: "you" | "person" | "company" | "memory";
  label: string;
  // The record a person or company node opens.
  recordId?: string;
};

export type GraphLink = {
  source: string;
  target: string;
  kind: "about" | "works" | "word";
  word?: string;
};

// A word shared by more memories than this says little about any two of them.
const MOST_SHARING = 6;
const MAX_WORD_LINKS = 600;
const MIN_WORD_LENGTH = 4;

export const YOU = "you";
const personNode = (id: string) => `person:${id}`;
const companyNode = (id: string) => `company:${id}`;
export const memoryNode = (id: string) => `memory:${id}`;

export function memoryGraph(name: string, memories: GraphMemory[], atCompany: AtCompany[]) {
  const nodes = new Map<string, GraphNode>([[YOU, { id: YOU, kind: "you", label: name }]]);
  const links: GraphLink[] = [];
  const linked = new Set<string>();
  const link = (source: string, target: string, kind: GraphLink["kind"], word?: string) => {
    const key = [source, target].sort().join("|");
    if (linked.has(key)) return;
    linked.add(key);
    links.push({ source, target, kind, ...(word && { word }) });
  };
  const subject = (kind: "person" | "company", id: string, label: string) => {
    const node = kind === "person" ? personNode(id) : companyNode(id);
    if (!nodes.has(node)) {
      nodes.set(node, { id: node, kind, label, recordId: id });
      link(YOU, node, "about");
    }
    return node;
  };

  for (const memory of memories) {
    const node = memoryNode(memory.id);
    nodes.set(node, { id: node, kind: "memory", label: memory.content });
    if (memory.scope === "you" || !memory.recordId) {
      link(YOU, node, "about");
    } else {
      link(subject(memory.scope, memory.recordId, memory.recordName ?? ""), node, "about");
    }
  }

  // A person with memories is tied to each company they're at, memories or not.
  for (const { contactId, organizationId, name: company } of atCompany) {
    if (!nodes.has(personNode(contactId))) continue;
    link(personNode(contactId), subject("company", organizationId, company), "works");
  }

  const sharing = new Map<string, string[]>();
  for (const memory of memories) {
    const words = wordsOf(`${memory.content} ${memory.terms ?? ""}`, 30).filter(
      (word) => word.length >= MIN_WORD_LENGTH,
    );
    for (const word of words) sharing.set(word, [...(sharing.get(word) ?? []), memoryNode(memory.id)]);
  }
  let wordLinks = 0;
  for (const [word, ids] of sharing) {
    if (ids.length < 2 || ids.length > MOST_SHARING) continue;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        if (wordLinks >= MAX_WORD_LINKS) break;
        const before = links.length;
        link(ids[i], ids[j], "word", word);
        if (links.length > before) wordLinks++;
      }
    }
  }

  return { nodes: [...nodes.values()], links };
}
