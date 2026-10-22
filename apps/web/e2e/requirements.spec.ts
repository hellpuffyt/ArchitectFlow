import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { createProject, generateSample, headRevision, openView, projectId, savedDoc, signUp, waitSaved } from "./helpers";

const section = (page: Page, title: string) =>
  page.locator("section").filter({ has: page.getByRole("heading", { name: new RegExp(`^${title} \\(`) }) });

test("requirements editing persists exactly, flags conflicts, and drives the prompt", async ({ page }) => {
  await signUp(page);
  await createProject(page, "Requirements");
  await generateSample(page);
  await openView(page, "Requirements");
  const fr = section(page, "Functional");
  const nfr = section(page, "Non-functional");

  // Edit an existing functional requirement and its priority.
  await fr.getByLabel("Requirement fr-1", { exact: true }).fill("Inventory with per-branch stock levels");
  await fr.getByLabel("Priority fr-1", { exact: true }).selectOption("should");
  // Create a new functional requirement.
  await fr.getByRole("button", { name: "Add" }).click();
  await waitSaved(page);
  const added = (await savedDoc(page)).requirements.functional.at(-1);
  await fr.getByLabel(`Requirement ${added.id}`, { exact: true }).fill("Print invoices as PDF");
  // Delete one.
  await fr.getByRole("button", { name: "Remove fr-6", exact: true }).click();
  // Non-functional: confirm one assumption, delete another, add a new one.
  await nfr.getByRole("button", { name: "Confirm nfr-1", exact: true }).click();
  await nfr.getByRole("button", { name: "Remove nfr-2", exact: true }).click();
  await nfr.getByRole("button", { name: "Add" }).click();
  await waitSaved(page);
  const addedNfr = (await savedDoc(page)).requirements.nonfunctional.at(-1);
  await nfr.getByLabel(`Requirement ${addedNfr.id}`, { exact: true }).fill("Pages load within 2 seconds at p95");
  await nfr.getByLabel(`Category ${addedNfr.id}`, { exact: true }).selectOption("performance");
  // Actors and constraints.
  await page.getByLabel("Role name admin", { exact: true }).fill("Store owner");
  await page.getByLabel("Role description admin", { exact: true }).fill("Manages branches and staff");
  const cons = section(page, "Constraints");
  await cons.getByRole("button", { name: "Add" }).click();
  await waitSaved(page);
  const cid = (await savedDoc(page)).constraints.at(-1).id;
  await cons.getByLabel(`Constraint kind ${cid}`, { exact: true }).selectOption("forbids_technology");
  await cons.getByLabel(`Constraint ${cid}`, { exact: true }).fill("Customer mandates no PostgreSQL");
  await cons.getByLabel(`Constraint value ${cid}`, { exact: true }).fill("PostgreSQL");
  await waitSaved(page);

  // Reload: persisted exactly.
  const before = await savedDoc(page);
  const f = before.requirements.functional;
  expect(f.find((r: { id: string }) => r.id === "fr-1")).toMatchObject({ text: "Inventory with per-branch stock levels", priority: "should", status: "confirmed" });
  expect(f.find((r: { id: string }) => r.id === added.id).text).toBe("Print invoices as PDF");
  expect(f.some((r: { id: string }) => r.id === "fr-6")).toBe(false);
  const n = before.requirements.nonfunctional;
  expect(n.find((r: { id: string }) => r.id === "nfr-1").status).toBe("confirmed");
  expect(n.some((r: { id: string }) => r.id === "nfr-2")).toBe(false);
  expect(n.find((r: { id: string }) => r.id === addedNfr.id)).toMatchObject({ category: "performance", status: "confirmed" });
  expect(before.actors.find((a: { id: string }) => a.id === "admin")).toMatchObject({ name: "Store owner", description: "Manages branches and staff" });
  expect(before.constraints.at(-1)).toMatchObject({ kind: "forbids_technology", value: "PostgreSQL" });
  await page.reload();
  await waitSaved(page);
  await openView(page, "Requirements");
  await expect(section(page, "Functional").getByLabel("Requirement fr-1", { exact: true })).toHaveValue("Inventory with per-branch stock levels");
  await expect(section(page, "Non-functional").getByRole("button", { name: "Confirm nfr-1", exact: true })).toHaveCount(0);
  expect(await savedDoc(page)).toEqual(before);

  // Conflicting requirements are flagged from the saved data.
  await openView(page, "Validation findings");
  const conflict = page.getByTestId("finding").filter({ hasText: "Conflicting requirements" });
  await expect(conflict).toBeVisible();
  await expect(conflict).toContainText("technology preference 'PostgreSQL'");

  // The prompt reflects the edits, labeled CONFIRMED vs ASSUMPTION, from the new revision.
  const rev = await headRevision(page);
  const prompt = await (await page.request.post(`/api/projects/${projectId(page)}/prompts`, {
    headers: { "x-csrf-token": (await (await page.request.get("/api/auth/me")).json()).csrf_token }, data: {} })).json();
  expect(prompt.source_revision).toBe(rev);
  const c: string = prompt.content;
  expect(c).toContain("[CONFIRMED] (should) Inventory with per-branch stock levels");
  expect(c).toContain("[CONFIRMED] (must) Print invoices as PDF");
  expect(c).toContain("[CONFIRMED] (should, availability) Clients keep working without connectivity");
  expect(c).toContain("[CONFIRMED] (must, performance) Pages load within 2 seconds at p95");
  expect(c).toMatch(/\[ASSUMPTION\] \(should, security\) Tenant data is isolated/);
  expect(c).toContain("[CONFIRMED] Store owner (`admin`): Manages branches and staff");
  expect(c).toContain("[CONFIRMED] Customer mandates no PostgreSQL");
  expect(c).not.toContain("(must) Administrative dashboard"); // deleted requirement (acceptance criteria are separate items)
  expect(c).not.toContain("Every API checks the caller's role");
});
