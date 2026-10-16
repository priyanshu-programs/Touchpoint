import { ChevronLeft, X } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { CompanyLogo } from "@/components/company-logo";
import { DetailRows, SECTION_HEADING } from "@/components/detail-rows";
import { PhotoPreview } from "@/components/photo-preview";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import { requireOwner } from "@/lib/session";
import { getEngagement } from "@/modules/engagements/queries";
import { RecordActions } from "../../people/(lists)/record-actions";
import { StatusMenu } from "../../people/(lists)/status-menu";
import { companyHref, contactHref } from "../../people/labels";
import {
  deleteEngagementAction,
  removeEngagementContactAction,
  setEngagementStatusAction,
} from "../actions";
import { DateText } from "../engagement-bits";
import { engagementStatusOptions } from "../labels";
import { AddPersonForm } from "./add-person-form";

const parseId = async (params: PageProps<"/work/[id]">["params"]) =>
  z.uuid().safeParse((await params).id);

export async function generateMetadata({
  params,
}: PageProps<"/work/[id]">): Promise<Metadata> {
  const owner = await requireOwner();
  const id = await parseId(params);
  const engagement = id.success ? await getEngagement(owner.id, id.data) : null;
  return { title: engagement?.title ?? "Engagement" };
}

function TextSection({
  id,
  heading,
  text,
  empty,
}: {
  id: string;
  heading: string;
  text: string | null;
  empty: string;
}) {
  return (
    <section aria-labelledby={id} className="grid content-start gap-2 text-sm">
      <h2 id={id} className={SECTION_HEADING}>
        {heading}
      </h2>
      {text ? (
        <p className="break-words whitespace-pre-wrap">{text}</p>
      ) : (
        <p className="text-muted-foreground">{empty}</p>
      )}
    </section>
  );
}

export default async function EngagementPage({ params }: PageProps<"/work/[id]">) {
  const owner = await requireOwner();
  const id = await parseId(params);
  if (!id.success) notFound();
  const engagement = await getEngagement(owner.id, id.data);
  if (!engagement) notFound();

  const company = companyHref(engagement.organizationId);
  const details = [
    {
      label: "Company",
      value: (
        <Link href={company} className="underline">
          {engagement.organizationName}
        </Link>
      ),
    },
    { label: "Start", value: engagement.startDate && <DateText date={engagement.startDate} /> },
    {
      label: "Target end",
      value: engagement.targetEndDate && <DateText date={engagement.targetEndDate} />,
    },
    {
      label: "Value",
      value:
        engagement.valueMinor !== null &&
        formatMoney(engagement.valueMinor, engagement.currency),
    },
    { label: "Payment terms", value: engagement.paymentTerms },
  ];

  return (
    <div className="grid gap-6">
      <Link
        href="/work"
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden />
        Work
      </Link>

      <header className="flex flex-wrap items-start gap-3">
        <CompanyLogo
          id={engagement.organizationId}
          name={engagement.organizationName}
          logoVersion={engagement.logoVersion}
          className="size-10 text-sm"
        />
        <div className="grid min-w-0 flex-1 gap-1">
          <h1 className="text-2xl font-semibold tracking-tight break-words">
            {engagement.title}
          </h1>
          <p className="text-muted-foreground">
            for{" "}
            <Link href={company} className="underline-offset-4 hover:underline">
              {engagement.organizationName}
            </Link>
          </p>
          <div>
            <StatusMenu
              label="Status"
              value={engagement.status}
              options={engagementStatusOptions}
              action={setEngagementStatusAction.bind(null, engagement.id)}
            />
          </div>
        </div>
        <RecordActions
          id={engagement.id}
          editHref={`/work/${engagement.id}/edit`}
          remove={{
            title: `Delete ${engagement.title}?`,
            description:
              "The engagement and the people on it are removed for good. The company and its people stay as they are.",
            confirmLabel: "Delete engagement",
            action: deleteEngagementAction,
          }}
        />
      </header>

      <div className="grid gap-6 rounded-xl border bg-card md:grid-cols-[minmax(0,1fr)_22rem] md:gap-0">
        <div className="grid content-start gap-6 p-4">
          <TextSection
            id="scope-heading"
            heading="Scope"
            text={engagement.scope}
            empty="No scope written yet."
          />
          <TextSection
            id="objectives-heading"
            heading="Objectives"
            text={engagement.objectives}
            empty="No objectives written yet."
          />
        </div>

        <div className="grid content-start border-t md:border-t-0 md:border-l">
          <section aria-labelledby="details-heading" className="grid gap-3 p-4">
            <h2 id="details-heading" className={SECTION_HEADING}>
              Details
            </h2>
            <DetailRows rows={details} />
          </section>

          <section
            aria-labelledby="people-heading"
            className="grid gap-3 border-t p-4"
          >
            <h2 id="people-heading" className={SECTION_HEADING}>
              People
            </h2>
            {engagement.contacts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nobody on this engagement yet.
              </p>
            ) : (
              <ul className="grid gap-2">
                {engagement.contacts.map((person) => (
                  <li key={person.id} className="flex items-center gap-2 text-sm">
                    <PhotoPreview
                      id={person.id}
                      name={person.fullName}
                      photoVersion={person.photoVersion}
                    />
                    <div className="grid min-w-0 flex-1">
                      <Link
                        href={contactHref(person.id)}
                        className="truncate font-medium underline-offset-4 hover:underline"
                      >
                        {person.fullName}
                      </Link>
                      {(person.role ?? person.jobTitle) && (
                        <span className="truncate text-xs text-muted-foreground">
                          {person.role ?? person.jobTitle}
                        </span>
                      )}
                    </div>
                    <form action={removeEngagementContactAction}>
                      <input type="hidden" name="id" value={engagement.id} />
                      <input type="hidden" name="contactId" value={person.id} />
                      <Button
                        type="submit"
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        aria-label={`Remove ${person.fullName}`}
                      >
                        <X aria-hidden />
                      </Button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
            <AddPersonForm engagementId={engagement.id} />
          </section>
        </div>
      </div>
    </div>
  );
}
