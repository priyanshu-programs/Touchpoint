"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { ButtonLink } from "@/components/button-link";
import { SelectField, TextareaField, TextField } from "@/components/fields";
import { FormOutcome } from "@/components/form-outcome";
import { RecordPicker } from "@/components/record-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMoney, minorToInput, toMinor } from "@/lib/money";
import { formatDate } from "@/lib/time";
import type { OpenInvoice } from "@/modules/payments/queries";
import { searchClientsAction } from "../invoices/actions";
import { invoiceHref } from "../invoices/labels";
import { openInvoicesAction, recordPaymentAction } from "./actions";
import { methodOptions } from "./labels";

type Amounts = Record<string, string>;

function parseAmounts(json: string | undefined): Amounts {
  try {
    const list = JSON.parse(json ?? "") as unknown;
    if (!Array.isArray(list)) return {};
    return Object.fromEntries(
      (list as { invoiceId: string; amount: string }[]).map((row) => [row.invoiceId, row.amount]),
    );
  } catch {
    return {};
  }
}

// The amount, to the invoice it was recorded from and then oldest due first, until it
// runs out.
function fillOldestFirst(
  invoices: OpenInvoice[],
  available: number,
  currency: string,
  first?: string,
): Amounts {
  let left = available;
  const order = [...invoices].sort((a, b) => Number(b.id === first) - Number(a.id === first));
  return Object.fromEntries(
    order.map((invoice) => {
      const take = Math.max(0, Math.min(left, invoice.balance));
      left -= take;
      return [invoice.id, take > 0 ? minorToInput(take, currency) : ""];
    }),
  );
}

// A client's open invoices with an amount box each, and what the payment has left
// after them. The amounts go with the form as one JSON field.
export function AllocationFields({
  invoices,
  amounts,
  onChange,
  available,
  currency,
}: {
  invoices: OpenInvoice[];
  amounts: Amounts;
  onChange: (amounts: Amounts) => void;
  // What the payment has to give, or null while its amount cannot be read.
  available: number | null;
  currency: string;
}) {
  const show = (minor: number) => formatMoney(minor, currency);
  const given = invoices.reduce(
    (sum, invoice) => sum + (toMinor(amounts[invoice.id] ?? "", currency) ?? 0),
    0,
  );

  return (
    <fieldset className="grid gap-3">
      <legend className="mb-2 text-sm font-medium">Put towards</legend>
      {invoices.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No open invoices in {currency} for this client. The whole payment stays unallocated,
          to put towards a later invoice.
        </p>
      ) : (
        <ul className="grid gap-2">
          {invoices.map((invoice) => (
            <li
              key={invoice.id}
              className="grid items-center gap-2 rounded-md border p-3 text-sm sm:grid-cols-[minmax(0,1fr)_10rem]"
            >
              <div className="grid min-w-0 gap-0.5">
                <Link
                  href={invoiceHref(invoice.id)}
                  target="_blank"
                  className="truncate font-medium underline-offset-4 hover:underline"
                >
                  {invoice.number}
                </Link>
                <span className="text-xs text-muted-foreground">
                  Due {formatDate(invoice.dueDate)} · {show(invoice.balance)} still owed
                </span>
              </div>
              <Input
                aria-label={`Amount for ${invoice.number}`}
                inputMode="decimal"
                placeholder="0"
                value={amounts[invoice.id] ?? ""}
                onChange={(event) =>
                  onChange({ ...amounts, [invoice.id]: event.currentTarget.value })
                }
              />
            </li>
          ))}
        </ul>
      )}
      {available !== null && (
        <p
          className={
            given > available ? "text-sm text-destructive" : "text-sm text-muted-foreground"
          }
          role={given > available ? "alert" : undefined}
        >
          {given > available
            ? `That is ${show(given - available)} more than the payment.`
            : `Unallocated: ${show(available - given)}`}
        </p>
      )}
      <input
        type="hidden"
        name="allocations"
        value={JSON.stringify(
          invoices
            .filter((invoice) => (amounts[invoice.id] ?? "").trim() !== "")
            .map((invoice) => ({ invoiceId: invoice.id, amount: amounts[invoice.id] })),
        )}
      />
    </fieldset>
  );
}

