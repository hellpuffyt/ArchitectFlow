import fs from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { SAMPLE_VISION, createProject, headRevision, openView, projectId, savedDoc, signUp, uniqueEmail, waitSaved } from "./helpers";

/**
 * The core user journey, end to end, in one real browser session against the real API and a
 * fresh PostgreSQL database. No mocks. Each step's assertion reads persisted server state.
 */
test("core journey: vision → review → edit graph → persist → validate → prompt → export → restore → authz", async ({ page, browser, context }) => {
  // 1. sign up, create a project
  await signUp(page, uniqueEmail("owner"));
  await createProject(page, "Jewellery SaaS");
  const id = projectId(page);

  // 2. vision (canonical jewellery SaaS) → example-mode proposal → review → apply
  await openView(page, "Product vision");
  await page.getByLabel("Product vision").fill(SAMPLE_VISION);
  await waitSaved(page);
  await page.getByRole("button", { name: "Generate architecture" }).click();
  const review = page.getByRole("region", { name: "Proposed changes" });
  await expect(review.getByText("Example mode", { exact: true })).toBeVisible();
  await expect(review.getByTestId("changeset-lines")).toContainText("+ component Core API");
  await expect(review.getByTestId("changeset-lines")).toContainText("+ entity invoice");
  expect((await savedDoc(page)).nodes).toHaveLength(0); // nothing applied before approval
  const visionRev = await headRevision(page);
  await review.getByRole("button", { name: "Apply changes" }).click();
  await expect(page.getByTestId("head-revision")).toHaveText(`r${visionRev + 1}`);
  await waitSaved(page);
  const generatedRev = await headRevision(page);

  // 3. canvas renders the saved nodes and edges
  const generated = await savedDoc(page);
  for (const n of generated.nodes) await expect(page.getByTestId(`node-${n.id}`)).toBeVisible();
  await expect(page.locator(".react-flow__edge")).toHaveCount(generated.edges.length);

  // 4. move a node (drag) and add an edge (drag between handles), edit its label/protocol
  const node = page.getByTestId("node-core-api");
  const box = (await node.boundingBox())!;
  await page.mouse.move(box.x + 40, box.y + 15);
  await page.mouse.down();
  await page.mouse.move(box.x + 260, box.y + 170, { steps: 12 });
  await page.mouse.up();
  await waitSaved(page);
  await page.getByTestId("node-sync-api").locator(".react-flow__handle-right").dragTo(page.getByTestId("node-observability").locator(".react-flow__handle-left"));
  await waitSaved(page);
  let doc = await savedDoc(page);
  const newEdge = doc.edges.find((e: { source: string; target: string }) => e.source === "sync-api" && e.target === "observability");
  expect(newEdge).toBeTruthy();
  // Select the new connection through the inspector's connection list (keyboard-accessible).
  await page.getByTestId("node-sync-api").click();
  await page.getByRole("list", { name: "Connections" }).getByRole("button", { name: /Sync service → Observability/ }).click();
  await page.getByLabel("Connection inspector").getByLabel("Label").fill("sync metrics");
  await page.getByLabel("Connection inspector").getByLabel("Protocol").fill("OTLP");
  await waitSaved(page);
  const moved = (await savedDoc(page)).nodes.find((n: { id: string }) => n.id === "core-api").position;
  expect(moved.x - generated.nodes.find((n: { id: string }) => n.id === "core-api").position.x).toBeGreaterThan(150);

  // 5. undo/redo
  await page.locator(".react-flow__pane").click({ position: { x: 30, y: 400 } });
  await page.getByRole("button", { name: "Undo" }).click();
  await waitSaved(page);
  expect((await savedDoc(page)).edges.find((e: { id: string }) => e.id === newEdge.id).protocol).not.toBe("OTLP");
  await page.getByRole("button", { name: "Redo" }).click();
  await waitSaved(page);
  doc = await savedDoc(page);
  expect(doc.edges.find((e: { id: string }) => e.id === newEdge.id)).toMatchObject({ label: "sync metrics", protocol: "OTLP" });

  // 6. autosave → reload → identical graph
  await page.reload();
  await waitSaved(page);
  await openView(page, "System architecture");
  await expect(page.getByTestId("node-core-api")).toBeVisible();
  expect(await savedDoc(page)).toEqual(doc);
  await expect(page.locator(".react-flow__edge")).toHaveCount(doc.edges.length);

  // 7. validation: findings from real data (make the DB public, then validate)
  await page.getByTestId("node-db").click();
  await page.getByLabel("Component inspector").getByLabel("Public exposure").selectOption("true");
  await waitSaved(page);
  await openView(page, "Validation findings");
  await expect(page.getByTestId("finding").filter({ hasText: "node 'db' has public=true" })).toBeVisible();

  // 8. generate a prompt: it reflects the edited graph and records the source revision
  await openView(page, "Implementation prompt");
  await page.getByRole("button", { name: "Save version" }).click();
  await expect(page.getByText("Version 1")).toBeVisible();
  const promptRev = await headRevision(page);
  await expect(page.getByTestId("prompt-source")).toHaveText(`from saved revision ${promptRev}`);
  const content = page.getByTestId("prompt-content");
  await expect(content).toContainText("Sync service → Observability: OTLP, sync, encrypted — sync metrics");
  await expect(content).toContainText("Publicly reachable: Primary database");
  const versions = await (await page.request.get(`/api/projects/${id}/prompts`)).json();
  expect(versions[0]).toMatchObject({ version: 1, source_revision: promptRev, outdated: false });

  // 9. copy + Markdown export produce the same, usable text
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "Copy" }).click();
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip).toContain("# Jewellery SaaS — implementation brief");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Markdown" }).click()]);
  expect(await fs.readFile((await dl.path()) as string, "utf8")).toBe(clip);

  // 10. restore an earlier revision (the freshly generated design)
  await openView(page, "Versions & exports");
  await page.getByRole("button", { name: `Restore revision ${generatedRev}` }).click();
  const beforeRestore = await headRevision(page);
  await page.getByRole("dialog", { name: `Restore revision ${generatedRev}?` }).getByRole("button", { name: "Restore as new revision" }).click();
  await expect(page.getByTestId("head-revision")).toHaveText(`r${beforeRestore + 1}`);
  await waitSaved(page);
  const restored = await savedDoc(page);
  expect(restored).toEqual(generated);
  expect(await headRevision(page)).toBeGreaterThan(promptRev);
  expect((await (await page.request.get(`/api/projects/${id}/prompts`)).json())[0].outdated).toBe(true);

  // 11. a second user cannot read or change the project (404, no existence leak)
  const other = await (await browser.newContext()).newPage();
  await signUp(other, uniqueEmail("other"));
  await other.goto(`/projects/${id}`);
  await expect(other.getByText("Project not found, or you do not have access to it.")).toBeVisible();
  expect((await other.request.get(`/api/projects/${id}`)).status()).toBe(404);
  const csrf = (await (await other.request.get("/api/auth/me")).json()).csrf_token;
  const write = await other.request.put(`/api/projects/${id}/document`, { headers: { "x-csrf-token": csrf }, data: { base_revision: 1, document: {} } });
  expect(write.status()).toBe(404);
  expect(await savedDoc(page)).toEqual(restored);
});
