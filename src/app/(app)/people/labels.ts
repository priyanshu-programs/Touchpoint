import { companyHref, contactHref } from "@/lib/record-href";

const LABELS: Record<string, string> = {
  past_client: "Past client",
  do_not_contact: "Do not contact",
  linkedin: "LinkedIn",
  x: "X",
  github: "GitHub",
  whatsapp: "WhatsApp",
};

export function labelFor(value: string) {
  return LABELS[value] ?? value.charAt(0).toUpperCase() + value.slice(1);
}

// Kept in lib so the assistant's module can build the same addresses.
export { companyHref, contactHref };

// A contact at a company can also be shown inside that company's panel.
export const contactPanelHref = (organizationId: string, contactId: string) =>
  `${companyHref(organizationId)}&contact=${contactId}`;

// A tab of a person's panel: over the people list, or inside the company they were opened in.
export const contactTabHref = (
  id: string,
  tab: "activity" | "tasks" | "money",
  inside?: string,
) =>
  inside ? `${contactPanelHref(inside, id)}&tab=${tab}` : contactHref(id, tab);

// The Invoices tab of the panel an invoice or payment form was opened in, with one of
// them open in it, or null when the form was not opened from a panel or its client is
// not that panel's record.
export function moneyPanelHref(
  origin: { from: "" | "contact" | "organization"; inside: string },
  client: { organizationId?: string | null; contactId?: string | null },
  open: { invoice?: string; payment?: string } = {},
) {
  const base =
    origin.from === "organization" && client.organizationId
      ? companyHref(client.organizationId, "money")
      : origin.from === "contact" && client.contactId
        ? contactTabHref(client.contactId, "money", origin.inside || undefined)
        : null;
  if (!base) return null;
  if (open.invoice) return `${base}&invoice=${open.invoice}`;
  if (open.payment) return `${base}&payment=${open.payment}`;
  return base;
}

export const toOptions =(values: readonly string[]) =>
  values.map((value) => ({ value, label: labelFor(value) }));
