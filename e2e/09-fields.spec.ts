import { expect, test, type Page } from "@playwright/test";
import { OWNER_SESSION, recordAction } from "./support";

test.describe.configure({ mode: "serial" });
test.use({ storageState: OWNER_SESSION });

const panel = (page: Page) => page.getByRole("dialog");
const details = (page: Page) =>
  panel(page).getByRole("region", { name: "Details" });
const fieldTabs = (page: Page) =>
  panel(page).getByRole("navigation", { name: "Fields" });
// The panel's parts fold away under their titles.
const section = (page: Page, name: string) =>
  panel(page).getByRole("group", { name });
const fields = (page: Page) =>
  section(page, "Standard fields").getByRole("listitem");
const ownFields = (page: Page) =>
  section(page, "Custom fields").getByRole("listitem");

const COMPANY_FIELDS = [
  "Name",
  "Domain",
  "Website",
  "Phone",
  "Email",
  "Industry",
  "City",
  "Region",
  "Country",
];

// Every change in the Fields panel is saved by a server action of its own.
const saved = (page: Page) =>
  page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      "next-action" in response.request().headers(),
  );

test("a company's fields are put in order and hidden from the gear on Details", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/people/organizations");
  await page.getByRole("cell", { name: "acme.test" }).click();
  await expect(details(page).locator("dt")).toHaveText(COMPANY_FIELDS);

  await details(page).getByRole("link", { name: "Fields" }).click();
  await expect(page).toHaveURL(/company=[0-9a-f-]+&fields=companies$/);
  await expect(
    panel(page).getByRole("heading", { name: "Fields", exact: true }),
  ).toBeVisible();
  await expect(
    fieldTabs(page).getByRole("link", { name: "Companies" }),
  ).toHaveAttribute("aria-current", "page");
  await expect(fields(page)).toHaveText(COMPANY_FIELDS);

  // The section says how many fields it holds, and folds away and back.
  const title = panel(page).getByText("Standard fields");
  await expect(
    panel(page).getByText("9 · reorder and hide only"),
  ).toBeVisible();
  await title.click();
  await expect(fields(page)).toHaveCount(0);
  await title.click();
  await expect(fields(page)).toHaveText(COMPANY_FIELDS);

  // With the keyboard: from its handle, Name goes down two places and back up one.
  const name = panel(page).getByRole("button", { name: "Move Name" });
  await name.focus();
  let save = saved(page);
  await page.keyboard.press("ArrowDown");
  await save;
  await expect(name).toBeFocused();
  await expect(
    panel(page).getByText("Name moved to place 2 of 9."),
  ).toBeAttached();
  save = saved(page);
  await page.keyboard.press("ArrowDown");
  await save;
  await expect(fields(page)).toHaveText([
    "Domain",
    "Website",
    "Name",
    ...COMPANY_FIELDS.slice(3),
  ]);
  save = saved(page);
  await page.keyboard.press("ArrowUp");
  await save;
  await expect(fields(page)).toHaveText(["Domain", "Name", ...COMPANY_FIELDS.slice(2)]);

  const domain = panel(page).getByRole("button", { name: "Show Domain" });
  await expect(domain).toHaveAttribute("aria-pressed", "true");
  save = saved(page);
  await domain.click();
  await save;
  await expect(domain).toHaveAttribute("aria-pressed", "false");

  // Back on the company, Domain is gone and the rest keeps its order.
  await panel(page).getByRole("link", { name: "Back to Acme Design" }).click();
  await expect(page).toHaveURL(/company=[0-9a-f-]+$/);
  await expect(details(page).locator("dt")).toHaveText([
    "Name",
    ...COMPANY_FIELDS.slice(2),
  ]);
  await page.reload();
  await expect(details(page).locator("dt")).toHaveText([
    "Name",
    ...COMPANY_FIELDS.slice(2),
  ]);

  // Shown again, and dragged with the mouse back above Domain.
  await details(page).getByRole("link", { name: "Fields" }).click();
  await expect(fields(page)).toHaveText(["Domain", "Name", ...COMPANY_FIELDS.slice(2)]);
  save = saved(page);
  await domain.click();
  await save;

  const from = (await name.boundingBox())!;
  const to = (await panel(page)
    .getByRole("button", { name: "Move Domain" })
    .boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  save = saved(page);
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2 - 4, {
    steps: 8,
  });
  await page.mouse.up();
  await save;
  await expect(fields(page)).toHaveText(COMPANY_FIELDS);

  await panel(page).getByRole("link", { name: "Back to Acme Design" }).click();
  await expect(details(page).locator("dt")).toHaveText(COMPANY_FIELDS);
  expect(consoleErrors).toEqual([]);
});

