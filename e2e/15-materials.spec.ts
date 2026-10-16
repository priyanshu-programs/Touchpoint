import { expect, test, type Page } from "@playwright/test";
import { OWNER_SESSION } from "./support";

test.describe.configure({ mode: "serial" });
test.use({ storageState: OWNER_SESSION });

const main = (page: Page) => page.getByRole("main");
const versions = (page: Page) =>
  main(page).getByRole("region", { name: "Versions" }).getByRole("listitem");
const adding = (page: Page) => page.getByRole("form", { name: "Add a version" });
const ID = "[0-9a-f-]{36}";

const fits = (page: Page) =>
  page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  );

const proposal = {
  name: "Rate card 2027.pdf",
  mimeType: "application/pdf",
  buffer: Buffer.from("%PDF-1.4\nrates\n%%EOF\n"),
};

let materialUrl = "";

test("a material is made from the sidebar with a link as its first version", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Materials" })
    .click();
  await expect(page).toHaveURL(/\/materials$/);
  await expect(page.getByText("No materials yet.")).toBeVisible();
  await main(page).getByRole("link", { name: "New material" }).click();
  await expect(page).toHaveURL(/\/materials\/new$/);

  // Nothing but a web address is kept, and the form keeps what was typed.
  await page.getByLabel("Name").fill("Rate card");
  await page.getByLabel("Type").selectOption("quote");
  await page.getByLabel("Description").fill("Day rates, sent with every quote.");
  await page.getByLabel("Link (optional)").fill("javascript:alert(1)");
  await page.getByRole("button", { name: "Create material" }).click();
  await expect(
    page.getByText("Enter a link that starts with http:// or https://"),
  ).toBeVisible();
  await expect(page.getByLabel("Name")).toHaveValue("Rate card");
  await expect(page.getByLabel("Type")).toHaveValue("quote");

  // An address typed without its start is a web address.
  await page.getByLabel("Link (optional)").fill("drive.example.com/rates");
  await page.getByRole("button", { name: "Create material" }).click();
  await expect(page).toHaveURL(new RegExp(`/materials/${ID}$`));
  materialUrl = page.url();

  await expect(main(page).getByRole("heading", { name: "Rate card", level: 1 })).toBeVisible();
  await expect(main(page).getByText("Quote", { exact: true })).toBeVisible();
  await expect(main(page).getByText("Day rates, sent with every quote.")).toBeVisible();
  await expect(versions(page)).toHaveCount(1);
  const first = versions(page).getByRole("link", { name: "v1" });
  await expect(first).toHaveAttribute("href", "https://drive.example.com/rates");
  await expect(first).toHaveAttribute("target", "_blank");
  await expect(first).toHaveAttribute("rel", "noopener noreferrer");
  await expect(versions(page).first()).toContainText("Current");
  await expect(versions(page).first()).toContainText("drive.example.com");

  // A second material by the same name, in another case, is refused.
  await page.goto("/materials/new");
  await page.getByLabel("Name").fill("RATE CARD");
  await page.getByRole("button", { name: "Create material" }).click();
  await expect(
    page.getByText("You already have a material with that name. Choose another."),
  ).toBeVisible();
});

test("a file is uploaded as a new version and served to its owner only", async ({
  page,
  baseURL,
  browser,
}) => {
  await page.goto(materialUrl);
  await main(page).getByRole("button", { name: "Add version" }).click();
  await expect(adding(page).getByLabel("Label")).toHaveValue("v2");
  await adding(page).getByLabel("File to upload").setInputFiles(proposal);
  await expect(adding(page)).toHaveCount(0);
  await expect(versions(page)).toHaveCount(2);
  await expect(versions(page).first()).toContainText("Current");
  await expect(versions(page).first()).toContainText("Rate card 2027.pdf · 1 KB");
  await expect(versions(page).nth(1)).not.toContainText("Current");

  const file = versions(page).getByRole("link", { name: "v2" });
  const address = (await file.getAttribute("href"))!;
  expect(address).toMatch(new RegExp(`^/api/materials/${ID}/versions/${ID}$`));
  const fetched = await page.request.get(address);
  expect(fetched.status()).toBe(200);
  expect(fetched.headers()["content-type"]).toBe("application/pdf");
  expect(fetched.headers()["content-disposition"]).toBe(
    "inline; filename*=UTF-8''Rate%20card%202027.pdf",
  );
  expect(fetched.headers()["x-content-type-options"]).toBe("nosniff");
  expect(fetched.headers()["cache-control"]).toBe("private, no-store");
  expect((await fetched.body()).equals(proposal.buffer)).toBe(true);
  const stranger = await browser.newContext({ storageState: undefined });
  expect((await stranger.request.get(`${baseURL}${address}`)).status()).toBe(401);
  // An upload is taken only from this app.
  const sent = await page.request.post(
    address.replace(/\/versions\/.*$/, "/versions"),
    {
      headers: { origin: "https://elsewhere.example" },
      multipart: { label: "v9", file: proposal },
    },
  );
  expect(sent.status()).toBe(403);
  await stranger.close();

  // A file is what its bytes say it is, whatever it is called, and has a size
  // it may not pass. Neither is kept.
  await main(page).getByRole("button", { name: "Add version" }).click();
  await adding(page)
    .getByLabel("File to upload")
    .setInputFiles({ ...proposal, name: "notes.pdf", buffer: Buffer.from("only text") });
  await expect(main(page).getByRole("alert")).toContainText(
    "Only PDFs, pictures and Word, Excel and PowerPoint files are kept.",
  );
  await adding(page)
    .getByLabel("File to upload")
    .setInputFiles({
      ...proposal,
      buffer: Buffer.concat([proposal.buffer, Buffer.alloc(4 * 1024 * 1024)]),
    });
  await expect(main(page).getByRole("alert")).toHaveText(
    "That file is larger than 4 MB. Add it as a link instead.",
  );
  await adding(page).getByRole("button", { name: "Cancel" }).click();
  await expect(versions(page)).toHaveCount(2);
});

