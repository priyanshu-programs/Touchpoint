import { expect, test, type Page } from "@playwright/test";
import { OWNER_SESSION, recordAction } from "./support";

test.describe.configure({ mode: "serial" });
test.use({ storageState: OWNER_SESSION });

// A person through quick add, with the follow-up task it makes. A look-alike name
// is added anyway, as a duplicate would be.
async function quickAdd(
  page: Page,
  person: { first: string; last: string; email: string },
  company: { name: string; domain: string } | { existing: string } | null,
) {
  await page.goto("/quick-add");
  await page.getByLabel("First name").fill(person.first);
  await page.getByLabel("Last name").fill(person.last);
  await page.getByLabel("Email").fill(person.email);
  if (!company) {
    await page.getByText("No company").click();
  } else if ("existing" in company) {
    await page.getByText("Existing company").click();
    await page.getByRole("button", { name: "Choose company" }).click();
    await page.getByPlaceholder("Search companies…").fill(company.existing);
    await page.getByRole("option", { name: new RegExp(company.existing) }).first().click();
  } else {
    await page.getByLabel("Company name").fill(company.name);
    await page.getByLabel("Domain").fill(company.domain);
  }
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const anyway = page.getByRole("button", { name: "Add anyway" });
  const panel = page.getByRole("dialog").getByRole("heading", {
    name: `${person.first} ${person.last}`,
  });
  await expect(anyway.or(panel)).toBeVisible();
  if (await anyway.isVisible()) await anyway.click();
  await expect(panel).toBeVisible();
  return /contact=([0-9a-f-]{36})/.exec(page.url())![1];
}

async function startMerge(page: Page, search: string, option: string) {
  await recordAction(page, "Merge with…");
  await page.getByPlaceholder("Search people…").fill(search);
  await page.getByRole("option", { name: new RegExp(option) }).first().click();
}

test("two people merged from the person's menu", async ({ page }) => {
  const kept = await quickAdd(
    page,
    { first: "Zara", last: "Mehta", email: "zara@mergeco.test" },
    { name: "Mergeco", domain: "mergeco.test" },
  );
  const other = await quickAdd(
    page,
    { first: "Zara", last: "Mehtaa", email: "zara.m@home.test" },
    null,
  );

  await page.goto(`/people/contacts?contact=${kept}`);
  await startMerge(page, "Zara Mehtaa", "Zara Mehtaa");
  await expect(page).toHaveURL(new RegExp(`contact=${kept}&merge=${other}$`));
  const panel = page.getByRole("dialog");
  await expect(
    panel.getByRole("heading", { name: "Merge Zara Mehtaa into Zara Mehta" }),
  ).toBeVisible();
  await expect(panel.getByText("Their place at Mergeco")).toHaveCount(0);
  await expect(panel.getByText("2 emails").or(panel.getByText("1 email"))).toBeVisible();

  await panel.getByRole("link", { name: "Swap" }).click();
  await expect(
    panel.getByRole("heading", { name: "Merge Zara Mehta into Zara Mehtaa" }),
  ).toBeVisible();
  await expect(panel.getByText("Their place at Mergeco")).toBeVisible();
  await panel.getByRole("link", { name: "Swap" }).click();
  await expect(
    panel.getByRole("heading", { name: "Merge Zara Mehtaa into Zara Mehta" }),
  ).toBeVisible();

  await expect(panel.getByRole("radio", { name: "Last name from Zara Mehta", exact: true })).toBeChecked();
  await panel.getByRole("radio", { name: "Last name from Zara Mehtaa", exact: true }).check();
  await panel.getByRole("button", { name: "Merge" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Merge" }).click();

  // A merge moves everything in one transaction, a slower answer than most forms.
  await expect(page).toHaveURL(new RegExp(`/people/contacts\\?contact=${kept}$`), {
    timeout: 15_000,
  });
  await expect(panel.getByRole("heading", { name: "Zara Mehtaa" })).toBeVisible();
  await expect(panel.getByText("zara@mergeco.test").first()).toBeVisible();
  await expect(panel.getByText("zara.m@home.test").first()).toBeVisible();

  await page.goto(`/people/contacts?contact=${kept}&tab=tasks`);
  await expect(panel.getByText("Follow up with Zara Mehta", { exact: true })).toBeVisible();
  await expect(panel.getByText("Follow up with Zara Mehtaa", { exact: true })).toBeVisible();

  await page.goto(`/people/contacts?contact=${other}`);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goto("/people/contacts?q=Zara");
  await expect(page.getByRole("link", { name: "Zara Mehtaa" })).toHaveCount(1);
});

test("a merge opened inside a company lands back there", async ({ page }) => {
  const kept = await quickAdd(
    page,
    { first: "Yusuf", last: "Ali", email: "yusuf@mergeco.test" },
    { existing: "Mergeco" },
  );
  // Quick add lands inside the company it put the person at.
  const companyId = /company=([0-9a-f-]{36})/.exec(page.url())![1];
  await quickAdd(page, { first: "Yusuf", last: "Alli", email: "yusuf@home.test" }, null);

  await page.goto(`/people/organizations?company=${companyId}&contact=${kept}`);
  await startMerge(page, "Yusuf Alli", "Yusuf Alli");
  await expect(
    page.getByRole("dialog").getByRole("heading", { name: "Merge Yusuf Alli into Yusuf Ali" }),
  ).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Merge" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Merge" }).click();

  await expect(page).toHaveURL(
    new RegExp(`/people/organizations\\?company=${companyId}&contact=${kept}$`),
    { timeout: 15_000 },
  );
  await expect(page.getByRole("dialog").getByText("yusuf@home.test").first()).toBeVisible();
});

