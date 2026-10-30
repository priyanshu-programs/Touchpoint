import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "About" };

export default function AboutPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">
        Touchpoint: a private business system for one person
      </h1>
      <p>
        Touchpoint is a self-hosted tool a freelancer or consultant runs for their own work. It
        keeps their companies and people, the tasks and follow-ups that go with them, the
        workflows they run for clients, the materials they send, and their invoices and
        payments, with reports on how the business is doing. Each copy of Touchpoint has a
        single owner, who signs in to use it. Nobody else has an account.
      </p>

      <h2 className="text-lg font-semibold">How it uses Google</h2>
      <p>
        The owner can connect their own Google account in Settings. Touchpoint then reads
        their Google Calendar, so their meetings show beside the people and companies
        they&apos;re with and on the day&apos;s overview. Touchpoint will only create a meeting
        when the owner asks for one and confirms it. It doesn&apos;t read email.
      </p>
      <p>
        The connection uses a Google client the owner makes in their own Google Cloud project,
        and can be removed at any time from Touchpoint&apos;s Settings or from the
        owner&apos;s Google account.{" "}
        <Link href="/privacy" className="underline">
          How data is handled
        </Link>
        .
      </p>

      <p>
        <Link href="/sign-in" className="font-medium underline">
          Sign in
        </Link>{" "}
        if this is your Touchpoint.
      </p>
    </>
  );
}
