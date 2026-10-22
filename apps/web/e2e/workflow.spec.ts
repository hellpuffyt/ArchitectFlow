import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { createProject, generateSample, headRevision, openView, projectId, savedDoc, signUp, waitSaved } from "./helpers";

test("(8) invalid architecture JSON is rejected with actionable errors; valid import works", async ({ page }) => {
  await signUp(page);
  await createProject(page, "Import");
  await openView(page, "Versions & exports");
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "af-"));
  const bad = path.join(dir, "bad.json");
  await fs.writeFile(bad, JSON.stringify({ nodes: [{ id: "a", type: "service", label: "A" }], edges: [{ id: "e1", source: "a", target: "ghost" }] }));
  await page.getByLabel("Import file").setInputFiles(bad);
  const err = page.getByRole("alert").filter({ hasText: "invalid" });
  await expect(err).toBeVisible();
  await expect(err).toContainText("ghost");
  const notJson = path.join(dir, "x.json");
  await fs.writeFile(notJson, "{not json");
  await page.getByLabel("Import file").setInputFiles(notJson);
  await expect(page.getByRole("alert").filter({ hasText: "not valid JSON" })).toBeVisible();
  expect(await headRevision(page)).toBe(1);
  const good = path.join(dir, "good.json");
  await fs.writeFile(good, JSON.stringify({ schema_version: 1, nodes: [{ id: "api", type: "service", label: "Imported API" }] }));
  await page.getByLabel("Import file").setInputFiles(good);
  await page.getByRole("dialog", { name: "Import architecture?" }).getByRole("button", { name: "Replace current design" }).click();
  await waitSaved(page);
  expect((await savedDoc(page)).nodes[0].label).toBe("Imported API");
});

test("(9) validation findings come from the saved data and link back to the canvas", async ({ page }) => {
  await signUp(page);
  await createProject(page, "Findings");
  await generateSample(page);
  await page.getByTestId("node-db").click();
  await page.getByLabel("Component inspector").getByLabel("Public exposure").selectOption("true");
  await waitSaved(page);
  await openView(page, "Validation findings");
  const f = page.getByTestId("finding").filter({ hasText: "Internal component marked publicly reachable" });
  await expect(f).toBeVisible();
  await expect(f).toContainText("node 'db' has public=true");
  await f.getByRole("button", { name: "Show on canvas" }).click();
  await expect(page.getByLabel("Component inspector")).toBeVisible();
  await expect(page.getByLabel("Component inspector").getByLabel("Name", { exact: true })).toHaveValue("Primary database");
});

test("(11)(12) exports and version restore through the UI", async ({ page }) => {
  await signUp(page);
  await createProject(page, "Versions");
  await generateSample(page);
  const good = await headRevision(page);
  await page.getByTestId("node-core-api").click();
  await page.getByLabel("Component inspector").getByLabel("Name", { exact: true }).fill("Broken rename");
  await waitSaved(page);
  await openView(page, "Versions & exports");
  await page.getByRole("button", { name: `Restore revision ${good}` }).click();
  await page.getByRole("dialog", { name: `Restore revision ${good}?` }).getByRole("button", { name: "Restore as new revision" }).click();
  await waitSaved(page);
  const doc = await savedDoc(page);
  expect(doc.nodes.find((n: { id: string }) => n.id === "core-api").label).toBe("Core API");
  await expect(page.getByTestId("revision").first()).toContainText("restore");

  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export architecture JSON" }).click()]);
  const exported = JSON.parse(await fs.readFile((await dl.path()) as string, "utf8"));
  expect(exported).toEqual(doc);
  for (const key of ["mermaid", "sql", "openapi", "spec", "bundle"]) {
    const [d] = await Promise.all([page.waitForEvent("download"), page.getByTestId(`export-${key}`).click()]);
    const text = await fs.readFile((await d.path()) as string, "utf8");
    expect(text.length, key).toBeGreaterThan(40);
    if (key === "sql") expect(text).toContain('CREATE TABLE "item"');
    if (key === "openapi") expect(JSON.parse(text).openapi).toBe("3.1.0");
  }
});

test("share links: read-only view works, revocation stops it", async ({ page, browser }) => {
  await signUp(page);
  await createProject(page, "Shareable");
  await generateSample(page);
  await openView(page, "Versions & exports");
  await page.getByRole("button", { name: "Create link" }).click();
  const url = (await page.getByTestId("share-url").textContent())!.trim();
  const viewer = await (await browser.newContext()).newPage();
  await viewer.goto(url);
  await expect(viewer.getByText("read-only · revision")).toBeVisible();
  await expect(viewer.getByTestId("node-core-api")).toBeVisible();
  await page.getByRole("button", { name: "Revoke" }).click();
  await expect(page.getByRole("list", { name: "Share links" })).toContainText("revoked");
  await viewer.reload();
  await expect(viewer.getByText("This link is invalid, expired or has been revoked.")).toBeVisible();
});

