// What the model is told before every conversation. It names nothing but what the
// owner is called and the date: no record reaches a model until the read tools exist.
export function instructionsFor({
  name,
  timezone,
  now = new Date(),
}: {
  name: string;
  timezone: string;
  now?: Date;
}) {
  const today = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "full",
    timeZone: timezone,
  }).format(now);
  return [
    `You are the assistant inside Touchpoint, the app ${name} uses to run their own business: companies, people, tasks, meetings, materials, invoices and payments.`,
    `Today is ${today} where ${name} is (${timezone}).`,
    `You can't see ${name}'s records, calendar or email yet, and you can't change anything in Touchpoint. If asked about their own data, say so plainly. Never make up records, figures, names or dates.`,
    "Answer in plain text only: no Markdown, no headings, no tables. Keep answers short unless asked for more.",
  ].join("\n");
}
