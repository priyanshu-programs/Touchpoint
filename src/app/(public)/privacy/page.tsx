import type { Metadata } from "next";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Privacy policy</h1>
      <p className="text-muted-foreground">Last updated 30 October 2026</p>

      <p>
        Touchpoint is used by one person, its owner, to run their own business. This policy
        says what it keeps and what it does with data from Google.
      </p>

      <h2 className="text-lg font-semibold">What Touchpoint keeps</h2>
      <p>
        What the owner enters (companies, people, tasks, notes, workflows, materials, invoices
        and payments) and public details read from a company&apos;s own website. Everything is
        stored in the owner&apos;s own database. It isn&apos;t sold, shared with anyone or used
        for advertising. The owner can download all of it from Settings at any time.
      </p>

      <h2 className="text-lg font-semibold">Data from Google</h2>
      <p>When the owner connects their Google account, Touchpoint receives:</p>
      <ul className="grid list-disc gap-1 pl-5">
        <li>the account&apos;s email address, to show which account is connected;</li>
        <li>
          read access to their Google Calendar (<span className="font-mono">calendar.readonly</span>
          ), to show their meetings in Touchpoint beside the people and companies they&apos;re
          with.
        </li>
      </ul>
      <p>
        If the owner turns on scheduling, Touchpoint asks Google for permission to add events (
        <span className="font-mono">calendar.events</span>). It adds one only after the owner
        confirms it, with the title, times, location and guests they chose, and with Google
        sending the invitation if they ask for that. It never changes or removes an event. Notes
        written for an invitation go to Google and aren&apos;t kept in Touchpoint. Touchpoint
        doesn&apos;t read, send or store email itself.
      </p>
      <p>
        Calendar data is used only to show the owner their own meetings in Touchpoint. It is
        not shared with or sold to anyone, not used for advertising, and not used to train any
        AI model. People don&apos;t read it, apart from the owner. The access Google grants is
        stored encrypted. Disconnecting in Settings, or removing Touchpoint at
        myaccount.google.com/permissions, ends it at once.
      </p>
      <p>
        To show meetings, Touchpoint keeps a copy of each one from the owner&apos;s main
        calendar: its title, times, location, meeting link, and the names and email addresses
        of the people invited. It doesn&apos;t keep the event&apos;s description. Disconnecting
        in Settings, or connecting a different Google account, deletes that copy. After access
        is removed at Google, Touchpoint stops reading the calendar and the copy stays until
        the owner disconnects in Settings.
      </p>
      <p>
        Touchpoint&apos;s use and transfer of information received from Google APIs adheres to
        the{" "}
        <a
          href="https://developers.google.com/terms/api-services-user-data-policy"
          className="underline"
          rel="noopener noreferrer"
          target="_blank"
        >
          Google API Services User Data Policy
        </a>
        , including the Limited Use requirements.
      </p>

      <h2 className="text-lg font-semibold">Questions</h2>
      <p>
        {env.CONTACT_EMAIL
          ? `Write to ${env.CONTACT_EMAIL}.`
          : "Ask the person who runs this copy of Touchpoint."}
      </p>
    </>
  );
}
