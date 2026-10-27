import type { DateRange } from "@/modules/revenue/period";
import type { Client } from "@/modules/revenue/queries";
import { invoicesHref } from "./invoices/labels";
import { paymentsHref } from "./payments/labels";

// A client as the lists and the overview name them in their address.
export const clientParams = (client?: Client): { company?: string; person?: string } =>
  !client
    ? {}
    : "organizationId" in client
      ? { company: client.organizationId }
      : { person: client.contactId };

// Where each figure on the overview and Today leads: the list holding exactly the rows
// it adds up.
export function figureLinks(range: DateRange, client?: Client) {
  const who = clientParams(client);
  return {
    received: (currency?: string) => paymentsHref({ ...range, ...who, currency }),
    invoiced: (currency: string) =>
      invoicesHref({ status: "issued", ...range, ...who, currency }),
    outstanding: (currency: string) => invoicesHref({ status: "outstanding", ...who, currency }),
    overdue: (currency: string) => invoicesHref({ status: "overdue", ...who, currency }),
  };
}