test("a material is edited and a version removed", async ({ page }) => {
  await page.goto(materialUrl);
  await main(page).getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Edit" }).click();
  await expect(page).toHaveURL(/\/edit$/);
  await expect(page.getByLabel("Link (optional)")).toHaveCount(0);
  await page.getByLabel("Name").fill("Rate card 2027");
  await page.getByLabel("Type").selectOption("proposal");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page).toHaveURL(materialUrl);
  await expect(
    main(page).getByRole("heading", { name: "Rate card 2027", level: 1 }),
  ).toBeVisible();
  await expect(main(page).getByText("Proposal", { exact: true })).toBeVisible();

  await versions(page).getByRole("button", { name: "Remove v2" }).click();
  await expect(versions(page)).toHaveCount(1);
  await expect(versions(page).first()).toContainText("v1");
  await expect(versions(page).first()).toContainText("Current");

  // A link added by hand goes on top.
  await main(page).getByRole("button", { name: "Add version" }).click();
  await adding(page).getByLabel("Label").fill("Jan prices");
  await adding(page).getByLabel("Link").fill("https://drive.example.com/rates-jan");
  await adding(page).getByRole("button", { name: "Add link" }).click();
  await expect(versions(page)).toHaveCount(2);
  await expect(versions(page).first()).toContainText("Jan prices");
});

test("the list is searched, narrowed by type and opened from a row", async ({ page }) => {
  await page.goto("/materials/new");
  await page.getByLabel("Name").fill("Agency deck");
  await page.getByLabel("Type").selectOption("deck");
  await page.getByRole("button", { name: "Create material" }).click();
  await expect(page).toHaveURL(new RegExp(`/materials/${ID}$`));

  await page.goto("/materials");
  const table = main(page).getByRole("table");
  // The column names are links too; the materials are in the body.
  const names = table.locator("tbody").getByRole("link");
  await expect(names).toHaveText(["Agency deck", "Rate card 2027"]);
  await expect(table.getByRole("row", { name: /Rate card 2027/ })).toContainText(
    "Jan prices",
  );
  await expect(page.getByText("Showing 1–2 of 2")).toBeVisible();

  await page.getByRole("searchbox", { name: "Search materials by name" }).fill("rate");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/q=rate/);
  await expect(names).toHaveText(["Rate card 2027"]);

  await page.goto("/materials");
  await main(page).getByRole("button", { name: /^Filters/ }).click();
  await page.getByRole("menuitemradio", { name: "Deck" }).click();
  await expect(page).toHaveURL(/type=deck/);
  await expect(names).toHaveText(["Agency deck"]);

  await page.goto("/materials?type=contract");
  await expect(page.getByText("No materials match these filters.")).toBeVisible();

  await page.goto("/materials");
  await table.getByRole("row", { name: /Rate card 2027/ }).getByRole("cell").nth(2).click();
  await expect(page).toHaveURL(materialUrl);
});

test("a material is deleted after a confirmation", async ({ page }) => {
  await page.goto("/materials");
  await main(page).getByRole("link", { name: "Agency deck" }).click();
  await main(page).getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm.getByRole("heading", { name: "Delete Agency deck?" })).toBeVisible();
  await confirm.getByRole("button", { name: "Delete material" }).click();
  await expect(page).toHaveURL(/\/materials$/);
  await expect(main(page).getByRole("link", { name: "Agency deck" })).toHaveCount(0);
  await expect(main(page).getByRole("link", { name: "Rate card 2027" })).toBeVisible();
});

test("Materials fits a phone and is reached through Go to", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/materials", materialUrl, "/materials/new"]) {
    await page.goto(path);
    await expect(main(page)).toBeVisible();
    expect(await fits(page), path).toBe(true);
  }
  await page.goto(materialUrl);
  await main(page).getByRole("button", { name: "Add version" }).click();
  expect(await fits(page), "adding a version").toBe(true);

  await page.goto("/");
  await page.getByRole("button", { name: "Go to", exact: true }).click();
  await page.getByRole("option", { name: "Materials", exact: true }).click();
  await expect(page).toHaveURL(/\/materials$/);
});
