import Link from "next/link";
import { SECTION_HEADING } from "@/components/detail-rows";
import { companyGraph, companyNode, memoryNode, personNode } from "@/modules/memory/graph";
import {
  companyMemories,
  countMemories,
  MEMORY_LIMIT,
  personMemories,
  type ListedMemory,
} from "@/modules/memory/service";
import { GraphPanel } from "./graph-panel";
import { AddMemoryForm, MemoryRow } from "./memory-forms";
import { MemoryViews } from "./memory-views";
import { graphHref, LIMITS, rowOf } from "./rows";

// The heading above each list already names whom its memories are about.
function Rows({ memories }: { memories: ListedMemory[] }) {
  return (
    <ul className="grid gap-2">
      {memories.map((memory) => (
        <li key={memory.id}>
          <MemoryRow limits={LIMITS} memory={{ ...rowOf(memory), recordName: null }} />
        </li>
      ))}
    </ul>
  );
}

function AddMemory({
  total,
  record,
}: {
  total: number;
  record: { about: "person" | "company"; id: string };
}) {
  return (
    <section aria-labelledby="add-memory-heading" className="grid gap-2">
      <h3 id="add-memory-heading" className={SECTION_HEADING}>
        Add a memory
      </h3>
      <AddMemoryForm full={total >= MEMORY_LIMIT} limits={LIMITS} record={record} />
    </section>
  );
}

function Names({ people }: { people: { id: string; name: string; href: string }[] }) {
  return people.map((person, index) => (
    <span key={person.id}>
      {index > 0 && ", "}
      <Link href={person.href} scroll={false} className="underline">
        {person.name}
      </Link>
    </span>
  ));
}

// A company's Memory tab: the company in the middle of a graph with everyone at it, people
// with nothing remembered as hollow dots, and the same as a list.
export async function CompanyMemory({
  ownerId,
  organization,
  personHref,
}: {
  ownerId: string;
  organization: { id: string; name: string };
  // Where a person opens: inside this company's panel, on their own Memory tab.
  personHref: (id: string) => string;
}) {
  const [{ memories, people }, total] = await Promise.all([
    companyMemories(ownerId, organization.id),
    countMemories(ownerId),
  ]);
  const graph = companyGraph(organization, people, memories);
  const own = memories.filter((memory) => memory.scope === "company");
  const byPerson = people.map((person) => ({
    ...person,
    href: personHref(person.id),
    memories: memories.filter((memory) => memory.recordId === person.id),
  }));
  const unknown = byPerson.filter((person) => person.memories.length === 0);

  const list = (
    <div className="grid gap-6">
      <section aria-label={organization.name} className="grid gap-2">
        <h3 className="font-medium">
          {organization.name}{" "}
          <span className="text-sm font-normal text-muted-foreground">({own.length})</span>
        </h3>
        {own.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing about the company itself yet.</p>
        ) : (
          <Rows memories={own} />
        )}
      </section>
      {byPerson
        .filter((person) => person.memories.length > 0)
        .map((person) => (
          <section key={person.id} aria-label={person.name} className="grid gap-2">
            <h3 className="font-medium">
              <Link href={person.href} scroll={false} className="underline-offset-4 hover:underline">
                {person.name}
              </Link>{" "}
              <span className="text-sm font-normal text-muted-foreground">
                ({person.memories.length})
              </span>
            </h3>
            <Rows memories={person.memories} />
          </section>
        ))}
      {unknown.length > 0 && (
        <section aria-label="Nothing remembered yet" className="grid gap-2">
          <h3 className="font-medium">Nothing remembered yet</h3>
          <p className="text-sm text-muted-foreground">
            <Names people={unknown} />
          </p>
        </section>
      )}
    </div>
  );

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          What the assistant remembers about {organization.name} and the people at it.
        </p>
        <Link href={graphHref(companyNode(organization.id))} className="text-sm underline">
          See in the whole graph
        </Link>
      </div>
      <MemoryViews
        graph={
          <GraphPanel
            nodes={graph.nodes}
            links={graph.links}
            matches={null}
            memories={Object.fromEntries(
              memories.map((memory) => [memoryNode(memory.id), rowOf(memory)]),
            )}
            hrefs={Object.fromEntries(
              byPerson.map((person) => [personNode(person.id), person.href]),
            )}
            limits={LIMITS}
          />
        }
        list={list}
      />
      <AddMemory total={total} record={{ about: "company", id: organization.id }} />
    </div>
  );
}

// A person's Memory tab: what the assistant remembers about them, and a way to their
// companies' graphs.
export async function PersonMemory({
  ownerId,
  contact,
  companies,
}: {
  ownerId: string;
  contact: { id: string; fullName: string };
  companies: { id: string; name: string; href: string }[];
}) {
  const [memories, total] = await Promise.all([
    personMemories(ownerId, contact.id),
    countMemories(ownerId),
  ]);
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          What the assistant remembers about {contact.fullName}.
        </p>
        {memories.length > 0 && (
          <Link href={graphHref(personNode(contact.id))} className="text-sm underline">
            See in the whole graph
          </Link>
        )}
      </div>
      {memories.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing remembered about {contact.fullName} yet.
        </p>
      ) : (
        <Rows memories={memories} />
      )}
      {companies.length > 0 && (
        <p className="text-sm text-muted-foreground">
          See them with everyone at <Names people={companies} />.
        </p>
      )}
      <AddMemory total={total} record={{ about: "person", id: contact.id }} />
    </div>
  );
}
