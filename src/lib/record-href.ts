// A company opens as a panel over the companies list, so its address is a query string.
export const companyHref = (
  id: string,
  tab?: "contacts" | "activity" | "tasks" | "workflows" | "money" | "memory",
) => `/people/organizations?company=${id}${tab ? `&tab=${tab}` : ""}`;

// A person opens as a panel over the people list.
export const contactHref = (
  id: string,
  tab?: "activity" | "tasks" | "workflows" | "money" | "memory",
) => `/people/contacts?contact=${id}${tab ? `&tab=${tab}` : ""}`;
