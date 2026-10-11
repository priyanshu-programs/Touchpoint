import { expect, test, type Page } from "@playwright/test";
import { OWNER_SESSION } from "./support";

test.describe.configure({ mode: "serial" });
test.use({ storageState: OWNER_SESSION });

// A CSP violation or a React error would surface as a console error.
function collectConsoleErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

// A company opens in a side panel; while it is open the list behind it is inert.
const panel = (page: Page) => page.getByRole("dialog");
const companyTabs = (page: Page) =>
  page.getByRole("navigation", { name: "Company", exact: true });

test("add a company; a second one on the same domain is refused", async ({
  page,
}) => {
  const consoleErrors = collectConsoleErrors(page);

  await page.goto("/");
  await page
    .getByRole("navigation", { name: "Main" })
    .first()
    .getByRole("link", { name: "Companies" })
    .click();
  await expect(page).toHaveURL(/\/people\/organizations$/);
  await expect(page.getByText("No companies yet")).toBeVisible();

  const tabs = page.getByRole("navigation", { name: "Companies and people" });
  await tabs.getByRole("link", { name: "People" }).click();
  await expect(page).toHaveURL(/\/people\/contacts$/);
  await expect(page.getByText("No contacts yet")).toBeVisible();

  await tabs.getByRole("link", { name: "Companies" }).click();
  await page.getByRole("button", { name: "New company" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Acme Design");
  await page.getByLabel("Website").fill("www.acme.com/about");
  await page.getByRole("button", { name: "Create company" }).click();

  // The new company opens as a panel over the list, with its domain read from the website.
  await expect(page).toHaveURL(/\/people\/organizations\?company=[0-9a-f-]+$/);
  await expect(panel(page).getByRole("heading", { name: "Acme Design" })).toBeVisible();
  await expect(
    panel(page).getByRole("link", { name: "https://www.acme.com/about" }),
  ).toBeVisible();
  await expect(
    panel(page).getByText("acme.com", { exact: true }).first(),
  ).toBeVisible();

  // An address from before the panel existed still lands on it.
  const id = new URL(page.url()).searchParams.get("company");
  await page.goto(`/people/organizations/${id}`);
  await expect(page).toHaveURL(new RegExp(`\\?company=${id}$`));
  await panel(page).getByRole("button", { name: "Close" }).click();
  await expect(page).toHaveURL(/\/people\/organizations$/);
  await expect(page.getByRole("link", { name: "Acme Design" })).toBeVisible();

  await page.goto("/people/organizations/new");
  await page.getByLabel("Name", { exact: true }).fill("Entirely Different");
  await page.getByLabel("Status").selectOption("client");
  await page.getByLabel("Domain").fill("acme.com");
  await page.getByRole("button", { name: "Add company" }).click();

  await expect(
    page.getByText("That domain already belongs to Acme Design."),
  ).toBeVisible();
  // A rejected form keeps what was typed, including select fields.
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue(
    "Entirely Different",
  );
  await expect(page.getByLabel("Status")).toHaveValue("client");
  expect(consoleErrors).toEqual([]);
});

test("add contacts inside a company; duplicates are caught", async ({
  page,
}) => {
  const consoleErrors = collectConsoleErrors(page);

  await page.goto("/people/organizations");
  await page.getByRole("link", { name: "Acme Design" }).click();
  await companyTabs(page).getByRole("link", { name: "Contacts" }).click();
  await expect(page.getByText("No contacts at this company yet.")).toBeVisible();

  const form = page.getByRole("form", { name: "Add contact" });
  await form.getByLabel("First name").fill("Priya");
  await form.getByLabel("Last name").fill("Sharma");
  await form.getByLabel("Job title").fill("Founder");
  await form.getByLabel("Email").fill("priya@acme.com");
  await form.getByLabel("Phone").fill("+91 98765 43210");
  await form.getByRole("button", { name: "Add contact" }).click();

  // The contact is listed in the panel and the form is ready for the next one.
  await expect(
    panel(page).getByRole("link", { name: "Priya Sharma" }),
  ).toBeVisible();
  await expect(panel(page).getByText("Founder · priya@acme.com")).toBeVisible();
  await expect(form.getByLabel("First name")).toHaveValue("");

  await form.getByLabel("First name").fill("Someone");
  await form.getByLabel("Email").fill("PRIYA@acme.com");
  await form.getByRole("button", { name: "Add contact" }).click();
  await expect(
    page.getByText("That email already belongs to Priya Sharma."),
  ).toBeVisible();

  await form.getByLabel("First name").fill("Priya");
  await form.getByLabel("Last name").fill("Sharmaa");
  await form.getByLabel("Email").fill("");
  await form.getByRole("button", { name: "Add contact" }).click();
  await expect(
    page.getByText("A contact with a similar name already exists."),
  ).toBeVisible();
  await form.getByRole("button", { name: "Create anyway" }).click();
  await expect(
    panel(page).getByRole("link", { name: "Priya Sharmaa" }),
  ).toBeVisible();

  // Contacts added inside a company are also under People, linked back to it.
  await page.goto("/people/contacts");
  await expect(page.getByRole("link", { name: "Acme Design" })).toHaveCount(2);
  await page.getByRole("link", { name: "Priya Sharma", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Priya Sharma" })).toBeVisible();
  await expect(page.getByText("Founder at")).toBeVisible();
  await expect(page.getByRole("link", { name: "priya@acme.com" })).toBeVisible();
  await expect(page.getByText("Primary", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "+919876543210" })).toBeVisible();

  await page.getByRole("link", { name: "Edit" }).click();
  await page.getByLabel("Tags").fill("vip");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("vip", { exact: true })).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test("the companies list sorts, filters and searches by domain", async ({
  page,
}) => {
  await page.goto("/people/organizations");
  await page.getByRole("button", { name: "New company" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Borealis Labs");
  await page.getByRole("button", { name: "Create company" }).click();
  await expect(
    panel(page).getByRole("heading", { name: "Borealis Labs" }),
  ).toBeVisible();
  await panel(page).getByRole("button", { name: "Close" }).click();

  const names = page.getByRole("row").getByRole("link");
  await expect(names).toHaveText(["Company", "Contacts", "Last activity", "Acme Design", "Borealis Labs"]);
  await page.getByRole("link", { name: "Contacts", exact: true }).click();
  await expect(page).toHaveURL(/sort=contacts&dir=desc/);
  await expect(names.nth(3)).toHaveText("Acme Design");
  await page.getByRole("link", { name: "Contacts", exact: true }).click();
  await expect(page).toHaveURL(/sort=contacts&dir=asc/);
  await expect(names.nth(3)).toHaveText("Borealis Labs");

  await page.getByLabel("Search companies by name or domain").fill("acme.com");
  await page.getByRole("button", { name: "Filter" }).click();
  await expect(page.getByRole("link", { name: "Acme Design" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Borealis Labs" })).toBeHidden();

  await page.goto("/people/organizations");
  await page.getByLabel("Status").selectOption("client");
  await page.getByRole("button", { name: "Filter" }).click();
  await expect(page.getByText("No companies match these filters.")).toBeVisible();
});

test("pick a company, then filter and archive contacts", async ({
  page,
}) => {
  await page.goto("/people/contacts/new");
  await page.getByLabel("First name").fill("Arjun");
  await page.getByLabel("Last name").fill("Rao");
  await page.getByRole("button", { name: "Choose company" }).click();
  await page.getByPlaceholder("Search companies…").fill("acm");
  await page.getByRole("option", { name: /Acme Design/ }).click();
  await page.getByRole("button", { name: "Add contact" }).click();
  await expect(page.getByRole("heading", { name: "Arjun Rao" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Acme Design" })).toBeVisible();

  await page.goto("/people/contacts");
  const sharma = page.getByRole("link", { name: "Priya Sharma", exact: true });
  const sharmaa = page.getByRole("link", { name: "Priya Sharmaa" });
  const rao = page.getByRole("link", { name: "Arjun Rao" });
  await expect(rao).toBeVisible();

  await page.getByLabel("Search by name").fill("pri");
  await page.getByRole("button", { name: "Filter" }).click();
  await expect(sharma).toBeVisible();
  await expect(sharmaa).toBeVisible();
  await expect(rao).toBeHidden();

  await page.getByLabel("Tag").selectOption({ label: "vip" });
  await page.getByRole("button", { name: "Filter" }).click();
  await expect(sharma).toBeVisible();
  await expect(sharmaa).toBeHidden();

  await page.goto("/people/contacts");
  await sharmaa.click();
  await page.getByRole("button", { name: "Archive" }).click();
  await expect(page.getByRole("button", { name: "Restore" })).toBeVisible();

  await page.goto("/people/contacts");
  await expect(sharma).toBeVisible();
  await expect(sharmaa).toBeHidden();
  await page.getByLabel("Archived").check();
  await page.getByRole("button", { name: "Filter" }).click();
  await expect(sharmaa).toBeVisible();
  await expect(sharma).toBeHidden();
});

test("manage a contact's emails and links", async ({ page }) => {
  await page.goto("/people/contacts");
  await page.getByRole("link", { name: "Priya Sharma", exact: true }).click();

  await page.getByLabel("New link").fill("javascript:alert(1)");
  await page.getByRole("button", { name: "Add link" }).click();
  await expect(
    page.getByText("Enter a link that starts with http:// or https://"),
  ).toBeVisible();

  await page.getByLabel("Link type").selectOption("linkedin");
  await page.getByLabel("New link").fill("https://www.linkedin.com/in/priya");
  await page.getByRole("button", { name: "Add link" }).click();
  await expect(
    page.getByRole("link", { name: "https://www.linkedin.com/in/priya" }),
  ).toBeVisible();

  await page.getByLabel("New email").fill("priya.personal@example.com");
  await page.getByLabel("Email label").fill("personal");
  await page.getByRole("button", { name: "Add email" }).click();
  await expect(page.getByText("Email added.")).toBeVisible();

  await page.getByRole("button", { name: "Make primary" }).click();
  await expect(page.getByRole("button", { name: "Make primary" })).toHaveCount(1);
  const emails = page.getByRole("listitem").filter({ hasText: "@" });
  await expect(emails.first()).toContainText("priya.personal@example.com");
  await expect(emails.first()).toContainText("Primary");

  await page
    .getByRole("button", { name: "Remove priya.personal@example.com" })
    .click();
  await expect(page.getByText("priya.personal@example.com")).toBeHidden();
  await expect(emails.first()).toContainText("priya@acme.com");
  await expect(emails.first()).toContainText("Primary");
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("people screens fit the screen", async ({ page }) => {
    for (const path of [
      "/people/contacts",
      "/people/organizations",
      "/people/contacts/new",
    ]) {
      await page.goto(path);
      await expect(page.getByRole("main")).toBeVisible();
      const overflows = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      expect(overflows, path).toBe(false);
    }
    await page.goto("/people/organizations");
    await page.getByRole("link", { name: "Acme Design" }).click();
    await companyTabs(page).getByRole("link", { name: "Contacts" }).click();
    await expect(page.getByRole("form", { name: "Add contact" })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
      "company panel",
    ).toBe(false);

    await page.goto("/people/contacts");
    await page.getByRole("link", { name: "Priya Sharma", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Priya Sharma" })).toBeVisible();
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflows).toBe(false);
  });
});
