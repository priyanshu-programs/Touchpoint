"use client";

import { Plus, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { ButtonLink } from "@/components/button-link";
import { SelectField, TextareaField, TextField } from "@/components/fields";
import { FormOutcome } from "@/components/form-outcome";
import { RecordPicker } from "@/components/record-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMoney, lineAmount, toHundredths, toMinor } from "@/lib/money";
import { addDays } from "@/lib/time";
import {
  DEFAULT_TERMS_DAYS,
  MAX_INVOICE_ADJUSTMENTS,
  MAX_INVOICE_LINES,
} from "@/modules/invoices/schema";
import { MAX_FILE_BYTES } from "@/modules/workflows/drawing";
import { searchClientsAction, type InvoiceFormState } from "./actions";
import { FILE_REFUSALS, INVOICE_FILE_ACCEPT, INVOICE_FILE_HINT, invoiceHref } from "./labels";
import { sendInvoiceFile } from "./send-file";

type Line = { description: string; quantity: string; unitPrice: string; category: string };
type Adjustment = { reason: string; amount: string };

const EMPTY_LINE: Line = { description: "", quantity: "1", unitPrice: "", category: "" };

function parseList<T>(json: string | undefined, fallback: T[]): T[] {
  try {
    const list = JSON.parse(json ?? "") as unknown;
    return Array.isArray(list) ? (list as T[]) : fallback;
  } catch {
    return fallback;
  }
}

// What a line comes to as typed, or null while it cannot be read yet.
function amountOf(line: Line, currency: string) {
  const hundredths = toHundredths(line.quantity);
  const unit = toMinor(line.unitPrice, currency);
  return hundredths === null || unit === null ? null : lineAmount(hundredths, unit);
}

export function InvoiceForm({
  action,
  initial,
  currencies,
  categories,
  issued = false,
  withFile = false,
  cancelHref,
}: {
  action: (state: InvoiceFormState, formData: FormData) => Promise<InvoiceFormState>;
  initial: Record<string, string>;
  currencies: string[];
  categories: string[];
  // An issued invoice is saved as it is; it does not go back to being a draft.
  issued?: boolean;
  // A new invoice can bring its file along.
  withFile?: boolean;
  cancelHref: string;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(action, null);
  const values = state?.values ?? initial;
  const [file, setFile] = useState<File | null>(null);
  const [unsent, setUnsent] = useState<{ id: string; message: string } | null>(null);
  const savedId = state?.ok ? state.id : undefined;

  // The invoice is saved; the file goes up after it, then the invoice opens.
  useEffect(() => {
    if (!savedId || !file) return;
    let stale = false;
    void sendInvoiceFile(savedId, file).then((message) => {
      if (stale) return;
      if (message === null) {
        router.push(invoiceHref(savedId));
        return;
      }
      setUnsent({ id: savedId, message });
    });
    return () => {
      stale = true;
    };
  }, [savedId, file, router]);

  if (unsent) {
    return (
      <div role="alert" className="grid gap-3 text-sm">
        <p>
          The invoice was saved, but its file was not attached: {unsent.message}
        </p>
        <Link href={invoiceHref(unsent.id)} className="font-medium underline">
          Open the invoice to attach it
        </Link>
      </div>
    );
  }

  // Saved with a file still going up counts as busy too.
  const busy = pending || Boolean(savedId);

  return (
    // Remounting on new values is what makes selects show them after a rejected submit.
    <form key={JSON.stringify(values)} action={formAction} className="grid gap-6">
      <InvoiceFields values={values} currencies={currencies} categories={categories} />

      {withFile && (
        <div className="grid gap-2">
          <span className="text-sm font-medium">Invoice file (optional)</span>
          {file ? (
            <div className="flex min-w-0 items-center gap-2 rounded-md border px-3 py-1.5 text-sm">
              <span className="min-w-0 flex-1 truncate">{file.name}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label={`Remove ${file.name}`}
                onClick={() => setFile(null)}
              >
                <X aria-hidden />
              </Button>
            </div>
          ) : (
            <FilePicker onPick={setFile} />
          )}
          {file && file.size > MAX_FILE_BYTES && (
            <p role="alert" className="text-sm text-destructive">
              {FILE_REFUSALS.too_large}
            </p>
          )}
          <input type="hidden" name="withFile" value={file ? "1" : ""} />
        </div>
      )}

      <FormOutcome state={state?.ok ? null : state} />
      <div className="flex flex-wrap gap-2">
        {issued ? (
          <Button type="submit" name="status" value="issued" disabled={busy}>
            {busy ? "Saving…" : "Save changes"}
          </Button>
        ) : (
          <>
            {/* First, so Enter in a field keeps it a draft. */}
            <Button
              type="submit"
              name="status"
              value="draft"
              variant="outline"
              disabled={busy}
            >
              Save as draft
            </Button>
            <Button type="submit" name="status" value="issued" disabled={busy}>
              {busy ? "Saving…" : "Save as issued"}
            </Button>
          </>
        )}
        <ButtonLink href={cancelHref} variant="ghost">
          Cancel
        </ButtonLink>
      </div>
    </form>
  );
}

function FilePicker({ onPick }: { onPick: (file: File) => void }) {
  const picker = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" size="sm" onClick={() => picker.current?.click()}>
        Choose a file
      </Button>
      <span className="text-xs text-muted-foreground">{INVOICE_FILE_HINT}</span>
      <input
        ref={picker}
        type="file"
        aria-label="Invoice file"
        className="sr-only"
        accept={INVOICE_FILE_ACCEPT}
        onChange={(event) => {
          const [chosen] = event.currentTarget.files ?? [];
          // Emptied, so choosing the same file again is still a change.
          event.currentTarget.value = "";
          if (chosen) onPick(chosen);
        }}
      />
    </div>
  );
}

// Keyed with the form, so a refused form starts again from what was sent.
function InvoiceFields({
  values,
  currencies,
  categories,
}: {
  values: Record<string, string>;
  currencies: string[];
  categories: string[];
}) {
  const [currency, setCurrency] = useState(values.currency);
  const [issueDate, setIssueDate] = useState(values.issueDate);
  const [dueDate, setDueDate] = useState(values.dueDate);
  // The due date follows the issue date until the owner sets it themselves.
  const [dueSet, setDueSet] = useState(
    Boolean(values.dueDate) && values.dueDate !== addDays(values.issueDate, DEFAULT_TERMS_DAYS),
  );
  const [lines, setLines] = useState<Line[]>(() => parseList(values.lines, [EMPTY_LINE]));
  const [adjustments, setAdjustments] = useState<Adjustment[]>(() =>
    parseList(values.adjustments, []),
  );

  const amounts = lines.map((line) => amountOf(line, currency));
  const subtotal = amounts.reduce<number>((sum, amount) => sum + (amount ?? 0), 0);
  const off = adjustments.reduce(
    (sum, adjustment) => sum + (toMinor(adjustment.amount, currency) ?? 0),
    0,
  );
  const show = (minor: number) => formatMoney(minor, currency);

  const setLine = (index: number, change: Partial<Line>) =>
    setLines(lines.map((line, at) => (at === index ? { ...line, ...change } : line)));
  const setAdjustment = (index: number, change: Partial<Adjustment>) =>
    setAdjustments(
      adjustments.map((adjustment, at) => (at === index ? { ...adjustment, ...change } : adjustment)),
    );

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          name="number"
          label="Invoice number"
          placeholder="INV-2026-014"
          hint="As it is on the invoice you made."
          defaultValue={values.number}
          maxLength={60}
          required
        />
        <RecordPicker
          name="client"
          labelName="clientName"
          noun="client"
          plural="companies and people"
          initial={values.client ? { id: values.client, label: values.clientName } : null}
          search={searchClientsAction}
        />
        <TextField
          name="issueDate"
          label="Issued on"
          type="date"
          value={issueDate}
          onChange={(event) => {
            const next = event.currentTarget.value;
            setIssueDate(next);
            if (!dueSet && next) setDueDate(addDays(next, DEFAULT_TERMS_DAYS));
          }}
          required
        />
        <TextField
          name="dueDate"
          label="Due on"
          type="date"
          hint={`${DEFAULT_TERMS_DAYS} days after it was issued, unless you change it.`}
          value={dueDate}
          min={issueDate}
          onChange={(event) => {
            setDueDate(event.currentTarget.value);
            setDueSet(true);
          }}
          required
        />
        <SelectField
          name="currency"
          label="Currency"
          options={currencies.map((code) => ({ value: code, label: code }))}
          value={currency}
          onChange={(event) => setCurrency(event.currentTarget.value)}
        />
      </div>

      <fieldset className="grid gap-3">
        <legend className="mb-2 text-sm font-medium">Lines</legend>
        <div
          aria-hidden
          className="hidden gap-2 text-xs text-muted-foreground sm:grid sm:grid-cols-[minmax(0,1fr)_9rem_5rem_8rem_7rem_2rem]"
        >
          <span>Description</span>
          <span>Service</span>
          <span>Qty</span>
          <span>Price</span>
          <span className="text-right">Amount</span>
        </div>
        <datalist id="invoice-services">
          {categories.map((category) => (
            <option key={category} value={category} />
          ))}
        </datalist>
        <ol className="grid gap-3 sm:gap-2">
          {lines.map((line, index) => {
            const n = index + 1;
            return (
              <li
                key={index}
                className="grid grid-cols-[minmax(0,1fr)_5rem_minmax(0,1fr)_2rem] items-center gap-2 rounded-md border p-2 sm:grid-cols-[minmax(0,1fr)_9rem_5rem_8rem_7rem_2rem] sm:border-0 sm:p-0"
              >
                <Input
                  aria-label={`Line ${n} description`}
                  placeholder="Website design"
                  className="col-span-3 sm:col-span-1"
                  value={line.description}
                  maxLength={200}
                  onChange={(event) => setLine(index, { description: event.currentTarget.value })}
                />
                <Input
                  aria-label={`Line ${n} service`}
                  placeholder="Service"
                  list="invoice-services"
                  className="col-span-3 row-start-2 sm:col-span-1 sm:row-start-auto"
                  value={line.category}
                  maxLength={60}
                  onChange={(event) => setLine(index, { category: event.currentTarget.value })}
                />
                <Input
                  aria-label={`Line ${n} quantity`}
                  inputMode="decimal"
                  className="row-start-3 sm:row-start-auto"
                  value={line.quantity}
                  maxLength={20}
                  onChange={(event) => setLine(index, { quantity: event.currentTarget.value })}
                />
                <Input
                  aria-label={`Line ${n} price`}
                  inputMode="decimal"
                  placeholder="25000"
                  className="row-start-3 sm:row-start-auto"
                  value={line.unitPrice}
                  maxLength={30}
                  onChange={(event) => setLine(index, { unitPrice: event.currentTarget.value })}
                />
                <output
                  aria-label={`Line ${n} amount`}
                  className="col-span-2 row-start-4 text-right text-sm tabular-nums sm:col-span-1 sm:row-start-auto"
                >
                  {amounts[index] === null ? "—" : show(amounts[index])}
                </output>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="col-start-4 row-start-1 size-8 sm:col-start-auto sm:row-start-auto"
                  aria-label={`Remove line ${n}`}
                  disabled={lines.length === 1}
                  onClick={() => setLines(lines.filter((_, at) => at !== index))}
                >
                  <X aria-hidden />
                </Button>
              </li>
            );
          })}
        </ol>
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={lines.length >= MAX_INVOICE_LINES}
            onClick={() => setLines([...lines, EMPTY_LINE])}
          >
            <Plus aria-hidden />
            Add line
          </Button>
        </div>
      </fieldset>

      <fieldset className="grid gap-3">
        <legend className="mb-2 text-sm font-medium">Discounts and write-offs</legend>
        {adjustments.length > 0 && (
          <ol className="grid gap-2">
            {adjustments.map((adjustment, index) => {
              const n = index + 1;
              return (
                <li
                  key={index}
                  className="grid grid-cols-[minmax(0,1fr)_8rem_2rem] items-center gap-2"
                >
                  <Input
                    aria-label={`Adjustment ${n} reason`}
                    placeholder="Discount"
                    value={adjustment.reason}
                    maxLength={200}
                    onChange={(event) =>
                      setAdjustment(index, { reason: event.currentTarget.value })
                    }
                  />
                  <Input
                    aria-label={`Adjustment ${n} amount`}
                    inputMode="decimal"
                    placeholder="5000"
                    value={adjustment.amount}
                    maxLength={30}
                    onChange={(event) =>
                      setAdjustment(index, { amount: event.currentTarget.value })
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    aria-label={`Remove adjustment ${n}`}
                    onClick={() => setAdjustments(adjustments.filter((_, at) => at !== index))}
                  >
                    <X aria-hidden />
                  </Button>
                </li>
              );
            })}
          </ol>
        )}
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={adjustments.length >= MAX_INVOICE_ADJUSTMENTS}
            onClick={() => setAdjustments([...adjustments, { reason: "", amount: "" }])}
          >
            <Plus aria-hidden />
            Add discount or write-off
          </Button>
        </div>
      </fieldset>

      <dl className="grid justify-end gap-1 text-sm tabular-nums">
        <div className="flex justify-between gap-8">
          <dt className="text-muted-foreground">Lines</dt>
          <dd>{show(subtotal)}</dd>
        </div>
        {off > 0 && (
          <div className="flex justify-between gap-8">
            <dt className="text-muted-foreground">Discounts and write-offs</dt>
            <dd>−{show(off)}</dd>
          </div>
        )}
        <div className="flex justify-between gap-8 text-base font-semibold">
          <dt>Total</dt>
          <dd aria-label="Invoice total">{show(subtotal - off)}</dd>
        </div>
      </dl>

      <TextareaField
        name="notes"
        label="Notes"
        hint="Anything to remember about this invoice. Only you see it."
        defaultValue={values.notes}
        maxLength={2000}
      />

      <input type="hidden" name="lines" value={JSON.stringify(lines)} />
      <input type="hidden" name="adjustments" value={JSON.stringify(adjustments)} />
    </>
  );
}
