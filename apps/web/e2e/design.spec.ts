import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { createProject, generateWithPages, openView, previewVar, projectId, savedDoc, signUp, waitSaved } from "./helpers";

async function openTheme(page: Page) {
  await openView(page, "UI/UX design");
  await page.getByRole("tab", { name: "Theme & tokens" }).click();
}

test("theme editor: tokens drive the live preview, persist, undo/redo, contrast checks", async ({ page }) => {
  await signUp(page);
  await createProject(page, "Theme test");
  // (1) open the UI/UX workspace; no theme yet → choose a preset
  await openTheme(page);
  await page.getByRole("button", { name: "Use preset SaaS light" }).click();
  await expect(page.getByTestId("theme-preview")).toBeVisible();
  await waitSaved(page);
  expect(await previewVar(page, "--t-primary")).toBe("#4f46e5");

  // (2)+(3) change colors, typography and component styles → preview updates from the tokens
  await page.getByRole("button", { name: "Edit primary color" }).click();
  await page.getByLabel("primary hex").fill("#047857");
  expect(await previewVar(page, "--t-primary")).toBe("#047857");
  await page.getByLabel("Base size value").fill("17");
  expect(await previewVar(page, "--t-size")).toBe("17px");
  await page.getByLabel("Buttons").selectOption("outline");
  await expect(page.getByTestId("preview-primary")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await page.getByLabel("Button radius").selectOption("full");
  expect(await previewVar(page, "--t-r-btn")).toBe("999px");
  await page.getByLabel("Heading font").selectOption("Georgia, serif");
  await expect(page.getByTestId("preview-heading")).toHaveCSS("font-family", /Georgia/);
  await waitSaved(page);

  // HSL / RGB inputs edit the same token
  await page.getByLabel("primary lightness").fill("20");
  const darker = await previewVar(page, "--t-primary");
  expect(darker).not.toBe("#047857");
  // invalid HEX is never saved
  await page.getByLabel("primary hex").fill("#12zz");
  await expect(page.getByText("Use #rrggbb")).toBeVisible();
  expect(await previewVar(page, "--t-primary")).toBe(darker);

  // Contrast is computed from the tokens
  await page.getByRole("button", { name: "Edit text color" }).click();
  await page.getByLabel("text hex").fill("#999999");
  await expect(page.getByTestId("contrast-text-on-background")).toContainText("2.85:1");
  await expect(page.getByTestId("contrast-text-on-background")).toContainText("fail");
  await waitSaved(page);

  // (7) undo/redo of design changes
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByTestId("contrast-text-on-background")).not.toContainText("2.85:1");
  await page.getByRole("button", { name: "Redo" }).click();
  await expect(page.getByTestId("contrast-text-on-background")).toContainText("2.85:1");
  await waitSaved(page);

  // (5) persisted after reload, identical to the saved document
  const before = await savedDoc(page);
  await page.reload();
  await openTheme(page);
  expect(await previewVar(page, "--t-primary")).toBe(darker);
  expect(await previewVar(page, "--t-size")).toBe("17px");
  const theme = before.design.themes[0];
  expect(theme.light.text).toBe("#999999");
  expect(theme.components.button).toBe("outline");
  expect((await savedDoc(page)).design).toEqual(before.design);

  // Theme management: duplicate, rename, reset to preset
  await page.getByRole("button", { name: "Duplicate theme" }).click();
  await expect(page.getByLabel("Active theme")).toHaveValue(/copy/);
  await page.getByRole("button", { name: "Rename theme" }).click();
  await page.getByRole("dialog", { name: "Rename theme" }).getByLabel("Theme name").fill("Brand v2");
  await page.getByRole("dialog", { name: "Rename theme" }).getByRole("button", { name: "Save" }).click();
  await expect(page.getByLabel("Active theme").locator("option:checked")).toHaveText("Brand v2");
  await page.getByRole("button", { name: "Reset theme to preset" }).click();
  expect(await previewVar(page, "--t-primary")).toBe("#4f46e5");
  await waitSaved(page);

  // (13) tokens export: JSON + CSS variables carry the saved values
  const [json] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export tokens JSON" }).click()]);
  const fs = await import("node:fs/promises");
  const tokens = JSON.parse(await fs.readFile((await json.path()) as string, "utf8"));
  expect(tokens.format).toBe("architectflow-design-tokens");
  expect(tokens.themes.map((t: { name: string }) => t.name)).toContain("Brand v2");
  const [css] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export CSS variables" }).click()]);
  const cssText = await fs.readFile((await css.path()) as string, "utf8");
  expect(cssText).toContain("--color-primary: #4f46e5;");
  expect(cssText).toContain("prefers-reduced-motion");
});

