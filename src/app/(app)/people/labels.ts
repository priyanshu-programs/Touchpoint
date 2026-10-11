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

// A company opens as a panel over the companies list, so its address is a query string.
export const companyHref = (
  id: string,
  tab?: "contacts" | "activity" | "tasks",
) => `/people/organizations?company=${id}${tab ? `&tab=${tab}` : ""}`;

// A person opens as a panel over the people list.
export const contactHref = (id: string, tab?: "activity" | "tasks") =>
  `/people/contacts?contact=${id}${tab ? `&tab=${tab}` : ""}`;

// A contact at a company can also be shown inside that company's panel.
export const contactPanelHref = (organizationId: string, contactId: string) =>
  `${companyHref(organizationId)}&contact=${contactId}`;

export const toOptions =(values: readonly string[]) =>
  values.map((value) => ({ value, label: labelFor(value) }));
