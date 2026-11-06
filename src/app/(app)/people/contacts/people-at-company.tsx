"use client";

import { useCallback, useRef, useState } from "react";
import {
  RecordPicker,
  RecordsPicker,
  type PickerOption,
} from "@/components/record-picker";
import { searchOrganizationsAction } from "../organizations/actions";
import { outsidersAction, searchContactsAction } from "./actions";

const listed = new Intl.ListFormat("en-GB", { type: "conjunction" });

// The people and the company of a send or an activity. With a company chosen, only its
// people are offered, and choosing another company takes off whoever isn't there. Asked
// from a company's own panel, `companyFixed` keeps that company and offers no other.
export function PeopleAtCompany({
  contacts,
  organization,
  inline,
  companyFixed,
}: {
  contacts: PickerOption[];
  organization: PickerOption | null;
  inline?: boolean;
  companyFixed?: boolean;
}) {
  const [people, setPeople] = useState(contacts);
  const [company, setCompany] = useState(organization);
  const [note, setNote] = useState<string | null>(null);
  // Only the answer for the company chosen last takes anyone off.
  const latest = useRef(0);

  const at = company?.id;
  const search = useCallback((query: string) => searchContactsAction(query, at), [at]);

  const choose = async (option: PickerOption | null) => {
    const asked = ++latest.current;
    setCompany(option);
    setNote(null);
    if (!option || people.length === 0) return;
    const away = await outsidersAction(option.id, people.map(({ id }) => id));
    if (!away || asked !== latest.current) return;
    const gone = new Set(away.people.map(({ id }) => id));
    setPeople((current) => current.filter(({ id }) => !gone.has(id)));
    setNote(
      `Took off ${listed.format(away.people.map(({ name }) => name))}: not at ${away.company}.`,
    );
  };

  return (
    <div className={companyFixed ? "grid gap-4" : "grid gap-4 sm:grid-cols-2"}>
      <RecordsPicker
        name="contacts"
        noun="contact"
        initial={contacts}
        value={people}
        onChange={setPeople}
        inline={inline}
        search={search}
        empty={company ? `Nobody at ${company.label} matches.` : undefined}
      />
      {companyFixed ? (
        <>
          <input type="hidden" name="organizationId" value={organization?.id ?? ""} />
          <input type="hidden" name="organizationName" value={organization?.label ?? ""} />
        </>
      ) : (
        <RecordPicker
          name="organizationId"
          labelName="organizationName"
          noun="company"
          plural="companies"
          initial={organization}
          search={searchOrganizationsAction}
          onChange={choose}
          inline={inline}
        />
      )}
      {note && (
        <p role="status" className="text-sm text-muted-foreground sm:col-span-2">
          {note}
        </p>
      )}
    </div>
  );
}
