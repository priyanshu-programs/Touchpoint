import { SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { getActivity } from "@/modules/activities/queries";
import { formatMoney } from "@/lib/money";
import { dateIn } from "@/lib/time";
import { getInvoice } from "@/modules/invoices/queries";
import { invoiceState } from "@/modules/invoices/state";
import { getPayment, openInvoices } from "@/modules/payments/queries";
import { getMeeting } from "@/modules/integrations/meetings";
import { isCancellable, schedulingState } from "@/modules/integrations/scheduling";
import { getSettings } from "@/modules/settings/service";
import { getTask } from "@/modules/tasks/queries";
import { ActivityEditor } from "@/app/(app)/activities/activity-editor";
import { InvoiceActions } from "@/app/(app)/money/invoices/[id]/invoice-actions";
import { InvoiceDetails } from "@/app/(app)/money/invoices/[id]/invoice-details";
import { EditInvoice, isEditable, NewInvoice } from "@/app/(app)/money/invoices/invoice-editors";
import { InvoiceStatusPill } from "@/app/(app)/money/invoices/status-pill";
import { PaymentActions } from "@/app/(app)/money/payments/[id]/payment-actions";
import { PaymentDetails } from "@/app/(app)/money/payments/[id]/payment-details";
import { filledIn, NewPayment } from "@/app/(app)/money/payments/new-payment";
import { NewActivity } from "@/app/(app)/activities/new-activity";
import { NewSend } from "@/app/(app)/materials/new-send";
import { MeetingDetails } from "@/app/(app)/meetings/meeting-details";
import { NewMeeting } from "@/app/(app)/meetings/new-meeting";
import { NewTask } from "@/app/(app)/tasks/new-task";
import { TaskEditor } from "@/app/(app)/tasks/task-editor";
import type { EntryParam } from "./list-controls";
import type { PanelOrigin } from "@/app/(app)/money/panel-origin";
import { PanelBackLink, PanelBackProvider } from "./panel-back";

type Client = { organizationId: string } | { contactId: string };

// Whether an invoice or a payment is the panel's record's own.
const billsTo = (
  client: Client,
  row: { organizationId: string | null; contactId: string | null },
) =>
  "organizationId" in client
    ? row.organizationId === client.organizationId
    : row.contactId === client.contactId;

// The entry an address asks for: a new one, or one of the owner's. An id that is not
// theirs, or is gone, is no entry, and the record is shown as if it had not been asked for.
// An invoice or payment must also be the record's, `client`.
export async function findEntry(
  ownerId: string,
  client: Client,
  params: {
    activity?: EntryParam;
    task?: EntryParam;
    invoice?: EntryParam;
    payment?: EntryParam;
    edit?: "1";
    send?: "new";
    schedule?: "new";
    event?: string;
  },
) {
  if (params.payment === "new") {
    const towards =
      params.invoice && params.invoice !== "new"
        ? await getInvoice(ownerId, params.invoice)
        : null;
    return {
      kind: "payment",
      payment: null,
      towards: towards && billsTo(client, towards) ? towards : null,
    } as const;
  }
  if (params.payment) {
    const payment = await getPayment(ownerId, params.payment);
    if (payment && billsTo(client, payment)) {
      return { kind: "payment", payment, towards: null } as const;
    }
  }
  if (params.invoice === "new") return { kind: "invoice", invoice: null, editing: false } as const;
  if (params.invoice) {
    const invoice = await getInvoice(ownerId, params.invoice);
    if (invoice && billsTo(client, invoice)) {
      const editing = params.edit === "1" && isEditable(invoice);
      return { kind: "invoice", invoice, editing } as const;
    }
  }
  if (params.schedule === "new") return { kind: "schedule" } as const;
  if (params.send === "new") return { kind: "send" } as const;
  if (params.task === "new") return { kind: "task", task: null } as const;
  if (params.task) {
    const task = await getTask(ownerId, params.task);
    if (task) return { kind: "task", task } as const;
  }
  const meeting = params.event ? await getMeeting(ownerId, params.event) : null;
  if (params.activity === "new") {
    return { kind: "activity", activity: null, meeting } as const;
  }
  if (params.activity) {
    const activity = await getActivity(ownerId, params.activity);
    if (activity) return { kind: "activity", activity, meeting: null } as const;
  }
  if (meeting) return { kind: "meeting", meeting } as const;
  return null;
}
export type Entry = NonNullable<Awaited<ReturnType<typeof findEntry>>>;

export const entryKey = (entry: Entry) =>
  entry.kind === "invoice"
    ? `invoice:${entry.invoice?.id ?? "new"}${entry.editing ? ":edit" : ""}`
    : entry.kind === "payment"
      ? `payment:${entry.payment?.id ?? "new"}:${entry.towards?.id ?? ""}`
      : entry.kind === "send"
    ? "send:new"
    : entry.kind === "schedule"
      ? "schedule:new"
      : entry.kind === "task"
      ? `task:${entry.task?.id ?? "new"}`
      : entry.kind === "meeting"
        ? `meeting:${entry.meeting.id}`
        : `activity:${entry.activity?.id ?? "new"}:${entry.meeting?.id ?? ""}`;

// The meeting an address names, once it is found to be the owner's.
export const entryMeetingId = (entry: Entry | null) =>
  entry && (entry.kind === "meeting" || entry.kind === "activity")
    ? entry.meeting?.id
    : undefined;

// The tab of the record that an entry of this kind is listed on, and goes back to.
export const entryTab = (entry: Entry) =>
  entry.kind === "task"
    ? "tasks"
    : entry.kind === "invoice" || entry.kind === "payment"
      ? "money"
      : "activity";

// The address's invoice and payment, as far as they were found to be the record's.
export const entryMoneyParams = (entry: Entry | null) => ({
  invoice:
    entry?.kind === "invoice"
      ? (entry.invoice?.id ?? ("new" as const))
      : entry?.kind === "payment"
        ? entry.towards?.id
        : undefined,
  payment: entry?.kind === "payment" ? (entry.payment?.id ?? ("new" as const)) : undefined,
  edit: entry?.kind === "invoice" && entry.editing ? ("1" as const) : undefined,
});

// What the address of the panel says about an invoice or payment entry, to open another.
export type MoneyEntryChange = { invoice?: string; payment?: string; edit?: "1" };

// One activity or task, new or existing. It takes the place of the open record in the
// panel until the owner goes back.
export async function EntryPanel({
  ownerId,
  entry,
  contact,
  organization,
  back,
  entryHref,
}: {
  ownerId: string;
  entry: Entry;
  // Whose panel this is: a person, a company, or both for a person inside a company's panel.
  contact: {
    id: string;
    fullName: string;
    companies: { id: string; name: string }[];
  } | null;
  organization: { id: string; name: string } | null;
  back: { href: string; label: string };
  // The same panel with another invoice or payment open in it.
  entryHref: (change: MoneyEntryChange) => string;
}) {
  const timezone = (await getSettings(ownerId))?.timezone ?? "UTC";
  const from = contact ? "contact" : "organization";
  const inside = contact ? organization?.id : undefined;
  if (entry.kind === "invoice" || entry.kind === "payment") {
    return (
      <MoneyEntry
        ownerId={ownerId}
        entry={entry}
        timezone={timezone}
        origin={{ from, inside }}
        recordName={[contact?.fullName, organization?.name].filter(Boolean).join(" at ")}
        client={
          contact
            ? { kind: "contact", id: contact.id, name: contact.fullName }
            : { kind: "organization", id: organization!.id, name: organization!.name }
        }
        back={back}
        entryHref={entryHref}
      />
    );
  }
  const cancellable =
    entry.kind === "meeting" &&
    isCancellable(entry.meeting, dateIn(timezone)) &&
    (await schedulingState(ownerId)) === "ready";
  const title =
    entry.kind === "send"
      ? "Log a send"
      : entry.kind === "schedule"
        ? "Schedule meeting"
        : entry.kind === "task"
        ? (entry.task?.title ?? "Add task")
        : entry.kind === "meeting"
          ? entry.meeting.title
          : (entry.activity?.title ?? "Log activity");

  return (
    <PanelBackProvider>
      <header className="flex items-start gap-2 border-b p-4 pr-12">
        <PanelBackLink href={back.href} label={back.label} />
        <div className="grid min-w-0 flex-1 gap-0.5">
          <SheetTitle className="text-lg break-words">{title}</SheetTitle>
          <SheetDescription>
            {[contact?.fullName, organization?.name].filter(Boolean).join(" at ")}
          </SheetDescription>
        </div>
      </header>

      <div className="p-4">
        {entry.kind === "meeting" ? (
          <MeetingDetails
            meeting={entry.meeting}
            timezone={timezone}
            cancel={
              cancellable
                ? {
                    from,
                    inside: contact ? inside : organization?.id,
                    contactId: contact?.id,
                  }
                : null
            }
          />
        ) : entry.kind === "send" ? (
          <NewSend
            ownerId={ownerId}
            contact={contact}
            organization={organization}
            timezone={timezone}
            inside={inside}
            cancelHref={back.href}
          />
        ) : entry.kind === "schedule" ? (
          <NewMeeting
            ownerId={ownerId}
            contact={contact}
            organization={organization}
            timezone={timezone}
            inside={inside}
            cancelHref={back.href}
          />
        ) : entry.kind === "task" ? (
          entry.task ? (
            <TaskEditor
              task={entry.task}
              timezone={timezone}
              cancelHref={back.href}
            />
          ) : (
            <NewTask
              contact={contact}
              organization={organization}
              timezone={timezone}
              inside={inside}
              cancelHref={back.href}
            />
          )
        ) : entry.activity ? (
          <ActivityEditor
            activity={entry.activity}
            timezone={timezone}
            cancelHref={back.href}
            from={from}
            inside={inside}
          />
        ) : (
          <NewActivity
            contact={contact}
            organization={organization}
            meeting={entry.meeting}
            timezone={timezone}
            inside={inside}
            cancelHref={back.href}
          />
        )}
      </div>
    </PanelBackProvider>
  );
}

type MoneyEntryKind = Extract<Entry, { kind: "invoice" | "payment" }>;

// An invoice or payment of the record, new or existing, in place of the record. Each
// goes back to the Invoices tab, except an invoice being edited, or paid towards, which
// goes back to the invoice.
async function MoneyEntry({
  ownerId,
  entry,
  timezone,
  origin,
  recordName,
  client,
  back,
  entryHref,
}: {
  ownerId: string;
  entry: MoneyEntryKind;
  timezone: string;
  origin: PanelOrigin;
  recordName: string;
  client: { kind: "contact" | "organization"; id: string; name: string };
  back: { href: string; label: string };
  entryHref: (change: MoneyEntryChange) => string;
}) {
  const parent =
    entry.kind === "invoice" && entry.invoice && entry.editing
      ? entry.invoice
      : entry.kind === "payment"
        ? entry.towards
        : null;
  const up = parent
    ? { href: entryHref({ invoice: parent.id }), label: `Back to invoice ${parent.number}` }
    : back;
  const title =
    entry.kind === "invoice"
      ? entry.invoice
        ? `${entry.editing ? "Edit invoice" : "Invoice"} ${entry.invoice.number}`
        : "New invoice"
      : entry.payment
        ? `${formatMoney(entry.payment.amountMinor, entry.payment.currency)} received`
        : "Record payment";

  return (
    <PanelBackProvider>
      <header className="flex items-start gap-2 border-b p-4 pr-12">
        <PanelBackLink href={up.href} label={up.label} />
        <div className="grid min-w-0 flex-1 gap-0.5">
          <SheetTitle className="text-lg break-words">{title}</SheetTitle>
          <SheetDescription>{recordName}</SheetDescription>
        </div>
      </header>

      <div className="grid gap-6 p-4">
        {entry.kind === "invoice" ? (
          !entry.invoice ? (
            <NewInvoice
              ownerId={ownerId}
              client={{ id: `${client.kind}:${client.id}`, label: client.name }}
              cancelHref={back.href}
              savedHref={back.href}
              origin={origin}
            />
          ) : entry.editing ? (
            <EditInvoice
              ownerId={ownerId}
              invoice={entry.invoice}
              cancelHref={up.href}
              origin={origin}
            />
          ) : (
            <>
              <div className="flex items-center justify-between gap-2">
                <InvoiceStatusPill state={invoiceState(entry.invoice, dateIn(timezone))} />
                <InvoiceActions
                  id={entry.invoice.id}
                  number={entry.invoice.number}
                  status={entry.invoice.status}
                  payments={entry.invoice.allocations.length}
                  editHref={entryHref({ invoice: entry.invoice.id, edit: "1" })}
                  origin={origin}
                />
              </div>
              <InvoiceDetails
                invoice={entry.invoice}
                hrefs={{
                  newPayment: entryHref({ invoice: entry.invoice.id, payment: "new" }),
                  payment: (id) => entryHref({ payment: id }),
                }}
              />
            </>
          )
        ) : !entry.payment ? (
          <NewPayment
            ownerId={ownerId}
            filled={await filledIn(ownerId, {
              invoice: entry.towards?.id,
              [client.kind === "contact" ? "person" : "company"]: client.id,
            })}
            cancelHref={up.href}
            origin={origin}
          />
        ) : (
          <>
            <div className="flex justify-end">
              <PaymentActions
                id={entry.payment.id}
                label={`the payment of ${formatMoney(entry.payment.amountMinor, entry.payment.currency)}`}
                origin={origin}
              />
            </div>
            <PaymentDetails
              payment={entry.payment}
              open={
                entry.payment.unallocated > 0
                  ? await openInvoices(
                      ownerId,
                      entry.payment.organizationId
                        ? { organizationId: entry.payment.organizationId }
                        : { contactId: entry.payment.contactId! },
                      entry.payment.currency,
                    )
                  : []
              }
              invoiceHref={(id) => entryHref({ invoice: id })}
            />
          </>
        )}
      </div>
    </PanelBackProvider>
  );
}
