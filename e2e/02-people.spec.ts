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
  await page.getByRole("link", { name: "Add company" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Acme Design");
  await page.getByLabel("Domain").fill("https://www.acme.com/about");
  await page.getByLabel("Tags").fill("design, vip");
  await page.getByRole("button", { name: "Add company" }).click();

  await expect(page.getByRole("heading", { name: "Acme Design" })).toBeVisible();
  await expect(page.getByText("acme.com", { exact: true })).toBeVisible();

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

test("add a contact from its company; duplicates are caught", async ({
  page,
}) => {
  const consoleErrors = collectConsoleErrors(page);

  await page.goto("/people/organizations");
  await page.getByRole("link", { name: "Acme Design" }).click();
  await page.getByRole("link", { name: "Add contact" }).click();
  await expect(
    page.getByRole("button", { name: /company: Acme Design/ }),
  ).toBeVisible();

  await page.getByLabel("First name").fill("Priya");
  await page.getByLabel("Last name").fill("Sharma");
  await page.getByLabel("Email", { exact: true }).fill("priya@acme.com");
  await page.getByLabel("Phone").fill("+91 98765 43210");
  await page.getByLabel("Job title").fill("Founder");
  await page.getByLabel("Tags").fill("vip");
  await page.getByRole("button", { name: "Add contact" }).click();

  await expect(page.getByRole("heading", { name: "Priya Sharma" })).toBeVisible();
  await expect(page.getByText("Founder at")).toBeVisible();
  await expect(page.getByRole("link", { name: "priya@acme.com" })).toBeVisible();
  await expect(page.getByText("Primary", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "+919876543210" })).toBeVisible();

  await page.goto("/people/contacts/new");
  await page.getByLabel("First name").fill("Someone");
  await page.getByLabel("Email", { exact: true }).fill("PRIYA@acme.com");
  await page.getByRole("button", { name: "Add contact" }).click();
  await expect(
    page.getByText("That email already belongs to Priya Sharma."),
  ).toBeVisible();

  await page.getByLabel("First name").fill("Priya");
  await page.getByLabel("Last name").fill("Sharmaa");
  await page.getByLabel("Email", { exact: true }).fill("");
  await page.getByRole("button", { name: "Add contact" }).click();
  await expect(
    page.getByText("A contact with a similar name already exists."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Create anyway" }).click();
  await expect(
    page.getByRole("heading", { name: "Priya Sharmaa" }),
  ).toBeVisible();
  expect(consoleErrors).toEqual([]);
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
    await page.goto("/people/contacts");
    await page.getByRole("link", { name: "Priya Sharma", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Priya Sharma" })).toBeVisible();
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflows).toBe(false);
  });
});