test("on a phone, the merge view fits", async ({ page }) => {
  const kept = await quickAdd(
    page,
    { first: "Ines", last: "Faria", email: "ines@phone.test" },
    null,
  );
  const other = await quickAdd(
    page,
    { first: "Ines", last: "Fariah", email: "ines.f@phone.test" },
    null,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/people/contacts?contact=${kept}&merge=${other}`);
  await expect(page.getByRole("radio", { name: "Last name from Ines Fariah", exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
});

test("two companies merged from the company's menu", async ({ page }) => {
  await quickAdd(
    page,
    { first: "Kai", last: "Ono", email: "kai@ferncliff.test" },
    { name: "Ferncliff", domain: "ferncliff.test" },
  );
  const kept = /company=([0-9a-f-]{36})/.exec(page.url())![1];
  await quickAdd(
    page,
    { first: "Lea", last: "Moss", email: "lea@ferncliffltd.test" },
    { name: "Ferncliff Ltd", domain: "ferncliffltd.test" },
  );
  const other = /company=([0-9a-f-]{36})/.exec(page.url())![1];

  await page.goto(`/people/organizations?company=${kept}`);
  const panel = page.getByRole("dialog");
  await panel.getByRole("button", { name: "More actions" }).first().click();
  await page.getByRole("menuitem", { name: "Merge with…", exact: true }).click();
  await page.getByPlaceholder("Search companies…").fill("Ferncliff Ltd");
  await page.getByRole("option", { name: /Ferncliff Ltd/ }).first().click();
  await expect(page).toHaveURL(new RegExp(`company=${kept}&merge=${other}$`));
  await expect(
    panel.getByRole("heading", { name: "Merge Ferncliff Ltd into Ferncliff" }),
  ).toBeVisible();
  await expect(panel.getByText("1 person", { exact: true })).toBeVisible();

  await panel.getByRole("link", { name: "Swap" }).click();
  await expect(
    panel.getByRole("heading", { name: "Merge Ferncliff into Ferncliff Ltd" }),
  ).toBeVisible();
  await panel.getByRole("link", { name: "Swap" }).click();
  await expect(
    panel.getByRole("heading", { name: "Merge Ferncliff Ltd into Ferncliff" }),
  ).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(panel.getByRole("radio", { name: "Name from Ferncliff Ltd", exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 1280, height: 800 });

  // Each new company's website read runs just after quick add; a merge waits for it.
  const merge = panel.getByRole("button", { name: "Merge" });
  await expect(async () => {
    await page.reload();
    await expect(merge).toBeEnabled({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });

  await panel.getByRole("radio", { name: "Name from Ferncliff Ltd", exact: true }).check();
  await merge.click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Merge" }).click();

  await expect(page).toHaveURL(new RegExp(`/people/organizations\\?company=${kept}$`), {
    timeout: 15_000,
  });
  await expect(panel.getByRole("heading", { name: "Ferncliff Ltd" })).toBeVisible();

  await page.goto(`/people/organizations?company=${kept}&tab=contacts`);
  await expect(panel.getByText("Kai Ono").first()).toBeVisible();
  await expect(panel.getByText("Lea Moss").first()).toBeVisible();
  await page.goto(`/people/organizations?company=${kept}&tab=tasks`);
  await expect(panel.getByText("Follow up with Kai Ono", { exact: true })).toBeVisible();
  await expect(panel.getByText("Follow up with Lea Moss", { exact: true })).toBeVisible();

  await page.goto(`/people/organizations?company=${other}`);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