test("a person's fields are arranged apart from a company's", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/people/contacts?q=arj");
  await page
    .getByRole("row", { name: /Arjun Rao/ })
    .getByRole("cell", { name: "Prospect" })
    .click();
  await expect(details(page).getByText("Department", { exact: true })).toBeVisible();

  await details(page).getByRole("link", { name: "Fields" }).click();
  await expect(page).toHaveURL(/[?&]fields=contacts(&|$)/);
  await expect(
    fieldTabs(page).getByRole("link", { name: "Contacts" }),
  ).toHaveAttribute("aria-current", "page");
  await expect(fields(page).first()).toHaveText("First name");

  const department = panel(page).getByRole("button", { name: "Show Department" });
  const save = saved(page);
  await department.click();
  await save;
  await expect(department).toHaveAttribute("aria-pressed", "false");

  // The other tab is the company's list, left as the last test arranged it.
  await fieldTabs(page).getByRole("link", { name: "Companies" }).click();
  await expect(page).toHaveURL(/[?&]fields=companies(&|$)/);
  await expect(fields(page)).toHaveText(COMPANY_FIELDS);
  await expect(
    panel(page).getByRole("button", { name: "Show Domain" }),
  ).toHaveAttribute("aria-pressed", "true");

  await panel(page).getByRole("link", { name: "Back to Arjun Rao" }).click();
  await expect(panel(page).getByRole("heading", { name: "Arjun Rao" })).toBeVisible();
  await expect(details(page).getByText("First name", { exact: true })).toBeVisible();
  await expect(details(page).getByText("Department", { exact: true })).toHaveCount(0);
  expect(consoleErrors).toEqual([]);
});

