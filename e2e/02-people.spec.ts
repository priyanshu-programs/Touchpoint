import { expect, test, type Page } from "@playwright/test";
import { OWNER_SESSION, recordAction } from "./support";

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
  await expect(page.getByRole("heading", { name: "Companies", level: 1 })).toBeVisible();
  // The form slides in at the side and asks for two things; Cancel puts it away.
  await page.getByRole("button", { name: "New company" }).click();
  const form = page.getByRole("dialog", { name: "New company" });
  await expect(form.getByRole("textbox")).toHaveCount(2);
  await form.getByRole("button", { name: "Cancel" }).click();
  await expect(form).toHaveCount(0);

  await page.getByRole("button", { name: "New company" }).click();
  await form.getByLabel("Name", { exact: true }).fill("Acme Design");
  // A reserved name, so the read that follows never reaches a real site.
  await form.getByLabel("Domain", { exact: true }).fill("www.acme.test/about");
  await form.getByRole("button", { name: "Add company" }).click();

  // The new company opens as a panel over the list, with its domain read from the website,
  // and the form it came from is gone.
  await expect(page).toHaveURL(/\/people\/organizations\?company=[0-9a-f-]+$/);
  await expect(panel(page).getByRole("heading", { name: "Acme Design" })).toBeVisible();
  await expect(form).toHaveCount(0);
  await expect(
    panel(page).getByRole("link", { name: "https://www.acme.test/about" }),
  ).toBeVisible();
  await expect(
    panel(page).getByText("acme.test", { exact: true }).first(),
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
  await page.getByLabel("Domain").fill("acme.test");
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

  await panel(page).getByRole("button", { name: "Add contact" }).click();
  const form = page.getByRole("form", { name: "Add contact" });
  await form.getByLabel("First name").fill("Priya");
  await form.getByLabel("Last name").fill("Sharma");
  await form.getByLabel("Job title").fill("Founder");
  await form.getByLabel("Email").fill("priya@acme.com");
  await form.getByLabel("Phone").fill("+91 98765 43210");
  await form.getByRole("button", { name: "Add contact" }).click();

  // The contact is listed in place, starred as the first one here, and the form is ready for the next.
  await expect(panel(page).getByText("Priya added.")).toBeVisible();
  const row = panel(page).getByRole("row", { name: /Priya Sharma/ });
  await expect(row.getByRole("link", { name: "Priya Sharma" })).toBeVisible();
  await expect(row.getByRole("cell", { name: "Founder" })).toBeVisible();
  await expect(row.getByRole("link", { name: "priya@acme.com" })).toBeVisible();
  await expect(
    row.getByRole("button", { name: "Primary contact: Priya Sharma" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    companyTabs(page).getByRole("link", { name: "Contacts" }),
  ).toContainText("1");
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

  // Contacts added inside a company are also under People, where a person opens in a panel too.
  await page.goto("/people/contacts");
  await expect(page.getByRole("link", { name: "Acme Design" })).toHaveCount(2);
  await page.getByRole("link", { name: "Priya Sharma", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Priya Sharma" })).toBeVisible();
  await expect(page.getByText("Founder at")).toBeVisible();
  // Once in Details and once in the list of addresses.
  await expect(page.getByRole("link", { name: "priya@acme.com" })).toHaveCount(2);
  await expect(page.getByText("Primary", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "+919876543210" })).toBeVisible();

  await recordAction(page, "Edit");
  await page.getByLabel("Tags").fill("vip");
  await page.getByRole("button", { name: "Save changes" }).click();
  // Saving returns to the person's panel over the list.
  await expect(page).toHaveURL(/\/people\/contacts\?contact=[0-9a-f-]+$/);
  await expect(panel(page).getByText("vip", { exact: true })).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test("the companies list sorts, filters and searches by domain", async ({
  page,
}) => {
  await page.goto("/people/organizations");
  await page.getByRole("button", { name: "New company" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Borealis Labs");
  await page.getByRole("button", { name: "Add company" }).click();
  await expect(
    panel(page).getByRole("heading", { name: "Borealis Labs" }),
  ).toBeVisible();
  await panel(page).getByRole("button", { name: "Close" }).click();
  // The panel slides away before the list is in reach again.
  await expect(panel(page)).toHaveCount(0);

  const names = page.getByRole("row").getByRole("link");
  await expect(names).toHaveText([
    "Company",
    "Domain",
    "Industry",
    "Contacts",
    "Last activity",
    "Acme Design",
    "Borealis Labs",
  ]);
  await expect(page.getByText("Showing 1–2 of 2")).toBeVisible();
  await page.getByRole("link", { name: "Contacts", exact: true }).click();
  await expect(page).toHaveURL(/sort=contacts&dir=desc/);
  await expect(names.nth(5)).toHaveText("Acme Design");
  await page.getByRole("link", { name: "Contacts", exact: true }).click();
  await expect(page).toHaveURL(/sort=contacts&dir=asc/);
  await expect(names.nth(5)).toHaveText("Borealis Labs");

  // The Sort menu orders by the same columns; a company with no domain comes last either way.
  const sortBy = async (column: string) => {
    await page.getByRole("button", { name: "Sort" }).click();
    await page.getByRole("menuitem", { name: column }).click();
  };
  await sortBy("Domain");
  await expect(page).toHaveURL(/sort=domain&dir=asc/);
  await expect(names.nth(5)).toHaveText("Acme Design");
  await sortBy("Domain");
  await expect(page).toHaveURL(/sort=domain&dir=desc/);
  await expect(names.nth(5)).toHaveText("Acme Design");

  // A search keeps the order it was given.
  await page.getByLabel("Search companies by name or domain").fill("acme.test");
  await page.getByLabel("Search companies by name or domain").press("Enter");
  await expect(page).toHaveURL(/q=acme\.test&sort=domain&dir=desc$/);
  await expect(page.getByRole("link", { name: "Acme Design" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Borealis Labs" })).toBeHidden();
  await expect(page.getByText("Showing 1–1 of 1")).toBeVisible();

  await page.goto("/people/organizations");
  const filters = page.getByRole("button", { name: "Filters" });
  await filters.click();
  await page.getByRole("menuitemradio", { name: "Client", exact: true }).click();
  await expect(page).toHaveURL(/status=client$/);
  await expect(page.getByText("No companies match these filters.")).toBeVisible();
  await expect(filters).toContainText("(1)");
  await filters.click();
  await page.getByRole("menuitemradio", { name: "All statuses" }).click();
  await expect(page).toHaveURL(/\/people\/organizations$/);
  await expect(page.getByRole("link", { name: "Acme Design" })).toBeVisible();
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
  await expect(
    page.getByRole("link", { name: "Acme Design" }).first(),
  ).toBeVisible();

  await page.goto("/people/contacts");
  const sharma = page.getByRole("link", { name: "Priya Sharma", exact: true });
  const sharmaa = page.getByRole("link", { name: "Priya Sharmaa" });
  const rao = page.getByRole("link", { name: "Arjun Rao" });
  await expect(rao).toBeVisible();

  await expect(page.getByRole("heading", { name: "People", level: 1 })).toBeVisible();
  await expect(page.getByText("Showing 1–3 of 3")).toBeVisible();
  await page.getByLabel("Search by name").fill("pri");
  await page.getByLabel("Search by name").press("Enter");
  await expect(sharma).toBeVisible();
  await expect(sharmaa).toBeVisible();
  await expect(rao).toBeHidden();
  await expect(page.getByText("Showing 1–2 of 2")).toBeVisible();

  // A filter narrows what the search found.
  await page.getByRole("button", { name: "Filters" }).click();
  await page.getByRole("menuitemradio", { name: "vip", exact: true }).click();
  await expect(page).toHaveURL(/q=pri&tag=[0-9a-f-]+$/);
  await expect(sharma).toBeVisible();
  await expect(sharmaa).toBeHidden();

  await page.goto("/people/contacts");
  await sharmaa.click();
  await recordAction(page, "Archive");
  await expect(panel(page).getByText("Archived", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "More actions" }).click();
  await expect(page.getByRole("menuitem", { name: "Restore" })).toBeVisible();

  await page.goto("/people/contacts");
  await expect(sharma).toBeVisible();
  await expect(sharmaa).toBeHidden();
  const archived = page.getByRole("button", { name: "Archived" });
  await expect(archived).toHaveAttribute("aria-pressed", "false");
  await archived.click();
  await expect(page).toHaveURL(/archived=1$/);
  await expect(archived).toHaveAttribute("aria-pressed", "true");
  await expect(sharmaa).toBeVisible();
  await expect(sharma).toBeHidden();
  await archived.click();
  await expect(page).toHaveURL(/\/people\/contacts$/);
  await expect(sharma).toBeVisible();
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
  await expect(page.getByText("priya.personal@example.com")).toHaveCount(0);
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
    await panel(page).getByRole("button", { name: "Add contact" }).click();
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
