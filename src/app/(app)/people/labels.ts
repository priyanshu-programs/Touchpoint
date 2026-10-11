const LABELS: Record<string, string> = {
  past_client: "Past client",
  do_not_contact: "Do not contact",
  linkedin: "LinkedIn",
  x: "X",
  whatsapp: "WhatsApp",
};

export function labelFor(value: string) {
  return LABELS[value] ?? value.charAt(0).toUpperCase() + value.slice(1);
}

export const toOptions = (values: readonly string[]) =>
  values.map((value) => ({ value, label: labelFor(value) }));