test("a company gets fields of the owner's own: suggested, made, filled in, arranged, renamed and deleted", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  const openFields = () =>
    details(page).getByRole("link", { name: "Fields" }).click();
  const back = () =>
    panel(page).getByRole("link", { name: "Back to Acme Design" }).click();

  await page.goto("/people/organizations");
  await page.getByRole("cell", { name: "acme.test" }).click();
  await openFields();
  await expect(
    panel(page).getByRole("heading", { name: "No custom fields yet" }),
  ).toBeVisible();

  // A suggestion is one click, and is then no longer offered.
  await expect(panel(page).getByText("5 · one click to add")).toBeVisible();
  await panel(page).getByText("Suggested fields").click();
  await section(page, "Suggested fields")
    .getByRole("button", { name: "Add Segment" })
    .click();
  await expect(ownFields(page)).toHaveText([
    "Segment · Enterprise, Mid-Market, SMB",
  ]);
  await expect(panel(page).getByText("4 · one click to add")).toBeVisible();
  await expect(
    section(page, "Suggested fields").getByRole("button", { name: "Add Segment" }),
  ).toHaveCount(0);

  // A field of one's own: a name a standard field has is refused, and what was typed stays.
  await panel(page).getByRole("button", { name: "New field" }).click();
  const newField = page.getByRole("dialog", { name: "New field" });
  await newField.getByLabel("Name").fill("Phone");
  await newField.getByRole("button", { name: "Add field" }).click();
  await expect(newField.getByRole("alert")).toHaveText(
    "There is already a field called Phone.",
  );
  await expect(newField.getByLabel("Name")).toHaveValue("Phone");
  await newField.getByLabel("Name").fill("Renewal tier");
  await newField.getByLabel("Kind").selectOption("Dropdown");
  await newField.getByLabel("Options").fill("Gold\nSilver");
  await newField.getByRole("button", { name: "Add field" }).click();
  await expect(newField).toBeHidden();
  await expect(ownFields(page)).toHaveText([
    "Segment · Enterprise, Mid-Market, SMB",
    "Renewal tier · Gold, Silver",
  ]);

  // Details lists them after the standard fields, empty until filled in on Edit.
  await back();
  await expect(details(page).locator("dt")).toHaveText([
    ...COMPANY_FIELDS,
    "Segment",
    "Renewal tier",
  ]);
  await expect(details(page).locator("dd").nth(9)).toHaveText("—");
  await recordAction(page, "Edit");
  await page.getByLabel("Segment", { exact: true }).selectOption("Enterprise");
  await page.getByLabel("Renewal tier", { exact: true }).selectOption("Gold");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(details(page).locator("dd").nth(9)).toHaveText("Enterprise");
  await expect(details(page).locator("dd").nth(10)).toHaveText("Gold");

  // Arranged like the standard ones: Segment hidden, Renewal tier moved above it.
  await openFields();
  let save = saved(page);
  await panel(page).getByRole("button", { name: "Show Segment" }).click();
  await save;
  const tier = panel(page).getByRole("button", { name: "Move Renewal tier" });
  await tier.focus();
  save = saved(page);
  await page.keyboard.press("ArrowUp");
  await save;
  await expect(ownFields(page)).toHaveText([
    "Renewal tier · Gold, Silver",
    "Segment · Enterprise, Mid-Market, SMB",
  ]);
  await expect(fields(page)).toHaveText(COMPANY_FIELDS);

  // Renamed, with one more option; the value already chosen is kept.
  await panel(page)
    .getByRole("button", { name: "Actions for Renewal tier" })
    .click();
  await page.getByRole("menuitem", { name: "Edit" }).click();
  const editField = page.getByRole("dialog", { name: "Edit field" });
  await editField.getByLabel("Name").fill("Plan");
  await editField.getByLabel("More options").fill("Bronze");
  await editField.getByRole("button", { name: "Save field" }).click();
  await expect(editField).toBeHidden();
  await expect(ownFields(page).first()).toHaveText(
    "Plan · Gold, Silver, Bronze",
  );
  await back();
  await expect(details(page).locator("dt")).toHaveText([...COMPANY_FIELDS, "Plan"]);
  await expect(details(page).locator("dd").nth(9)).toHaveText("Gold");

  // Deleted only after confirming, and the value goes with it.
  await openFields();
  const remove = async () => {
    await panel(page).getByRole("button", { name: "Actions for Plan" }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
  };
  const confirm = page.getByRole("alertdialog", { name: "Delete Plan?" });
  await remove();
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await expect(confirm).toBeHidden();
  await expect(ownFields(page)).toHaveCount(2);
  await remove();
  await confirm.getByRole("button", { name: "Delete field" }).click();
  await expect(confirm).toBeHidden();
  await expect(ownFields(page)).toHaveText([
    "Segment · Enterprise, Mid-Market, SMB",
  ]);
  await back();
  await expect(details(page).locator("dt")).toHaveText(COMPANY_FIELDS);
  await page.reload();
  await expect(details(page).locator("dt")).toHaveText(COMPANY_FIELDS);
  expect(consoleErrors).toEqual([]);
});

