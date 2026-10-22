import { expect, test } from "@playwright/test";
import { createProject, generateSample, headRevision, openView, signUp, waitSaved } from "./helpers";

test("vertical slice: signup → project → example generate → review/apply → move node → autosave → reload identical", async ({ page, request }) => {
  await signUp(page);
  await createProject(page, "Jewellery SaaS");
  await generateSample(page);

  // Graph renders real nodes and connections from the saved design.
  for (const id of ["web", "gateway", "auth", "core-api", "db", "sync-api"]) await expect(page.getByTestId(`node-${id}`)).toBeVisible();
  expect(await page.locator(".react-flow__edge").count()).toBeGreaterThan(5);

  // Move a node by dragging it.
  const node = page.getByTestId("node-core-api");
  const before = await node.boundingBox();
  if (!before) throw new Error("node not rendered");
  await page.mouse.move(before.x + 40, before.y + 15);
  await page.mouse.down();
  await page.mouse.move(before.x + 240, before.y + 155, { steps: 12 });
  await page.mouse.up();
  await expect(page.getByTestId("save-status")).toHaveText(/Unsaved|Saving|Saved/);
  await waitSaved(page);
  const after = await node.boundingBox();
  expect(Math.round((after?.x ?? 0) - before.x)).toBeGreaterThan(150);

  // Compare the saved document before and after a reload.
  const projectUrl = page.url();
  const id = projectUrl.split("/").pop();
  const saved1 = await (await page.request.get(`/api/projects/${id}`)).json();
  await page.reload();
  await waitSaved(page);
  await openView(page, "System architecture");
  await expect(page.getByTestId("node-core-api")).toBeVisible();
  const saved2 = await (await page.request.get(`/api/projects/${id}`)).json();
  expect(saved2.document).toEqual(saved1.document);
  const core = saved2.document.nodes.find((n: { id: string }) => n.id === "core-api");
  const genPos = { x: 520, y: 0 }; // example layout: compute column 2 × 260
  expect(core.position.x).not.toBe(genPos.x);
  void request;
});

test("edges: create by dragging handles, edit label/protocol, undo/redo, delete with confirmation", async ({ page }) => {
  await signUp(page);
  await createProject(page, "Edges");
  await generateSample(page);
  const edgesBefore = await page.locator(".react-flow__edge").count();

  // Drag from the Sync service's right (source) handle to Observability's left handle.
  const src = page.getByTestId("node-sync-api").locator(".react-flow__handle-right");
  const dst = page.getByTestId("node-observability").locator(".react-flow__handle-left");
  await src.dragTo(dst);
  await expect(page.locator(".react-flow__edge")).toHaveCount(edgesBefore + 1);
  await waitSaved(page);

  // Select the new edge through the inspector-free path: click it.
  const id = page.url().split("/").pop();
  let doc = (await (await page.request.get(`/api/projects/${id}`)).json()).document;
  const newEdge = doc.edges.find((e: { source: string; target: string }) => e.source === "sync-api" && e.target === "observability");
  expect(newEdge).toBeTruthy();
  await page.locator(`[data-id="${newEdge.id}"]`).click({ force: true });
  const inspector = page.getByLabel("Connection inspector");
  await expect(inspector).toBeVisible();
  await inspector.getByLabel("Label").fill("sync metrics");
  await inspector.getByLabel("Protocol").fill("OTLP");
  await waitSaved(page);
  doc = (await (await page.request.get(`/api/projects/${id}`)).json()).document;
  expect(doc.edges.find((e: { id: string }) => e.id === newEdge.id)).toMatchObject({ label: "sync metrics", protocol: "OTLP" });

  // Undo/redo of the label edit.
  await page.locator(".react-flow__pane").click({ position: { x: 30, y: 400 } });
  const headBefore = await headRevision(page);
  await page.getByRole("button", { name: "Undo" }).click();
  await waitSaved(page);
  doc = (await (await page.request.get(`/api/projects/${id}`)).json()).document;
  expect(doc.edges.find((e: { id: string }) => e.id === newEdge.id).protocol).not.toBe("OTLP");
  await page.getByRole("button", { name: "Redo" }).click();
  await waitSaved(page);
  doc = (await (await page.request.get(`/api/projects/${id}`)).json()).document;
  expect(doc.edges.find((e: { id: string }) => e.id === newEdge.id).protocol).toBe("OTLP");
  expect(await headRevision(page)).toBeGreaterThan(headBefore);

  // Keyboard delete asks for confirmation and can be cancelled.
  await page.getByTestId("node-observability").click();
  await page.keyboard.press("Delete");
  const dlg = page.getByRole("dialog", { name: "Delete selection?" });
  await expect(dlg).toBeVisible();
  await dlg.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByTestId("node-observability")).toBeVisible();
  await page.keyboard.press("Delete");
  await dlg.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByTestId("node-observability")).toHaveCount(0);
  await waitSaved(page);
  await page.keyboard.press("Meta+z");
  await expect(page.getByTestId("node-observability")).toBeVisible();
  await waitSaved(page);
});

test("prompt reflects the current saved revision and is marked outdated after an edit", async ({ page, context }) => {
  await signUp(page);
  await createProject(page, "Prompt sync");
  await generateSample(page);
  await openView(page, "Implementation prompt");
  const content = page.getByTestId("prompt-content");
  await expect(content).toContainText("Core API");
  await page.getByRole("button", { name: "Save version" }).click();
  await expect(page.getByText("Version 1")).toBeVisible();
  const rev1 = await headRevision(page);
  await expect(page.getByTestId("prompt-source")).toHaveText(`from saved revision ${rev1}`);

  // Rename the service on the canvas.
  await openView(page, "System architecture");
  await page.getByTestId("node-core-api").click();
  await page.getByLabel("Component inspector").getByLabel("Name", { exact: true }).fill("Ledger Service");
  await waitSaved(page);
  const rev2 = await headRevision(page);
  expect(rev2).toBeGreaterThan(rev1);

  await openView(page, "Implementation prompt");
  await expect(page.getByText("OUTDATED").first()).toBeVisible();
  await expect(content).toContainText("Ledger Service");
  await expect(content).not.toContainText("Core API");
  await page.getByRole("button", { name: "Save version" }).click();
  await expect(page.getByText("Version 2")).toBeVisible();
  await expect(page.getByTestId("prompt-source")).toHaveText(`from saved revision ${rev2}`);

  // Copy and Markdown download produce the same text.
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "Copy" }).click();
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip).toContain("Ledger Service");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Markdown" }).click()]);
  expect(dl.suggestedFilename()).toMatch(/\.md$/);
  const fs = await import("node:fs/promises");
  const text = await fs.readFile((await dl.path()) as string, "utf8");
  expect(text).toBe(clip);
});

test("regression: a modal opened before navigation does not leave the next page inert", async ({ page }) => {
  await signUp(page);
  await createProject(page, "Inert check");
  // Workspace navigation must be clickable right after creating from the modal dialog.
  await openView(page, "Requirements");
  await expect(page.getByRole("heading", { name: "Requirements" })).toBeVisible();
  expect(await page.evaluate(() => document.querySelectorAll("dialog[open]").length)).toBe(0);
});