export function PaymentForm({
  initial,
  currencies,
  baseCurrency,
  fromInvoice,
  cancelHref,
}: {
  initial: Record<string, string>;
  currencies: string[];
  baseCurrency: string;
  // Opened from an invoice, the form goes back there once the payment is recorded.
  fromInvoice?: string;
  cancelHref: string;
}) {
  const [state, formAction, pending] = useActionState(recordPaymentAction, null);
  const values = state?.values ?? initial;

  return (
    // Remounting on new values is what makes selects show them after a refused submit.
    <form key={JSON.stringify(values)} action={formAction} className="grid gap-6">
      <PaymentFields
        values={values}
        currencies={currencies}
        baseCurrency={baseCurrency}
        fromInvoice={fromInvoice}
      />
      <input type="hidden" name="idempotencyKey" value={values.idempotencyKey} />
      {fromInvoice && <input type="hidden" name="invoice" value={fromInvoice} />}

      <FormOutcome state={state?.ok ? null : state} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Record payment"}
        </Button>
        {/* After the main button, so pressing Enter in a field never confirms a duplicate. */}
        {state?.canConfirm && (
          <Button
            type="submit"
            name="confirmDuplicate"
            value="yes"
            variant="outline"
            disabled={pending}
          >
            Record anyway
          </Button>
        )}
        <ButtonLink href={cancelHref} variant="ghost">
          Cancel
        </ButtonLink>
      </div>
    </form>
  );
}

// Keyed with the form, so a refused form starts again from what was sent.
function PaymentFields({
  values,
  currencies,
  baseCurrency,
  fromInvoice,
}: {
  values: Record<string, string>;
  currencies: string[];
  baseCurrency: string;
  fromInvoice?: string;
}) {
  const [client, setClient] = useState(values.client);
  const [currency, setCurrency] = useState(values.currency);
  const [amount, setAmount] = useState(values.amount);
  const [invoices, setInvoices] = useState<OpenInvoice[] | null>(null);
  const [amounts, setAmounts] = useState<Amounts>(() => parseAmounts(values.allocations));
  // The amounts follow the payment's amount until the owner types one themselves.
  const [amountsSet, setAmountsSet] = useState(Boolean(values.allocations));
  const available = toMinor(amount, currency);

  useEffect(() => {
    if (!client) return;
    let stale = false;
    void openInvoicesAction(client, currency).then((found) => {
      if (stale) return;
      setInvoices(found);
      if (!amountsSet) {
        setAmounts(fillOldestFirst(found, toMinor(amount, currency) ?? 0, currency, fromInvoice));
      }
    });
    return () => {
      stale = true;
    };
    // Only a new client or currency asks the server again; the amount refills below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, currency]);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <RecordPicker
          name="client"
          labelName="clientName"
          noun="client"
          plural="companies and people"
          initial={values.client ? { id: values.client, label: values.clientName } : null}
          search={searchClientsAction}
          onChange={(option) => {
            setClient(option?.id ?? "");
            setInvoices(null);
            setAmounts({});
            setAmountsSet(false);
          }}
        />
        <TextField
          name="receivedOn"
          label="Received on"
          type="date"
          defaultValue={values.receivedOn}
          required
        />
        <TextField
          name="amount"
          label="Amount"
          inputMode="decimal"
          placeholder="25000"
          value={amount}
          onChange={(event) => {
            const next = event.currentTarget.value;
            setAmount(next);
            if (!amountsSet && invoices) {
              setAmounts(
                fillOldestFirst(invoices, toMinor(next, currency) ?? 0, currency, fromInvoice),
              );
            }
          }}
          required
        />
        <SelectField
          name="currency"
          label="Currency"
          options={currencies.map((code) => ({ value: code, label: code }))}
          value={currency}
          onChange={(event) => {
            setCurrency(event.currentTarget.value);
            setAmounts({});
            setAmountsSet(false);
          }}
        />
        {currency !== baseCurrency ? (
          <TextField
            name="rate"
            label={`Rate to ${baseCurrency}`}
            hint={`What 1 ${currency} was worth in ${baseCurrency} when it arrived.`}
            inputMode="decimal"
            placeholder="83.25"
            defaultValue={values.rate}
            required
          />
        ) : (
          <input type="hidden" name="rate" value="" />
        )}
        <SelectField
          name="method"
          label="How you were paid"
          options={methodOptions}
          defaultValue={values.method}
        />
        <TextField
          name="reference"
          label="Reference (optional)"
          hint="A UTR, cheque number or transaction id."
          defaultValue={values.reference}
          maxLength={100}
        />
      </div>

      {client ? (
        invoices ? (
          <AllocationFields
            invoices={invoices}
            amounts={amounts}
            onChange={(next) => {
              setAmounts(next);
              setAmountsSet(true);
            }}
            available={available}
            currency={currency}
          />
        ) : (
          <p className="text-sm text-muted-foreground">Looking for open invoices…</p>
        )
      ) : (
        <p className="text-sm text-muted-foreground">
          Choose who paid you to see their open invoices.
        </p>
      )}
      {!invoices && <input type="hidden" name="allocations" value="" />}

      <TextareaField
        name="notes"
        label="Notes (optional)"
        defaultValue={values.notes}
        maxLength={2000}
      />
    </>
  );
}