test("a person's own fields are apart from a company's", async ({ page }) => {
  await page.goto("/people/contacts?q=arj");
  await page
    .getByRole("row", { name: /Arjun Rao/ })
    .getByRole("cell", { name: "Prospect" })
    .click();
  await details(page).getByRole("link", { name: "Fields" }).click();

  // Nothing is suggested for a person, and the company's Segment is not here.
  await expect(section(page, "Suggested fields")).toHaveCount(0);
  await expect(
    panel(page).getByRole("heading", { name: "No custom fields yet" }),
  ).toBeVisible();

  await panel(page).getByRole("button", { name: "New field" }).click();
  const newField = page.getByRole("dialog", { name: "New field" });
  await newField.getByLabel("Name").fill("Birthday");
  await newField.getByLabel("Kind").selectOption("Date");
  await expect(newField.getByLabel("Options")).toHaveCount(0);
  await newField.getByRole("button", { name: "Add field" }).click();
  await expect(ownFields(page)).toHaveText(["Birthday · Date"]);

  await panel(page).getByRole("link", { name: "Back to Arjun Rao" }).click();
  await recordAction(page, "Edit");
  await page.getByLabel("Birthday", { exact: true }).fill("1990-04-12");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(details(page).getByText("Thu, 12 Apr 1990")).toBeVisible();

  await details(page).getByRole("link", { name: "Fields" }).click();
  await fieldTabs(page).getByRole("link", { name: "Companies" }).click();
  await expect(ownFields(page)).toHaveText([
    "Segment · Enterprise, Mid-Market, SMB",
  ]);
});

test("a new company and person take the owner's own fields, and a dropdown's option is removed where it was chosen", async ({
  page,
}) => {
  await page.goto("/people/contacts/new");
  await page.getByLabel("First name").fill("Mira");
  await page.getByLabel("Last name").fill("Kapoor");
  await page.getByLabel("Birthday").fill("1985-01-02");
  await page.getByRole("button", { name: "Add contact" }).click();
  await expect(details(page).getByText("Wed, 2 Jan 1985")).toBeVisible();

  await page.goto("/people/organizations/new");
  await page.getByLabel("Name").fill("Fieldwork Co");
  await page.getByLabel("Segment").selectOption("SMB");
  await page.getByRole("button", { name: "Add company" }).click();
  await expect(panel(page).getByRole("heading", { name: "Fieldwork Co" })).toBeVisible();

  await details(page).getByRole("link", { name: "Fields" }).click();
  await panel(page).getByRole("button", { name: "Actions for Segment" }).click();
  await page.getByRole("menuitem", { name: "Edit" }).click();
  const editField = page.getByRole("dialog", { name: "Edit field" });
  const options = editField.getByRole("region", { name: "Options" });
  const option = (name: string) =>
    options.getByRole("listitem").filter({ hasText: name });
  await expect(option("Enterprise")).toContainText("1 company");
  await expect(option("Mid-Market")).not.toContainText("compan");

  // Asked first in the row, saying who loses the value; Keep it changes nothing.
  await editField.getByRole("button", { name: "Remove SMB" }).click();
  await expect(option("SMB")).toContainText(
    "Removing SMB also clears it from 1 company.",
  );
  await editField.getByRole("button", { name: "Keep it" }).click();
  await editField.getByRole("button", { name: "Remove SMB" }).click();
  await editField.getByRole("button", { name: "Remove SMB" }).click();
  await expect(option("SMB")).toHaveCount(0);
  await expect(options.getByRole("listitem")).toHaveCount(2);
  await editField.getByRole("button", { name: "Close" }).click();
  await expect(ownFields(page)).toHaveText(["Segment · Enterprise, Mid-Market"]);

  await panel(page).getByRole("link", { name: "Back to Fieldwork Co" }).click();
  await recordAction(page, "Edit");
  await expect(page.getByLabel("Segment", { exact: true })).toHaveValue("");
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the fields panel fits the screen", async ({ page }) => {
    await page.goto("/people/organizations");
    await page.getByRole("link", { name: "Acme Design" }).click();
    await details(page).getByRole("link", { name: "Fields" }).click();
    await expect(fields(page)).toHaveText(COMPANY_FIELDS);
    await panel(page).getByText("Suggested fields").click();
    await expect(
      panel(page).getByRole("button", { name: "Add Territory" }),
    ).toBeVisible();
    await expect(
      panel(page).getByRole("button", { name: "New field" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await expect(
      panel(page).getByRole("button", { name: "Show Country" }),
    ).toBeInViewport();
  });
});