test("account: data export contains the user's projects", async ({ page }) => {
  await signUp(page);
  await createProject(page, "Exported project");
  await page.goto("/account");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export my data" }).click()]);
  const data = JSON.parse(await fs.readFile((await dl.path()) as string, "utf8"));
  expect(data.projects.map((p: { name: string }) => p.name)).toContain("Exported project");
});

test("keyboard: sign in and move through workspaces without a mouse", async ({ page }) => {
  const { email, password } = await signUp(page);
  await page.context().clearCookies();
  await page.goto("/login");
  await page.keyboard.press("Tab"); // logo link
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Email")).toBeFocused();
  await page.keyboard.type(email);
  await page.keyboard.press("Tab");
  await page.keyboard.type(password);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/projects$/);
  await createProject(page, "Keyboard");
  const nav = page.getByRole("navigation", { name: "Workspaces" });
  await nav.getByRole("button", { name: "Requirements" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Requirements" })).toBeVisible();
  await expect(nav.getByRole("button", { name: "Requirements" })).toHaveAttribute("aria-current", "page");
});

test("mobile viewport: dashboard and workspace are usable at 390px", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await signUp(page);
  await createProject(page, "Phone");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.getByLabel("Workspace", { exact: true }).selectOption("requirements");
  await expect(page.getByRole("heading", { name: "Requirements" })).toBeVisible();
  await page.goto("/projects");
  const dashOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(dashOverflow).toBeLessThanOrEqual(1);
});

test("AI provider failure is shown as an actionable error and nothing changes (browser handling)", async ({ page }) => {
  // The real unreachable/timeout/429 provider paths are verified at the API level in
  // apps/api/tests/test_failures.py. Here we intercept the response to verify the UI handling.
  await signUp(page);
  await createProject(page, "AI down");
  await generateSample(page);
  const head = await headRevision(page);
  await page.route("**/ai/edit", (route) => route.fulfill({ status: 502, contentType: "application/json",
    body: JSON.stringify({ detail: { message: "The AI provider failed: openai-compatible request failed: ConnectError. Your design was not changed.", provider: "openai-compatible" } }) }));
  await page.getByRole("tab", { name: "AI assistant" }).click();
  await page.getByLabel("Describe a change").fill("add a cache");
  await page.getByRole("button", { name: "Propose change" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Your design was not changed" })).toBeVisible();
  expect(await headRevision(page)).toBe(head);
});

test("PostgreSQL down: the editor shows 'not saved', keeps edits, and recovers on retry", async ({ page }) => {
  test.skip(process.env.ARCHITECTFLOW_E2E_STOP_DB !== "1",
    "Stops the local dev PostgreSQL cluster; run with ARCHITECTFLOW_E2E_STOP_DB=1 (not possible with a CI service container).");
  const script = path.resolve(__dirname, "../../../scripts/dev-db.sh");
  await signUp(page);
  await createProject(page, "DB down");
  await generateSample(page);
  const before = await headRevision(page);
  execFileSync("bash", [script, "stop"]);
  try {
    await page.getByTestId("node-core-api").click();
    await page.getByLabel("Component inspector").getByLabel("Name", { exact: true }).fill("Edited while DB down");
    await expect(page.getByTestId("save-status")).toHaveText(/Not saved — server unreachable/, { timeout: 15_000 });
    await expect(page.getByRole("alert").filter({ hasText: "NOT saved" })).toBeVisible();
  } finally {
    execFileSync("bash", [script, "start"]);
  }
  await page.getByRole("button", { name: "Retry save" }).click();
  await waitSaved(page);
  expect(await headRevision(page)).toBe(before + 1);
  expect((await savedDoc(page)).nodes.find((n: { id: string }) => n.id === "core-api").label).toBe("Edited while DB down");
  void projectId;
});

test("regression: status shows Saving… (never Saved) while a restore is still in flight", async ({ page }) => {
  await signUp(page);
  await createProject(page, "Pending restore");
  await generateSample(page);
  const target = await headRevision(page);
  await page.getByTestId("node-core-api").click();
  await page.getByLabel("Component inspector").getByLabel("Name", { exact: true }).fill("Renamed");
  await waitSaved(page);
  // Hold the restore response for 1.5 s to observe the in-flight state deterministically.
  await page.route("**/restore", async (route) => {
    const response = await route.fetch();
    await new Promise((r) => setTimeout(r, 1500));
    await route.fulfill({ response });
  });
  await openView(page, "Versions & exports");
  await page.getByRole("button", { name: `Restore revision ${target}` }).click();
  await page.getByRole("dialog", { name: `Restore revision ${target}?` }).getByRole("button", { name: "Restore as new revision" }).click();
  await expect(page.getByTestId("save-status")).toHaveText(/Saving/);
  await waitSaved(page);
  expect((await savedDoc(page)).nodes.find((n: { id: string }) => n.id === "core-api").label).toBe("Core API");
});
