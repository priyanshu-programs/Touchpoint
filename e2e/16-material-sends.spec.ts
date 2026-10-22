import { expect, test, type Page } from "@playwright/test";
import { OWNER_SESSION } from "./support";

test.describe.configure({ mode: "serial" });
test.use({ storageState: OWNER_SESSION });

const main = (page: Page) => page.getByRole("main");
const panel = (page: Page) => page.getByRole("dialog");
const companyTabs = (page: Page) =>
  page.getByRole("navigation", { name: "Company", exact: true });
const contactTabs = (page: Page) =>
  page.getByRole("navigation", { name: "Contact", exact: true });
const versions = (page: Page) =>
  main(page).getByRole("region", { name: "Versions" }).getByRole("listitem");
const ID = "[0-9a-f-]{36}";

const fits = (page: Page) =>
  page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  );

const panelFits = (page: Page) =>
  page
    .locator('[data-slot="sheet-content"]')
    .evaluate((sheet) => sheet.scrollWidth <= sheet.clientWidth);

let materialUrl = "";
let companyUrl = "";

// A material, a company and a person of this file's own, so earlier files' records stay as they were.
test("a send is logged from a person's Activity tab and shows on the person and the company", async ({
  page,
}) => {
  await page.goto("/materials/new");
  await page.getByLabel("Name").fill("Studio deck");
  await page.getByLabel("Type").selectOption("deck");
  await page.getByLabel("Link (optional)").fill("drive.example.com/deck");
  await page.getByRole("button", { name: "Create material" }).click();
  await expect(page).toHaveURL(new RegExp(`/materials/${ID}$`));
  materialUrl = page.url();
  // Sends are logged and read on the records they went to, not on the material.
  await expect(main(page).getByRole("region", { name: "Sends" })).toHaveCount(0);
  await expect(main(page).getByRole("link", { name: "Log a send" })).toHaveCount(0);

  await page.goto("/people/organizations");
  await page.getByRole("button", { name: "New company" }).click();
  const newCompany = page.getByRole("dialog", { name: "New company" });
  await newCompany.getByLabel("Name", { exact: true }).fill("Sendwell Studio");
  await newCompany.getByRole("button", { name: "Add company" }).click();
  await expect(panel(page).getByRole("heading", { name: "Sendwell Studio" })).toBeVisible();
  companyUrl = page.url();
  await companyTabs(page).getByRole("link", { name: "Contacts" }).click();
  await panel(page).getByRole("button", { name: "Add contact" }).click();
  const form = page.getByRole("form", { name: "Add contact" });
  await form.getByLabel("First name").fill("Tara");
  await form.getByLabel("Last name").fill("Sender");
  await form.getByRole("button", { name: "Add contact" }).click();

  await panel(page).getByRole("link", { name: "Tara Sender" }).click();
  await contactTabs(page).getByRole("link", { name: "Activity" }).click();
  await panel(page).getByRole("link", { name: "Log a send" }).click();
  await expect(page).toHaveURL(new RegExp(`contact=${ID}&tab=activity&send=new$`));
  await expect(panel(page).getByRole("heading", { name: "Log a send" })).toBeVisible();
  // The person and the company arrive filled in.
  await expect(
    panel(page).getByRole("button", { name: "Remove contact: Tara Sender" }),
  ).toBeVisible();
  await expect(panel(page).getByRole("button", { name: /company: Sendwell Studio/ })).toBeVisible();

  await panel(page).getByLabel("Material", { exact: true }).selectOption({ label: "Studio deck" });
  await expect(panel(page).getByLabel("Version")).toHaveValue(/.+/);
  await expect(panel(page).getByLabel("Version").locator("option")).toHaveText(["v1 (current)"]);
  await panel(page).getByLabel("How").selectOption("whatsapp");
  await panel(page).getByLabel("Note").fill("Shared in our chat");
  await panel(page).getByRole("button", { name: "Log send" }).click();

  // Back on Tara's Activity tab, inside the company's panel.
  await expect(page).toHaveURL(new RegExp(`company=${ID}&contact=${ID}&tab=activity$`));
  const entry = panel(page).getByRole("listitem").filter({ hasText: "Studio deck · v1" });
  await expect(entry).toContainText("Sent material");
  await expect(entry).toContainText("WhatsApp");
  await expect(entry).toContainText("Shared in our chat");
  await expect(entry.getByRole("link", { name: "Studio deck · v1" })).toHaveAttribute(
    "href",
    new URL(materialUrl).pathname,
  );

  // The status is changed where it is read.
  await entry.getByRole("button", { name: "Status: Sent" }).click();
  await page.getByRole("menuitemradio", { name: "Viewed" }).click();
  await expect(entry.getByRole("button", { name: "Status: Viewed" })).toBeVisible();

  // The company's own Activity tab shows it too.
  await page.goto(companyUrl);
  await companyTabs(page).getByRole("link", { name: "Activity" }).click();
  const onCompany = panel(page).getByRole("listitem").filter({ hasText: "Studio deck · v1" });
  await expect(onCompany.getByRole("button", { name: "Status: Viewed" })).toBeVisible();
  await expect(onCompany.getByRole("link", { name: "Tara Sender" })).toBeVisible();

  // The material keeps the version that went out: its label can change, what it holds cannot.
  await onCompany.getByRole("link", { name: "Studio deck · v1" }).click();
  await expect(page).toHaveURL(materialUrl);
  await expect(versions(page).first()).toContainText("sent once");
  await expect(versions(page).getByRole("button", { name: "Remove v1" })).toHaveCount(0);
  await versions(page).getByRole("button", { name: "Edit v1" }).click();
  const editing = page.getByRole("form", { name: "Edit v1" });
  await expect(editing).toContainText("Sent, so what it holds stays.");
  await expect(editing.getByLabel("Link")).toHaveCount(0);
  await expect(editing.getByLabel("File to upload")).toHaveCount(0);
  await editing.getByRole("button", { name: "Cancel" }).click();
});

