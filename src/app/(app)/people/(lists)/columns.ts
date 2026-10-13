// The columns each list can go without. The name is not among them: it is always shown.
export const COMPANY_COLUMNS = [
  { key: "status", label: "Status" },
  { key: "domain", label: "Domain" },
  { key: "industry", label: "Industry" },
  { key: "contacts", label: "Contacts" },
  { key: "activity", label: "Last activity" },
] as const;

export const CONTACT_COLUMNS = [
  { key: "company", label: "Company" },
  { key: "email", label: "Email" },
  { key: "relationship", label: "Relationship" },
] as const;

export const COLUMN_COOKIES = {
  companies: "columns-companies",
  contacts: "columns-contacts",
} as const;

// The cookie names the columns that are turned off, joined by dots. It is written in
// the browser, so only names of this list's own columns are taken from it.
export function hiddenColumns<Key extends string>(
  cookie: string | undefined,
  columns: readonly { key: Key }[],
) {
  const named = (cookie ?? "").split(".");
  return columns.map(({ key }) => key).filter((key) => named.includes(key));
}
