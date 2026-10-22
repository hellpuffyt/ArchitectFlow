import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

export const SAMPLE_VISION =
  "Build a multi-tenant jewellery management SaaS with inventory, billing, branch management, offline synchronization, role-based access, PostgreSQL, and an administrative dashboard.";

export function uniqueEmail(tag: string) {
  return `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

export async function signUp(page: Page, email = uniqueEmail("user"), password = "correct horse battery") {
  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/projects$/);
  return { email, password };
}

export async function createProject(page: Page, name: string) {
  await page.getByRole("button", { name: "New project" }).first().click();
  const dlg = page.getByRole("dialog", { name: "New project" });
  await dlg.getByLabel("Project name").fill(name);
  await dlg.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId("save-status")).toHaveText(/Saved/);
}

export async function waitSaved(page: Page) {
  await expect(page.getByTestId("save-status")).toHaveText(/Saved/, { timeout: 15_000 });
}

export async function openView(page: Page, name: string) {
  await page.getByRole("navigation", { name: "Workspaces" }).getByRole("button", { name }).click();
}

/** Vision → example-mode proposal → review → apply. Returns after the canvas shows nodes. */
export async function generateSample(page: Page) {
  await openView(page, "Product vision");
  await page.getByLabel("Product vision").fill(SAMPLE_VISION);
  await waitSaved(page);
  await page.getByRole("button", { name: /Generate architecture|Propose a new architecture/ }).click();
  const review = page.getByRole("region", { name: "Proposed changes" });
  await expect(review).toBeVisible();
  await expect(review.getByText("Example mode", { exact: true })).toBeVisible();
  await expect(review.getByText(/Example mode — no AI provider configured/)).toBeVisible();
  const before = Number((await page.getByTestId("head-revision").textContent())?.replace("r", ""));
  await review.getByRole("button", { name: "Apply changes" }).click();
  await expect(page.getByTestId("head-revision")).toHaveText(`r${before + 1}`);
  await expect(page.getByTestId("node-core-api")).toBeVisible();
  await waitSaved(page);
}

export async function headRevision(page: Page) {
  return Number((await page.getByTestId("head-revision").textContent())?.replace("r", ""));
}

export function projectId(page: Page) {
  return page.url().split("/").pop()!.split("?")[0];
}

export async function savedDoc(page: Page) {
  const r = await page.request.get(`/api/projects/${projectId(page)}`);
  return (await r.json()).document;
}

export async function previewVar(page: Page, name: string) {
  return page.getByTestId("theme-preview").evaluate((el, n) => (el as HTMLElement).style.getPropertyValue(n), name);
}

/** Generate the sample architecture, then propose + apply pages from requirements. */
export async function generateWithPages(page: Page) {
  await generateSample(page);
  await openView(page, "UI/UX design");
  await page.getByRole("tab", { name: "Design assistant" }).click();
  await page.getByRole("button", { name: "Propose pages" }).click();
  const review = page.getByRole("region", { name: "Proposed changes" });
  await expect(review.getByText(/\+ page Inventory items \(\/items\)/)).toBeVisible();
  await review.getByRole("button", { name: "Apply changes" }).click();
  await expect(review.getByText("applied", { exact: true })).toBeVisible();
  await waitSaved(page);
}