test("page designer: generated pages, edit, drag-and-drop, responsive, routes, links, prototype, validation, AI, prompt", async ({ page }) => {
  await signUp(page);
  await createProject(page, "Design studio");
  await generateWithPages(page);
  await page.getByRole("tab", { name: "Pages & layout" }).click();
  const pages = page.getByRole("list", { name: "Pages" });
  await expect(pages.getByText("Inventory items")).toBeVisible();

  // (4) create a page and add/edit components
  await page.getByRole("button", { name: "Add page" }).first().click();
  const dlg = page.getByRole("dialog", { name: "Add page" });
  await dlg.getByLabel("Page name").fill("Reports");
  await dlg.getByLabel("Route").fill("/reports");
  await dlg.getByRole("button", { name: "Add page" }).click();
  await expect(page.getByLabel("Page settings").getByLabel("Route")).toHaveValue("/reports");
  await page.getByRole("button", { name: "Add Heading" }).click();
  const inspector = page.getByLabel("Element inspector");
  await inspector.getByLabel("text").fill("Monthly reports");
  await expect(page.getByTestId("page-canvas").getByText("Monthly reports")).toBeVisible();
  await page.getByText("← Page settings").click();
  // drag-and-drop a grid from the library onto the page, then a stat into the grid
  await page.getByTestId("lib-grid").dragTo(page.locator('[data-testid^="drop-page-reports"]').last());
  const grid = page.locator('[data-kind="grid"]').first();
  await expect(grid).toBeVisible();
  const gridId = (await grid.getAttribute("data-testid"))!.replace("el-", "");
  await page.getByTestId("lib-stat").dragTo(page.getByTestId(`drop-${gridId}-0`));
  await page.getByTestId("lib-stat").dragTo(page.getByTestId(`drop-${gridId}-1`));
  await expect(grid.locator('[data-kind="stat"]')).toHaveCount(2);
  await waitSaved(page);

  // (6) responsive rule: 1 column on mobile; previews apply the theme breakpoints
  await grid.click({ position: { x: 3, y: 3 } });
  await inspector.getByLabel("Columns on sm").fill("1");
  await inspector.getByLabel("Columns on md").fill("2");
  await page.getByRole("group", { name: "Breakpoint" }).getByRole("button", { name: /Desktop/ }).click();
  await expect(grid.locator("[data-columns]").first()).toHaveAttribute("data-columns", "3");
  await page.getByRole("group", { name: "Breakpoint" }).getByRole("button", { name: /Tablet/ }).click();
  await expect(grid.locator("[data-columns]").first()).toHaveAttribute("data-columns", "2");
  await page.getByRole("group", { name: "Breakpoint" }).getByRole("button", { name: /Mobile/ }).click();
  await expect(page.getByTestId("page-canvas")).toHaveAttribute("data-breakpoint", "sm");
  await expect(grid.locator("[data-columns]").first()).toHaveAttribute("data-columns", "1");
  await waitSaved(page);

  // (5) layout changes persist after reload
  const id = projectId(page);
  await page.reload();
  await openView(page, "UI/UX design");
  await page.getByRole("tab", { name: "Pages & layout" }).click();
  await page.getByRole("list", { name: "Pages" }).getByText("Reports", { exact: true }).click();
  await expect(page.getByTestId("page-canvas").getByText("Monthly reports")).toBeVisible();
  const reports = (await savedDoc(page)).design.pages.find((p: { route: string }) => p.route === "/reports");
  const savedGrid = reports.layout.children.find((c: { kind: string }) => c.kind === "grid");
  expect(savedGrid.children).toHaveLength(2);
  expect(savedGrid.responsive.sm.columns).toBe(1);

  // (9) link UI components to existing APIs and data entities
  await page.getByRole("list", { name: "Pages" }).getByText("Reports", { exact: true }).click();
  await page.locator('[data-kind="stat"]').first().click();
  await inspector.getByLabel("Endpoint").selectOption({ label: "GET /api/invoices" });
  await inspector.getByLabel("Entity").selectOption({ label: "invoice" });
  await waitSaved(page);
  const linked = (await savedDoc(page)).design.pages.find((p: { route: string }) => p.route === "/reports").layout.children
    .find((c: { kind: string }) => c.kind === "grid").children[0];
  expect(linked).toMatchObject({ endpoint_id: "api-list-invoice", entity_id: "ent-invoice" });

  // (8) routes + journeys
  await page.getByRole("tab", { name: "UI journeys" }).click();
  await page.getByRole("button", { name: "Add journey" }).click();
  const j = page.locator('[data-testid^="ui-journey-journey"]').last();
  await j.getByLabel(/UI journey name/).fill("Review monthly reports");
  await j.getByLabel(/Add page to/).selectOption({ label: "Dashboard (/)" });
  await j.getByLabel(/Add page to/).selectOption({ label: "Reports (/reports)" });
  await waitSaved(page);
  const journey = (await savedDoc(page)).design.journeys.find((x: { name: string }) => x.name === "Review monthly reports");
  expect(journey.steps.map((s: { page_id: string }) => s.page_id)).toEqual(["page-dashboard", "page-reports"]);

  // Prototype mode: implemented navigation works; visual-only actions are labeled as such
  await page.getByRole("tab", { name: "Pages & layout" }).click();
  await page.getByRole("list", { name: "Pages" }).getByText("Inventory items").click();
  await page.getByRole("group", { name: "Mode" }).getByRole("button", { name: "Prototype" }).click();
  await page.getByTestId("page-canvas").getByRole("button", { name: "New inventory item" }).click();
  await expect(page.getByLabel("Page settings").getByLabel("Route")).toHaveValue("/items/new");
  await page.getByTestId("page-canvas").getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("prototype-toast")).toContainText("Visual only");
  await page.getByRole("group", { name: "Mode" }).getByRole("button", { name: "Edit" }).click();

  // (10) validation detects intentionally broken references
  await openView(page, "API design");
  await page.getByRole("list", { name: "Endpoints" }).getByText("/api/invoices").first().click();
  await page.getByRole("button", { name: "Delete endpoint" }).click();
  await waitSaved(page);
  await openView(page, "Validation findings");
  const finding = page.getByTestId("finding").filter({ hasText: "Component calls an API that does not exist" });
  await expect(finding.first()).toBeVisible();
  await expect(finding.first()).toContainText("api-list-invoice");
  // the UI design was NOT silently deleted
  expect((await savedDoc(page)).design.pages.some((p: { route: string }) => p.route === "/reports")).toBe(true);

  // (11) AI design proposal is previewed and approved before applying
  await openView(page, "UI/UX design");
  await page.getByRole("tab", { name: "Design assistant" }).click();
  await page.getByLabel("Visual change request").fill("premium dark SaaS dashboard with emerald accents");
  await page.getByRole("button", { name: "Propose design change" }).click();
  const review = page.getByRole("region", { name: "Proposed changes" });
  await expect(review.getByText("appearance: light → dark")).toBeVisible();
  await expect(review.getByText("Example mode", { exact: true })).toBeVisible();
  expect((await savedDoc(page)).design.themes[0].appearance).toBe("light"); // not applied yet
  await review.getByRole("button", { name: "Apply changes" }).click();
  await expect(review.getByText("applied", { exact: true })).toBeVisible();
  await waitSaved(page);
  const themed = await savedDoc(page);
  expect(themed.design.themes[0].appearance).toBe("dark");
  await page.getByRole("tab", { name: "Theme & tokens" }).click();
  await expect(page.getByTestId("theme-preview")).toHaveAttribute("data-mode", "dark");

  // (12) prompt reflects the current architecture, theme, pages, components and interactions
  await openView(page, "Implementation prompt");
  await page.getByLabel("Prompt type").selectOption("frontend");
  await waitSaved(page);
  const content = page.getByTestId("prompt-content");
  await expect(content).toContainText(`\`--color-primary\`: ${themed.design.themes[0].dark.primary}`);
  await expect(content).toContainText("`/reports` — Reports");
  await expect(content).toContainText("Monthly reports");
  await expect(content).toContainText("implemented in prototype");
  await expect(content).toContainText("visual-only in prototype");
  await expect(content).toContainText("missing endpoint api-list-invoice");

  // (13) design spec + page-flow exports
  const fmt = await page.request.get(`/api/projects/${id}/exports/design-spec`);
  expect(fmt.status()).toBe(200);
  expect(await fmt.text()).toContain("### Page: Reports (`/reports`)");
  const flow = await (await page.request.get(`/api/projects/${id}/exports/page-flow`)).text();
  expect(flow).toContain("flowchart LR");
});

test("(14) design data stays private: other users get 404 on design, exports and shares", async ({ browser }) => {
  const owner = await (await browser.newContext()).newPage();
  await signUp(owner);
  await createProject(owner, "Private design");
  await openTheme(owner);
  await owner.getByRole("button", { name: "Use preset Developer dark" }).click();
  await waitSaved(owner);
  const id = projectId(owner);
  const other = await (await browser.newContext()).newPage();
  await signUp(other);
  for (const path of ["", "/exports/tokens", "/exports/css", "/exports/design-spec", "/shares", "/revisions"]) {
    expect((await other.request.get(`/api/projects/${id}${path}`)).status(), path).toBe(404);
  }
});