test("a newer version sent to someone supersedes the older one, and a send is removed from the timeline", async ({
  page,
}) => {
  expect((await page.goto(`${materialUrl}/send`))?.status()).toBe(404);
  await page.goto(materialUrl);
  await main(page).getByRole("button", { name: "Add version" }).click();
  const adding = page.getByRole("form", { name: "Add a version" });
  await adding.getByLabel("Link").fill("https://drive.example.com/deck-v2");
  await adding.getByRole("button", { name: "Add link" }).click();
  await expect(versions(page)).toHaveCount(2);

  await page.goto(companyUrl);
  await companyTabs(page).getByRole("link", { name: "Activity" }).click();
  await panel(page).getByRole("link", { name: "Log a send" }).click();
  await panel(page).getByLabel("Material", { exact: true }).selectOption({ label: "Studio deck" });
  await expect(panel(page).getByLabel("Version").locator("option:checked")).toHaveText(
    "v2 (current)",
  );
  await panel(page).getByRole("button", { name: "Add contact" }).click();
  await page.getByPlaceholder("Search contacts…").fill("Tara Sender");
  await page.getByRole("option", { name: /Tara Sender/ }).click();
  await panel(page).getByLabel("How").selectOption("email");
  await panel(page).getByRole("button", { name: "Log send" }).click();

  await expect(page).toHaveURL(new RegExp(`company=${ID}&tab=activity$`));
  const newer = panel(page).getByRole("listitem").filter({ hasText: "Studio deck · v2" });
  const older = panel(page).getByRole("listitem").filter({ hasText: "Studio deck · v1" });
  await expect(newer.getByRole("button", { name: "Status: Sent" })).toBeVisible();
  await expect(older.getByRole("button", { name: "Status: Superseded" })).toBeVisible();

  // A send logged by mistake is removed where it shows, and its version can go again.
  await newer.getByRole("button", { name: /^Remove the send of Studio deck · v2/ }).click();
  await expect(newer).toHaveCount(0);
  await expect(older).toHaveCount(1);
  await page.goto(materialUrl);
  await expect(versions(page).getByRole("button", { name: "Remove v2" })).toBeVisible();
  await expect(versions(page).getByRole("button", { name: "Remove v1" })).toHaveCount(0);
});

test("a send with no one to go to is refused and keeps what was typed", async ({ page }) => {
  await page.goto(companyUrl);
  await companyTabs(page).getByRole("link", { name: "Activity" }).click();
  await panel(page).getByRole("link", { name: "Log a send" }).click();
  await expect(page).toHaveURL(new RegExp(`company=${ID}&tab=activity&send=new$`));
  await panel(page).getByLabel("Note").fill("Who was this for?");
  await panel(page).getByRole("button", { name: "Log send" }).click();
  await expect(panel(page).getByText("Choose who it went to")).toBeVisible();
  await expect(panel(page).getByLabel("Note")).toHaveValue("Who was this for?");
  await expect(panel(page).getByRole("button", { name: /company: Sendwell Studio/ })).toBeVisible();

  await panel(page).getByRole("link", { name: "Back to Sendwell Studio" }).click();
  await expect(page).toHaveURL(new RegExp(`company=${ID}&tab=activity$`));
});

test("sending fits a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(materialUrl);
  await expect(main(page)).toBeVisible();
  expect(await fits(page), "the material's page").toBe(true);
  await page.goto(`${companyUrl}&tab=activity&send=new`);
  await expect(panel(page).getByRole("button", { name: "Log send" })).toBeVisible();
  expect(await fits(page), "the send form in the panel").toBe(true);
  await expect.poll(() => panelFits(page), { message: "the send form" }).toBe(true);
  await page.goto(`${companyUrl}&tab=activity`);
  await expect(panel(page).getByRole("link", { name: "Log a send" })).toBeVisible();
  await expect(
    panel(page).getByRole("listitem").filter({ hasText: "Studio deck · v1" }),
  ).toBeVisible();
  expect(await fits(page), "a send on the timeline").toBe(true);
  // The panel eases in from the right and is wider than itself while it does.
  await expect.poll(() => panelFits(page), { message: "a send on the timeline" }).toBe(true);
});

test("deleting a material takes its sends off every timeline", async ({ page }) => {
  await page.goto(materialUrl);
  await main(page).getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toContainText("Its sends go with it");
  await confirm.getByRole("button", { name: "Delete material" }).click();
  await expect(page).toHaveURL(/\/materials$/);

  await page.goto(`${companyUrl}&tab=activity`);
  await expect(panel(page).getByText("Nothing logged yet.")).toBeVisible();
});
