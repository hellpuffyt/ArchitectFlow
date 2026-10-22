import path from "node:path";
import { test } from "@playwright/test";
import { createProject, generateWithPages, openView, signUp, waitSaved } from "./helpers";

// Captures README screenshots from the real app with real data. Opt-in:
//   ARCHITECTFLOW_SCREENSHOTS=1 npx playwright test e2e/screenshots.spec.ts
const OUT = path.resolve(__dirname, "../../../docs/screenshots");

test("README screenshots", async ({ page }) => {
  test.skip(process.env.ARCHITECTFLOW_SCREENSHOTS !== "1", "opt-in: writes files into docs/screenshots");
  const shot = (name: string) => page.screenshot({ path: path.join(OUT, `${name}.jpg`), type: "jpeg", quality: 78 });
  await signUp(page);
  await createProject(page, "Jewellery management SaaS");
  await generateWithPages(page);
  await openView(page, "System architecture");
  await page.getByRole("button", { name: "Fit to view" }).click();
  await page.getByTestId("node-core-api").click();
  await page.waitForTimeout(400);
  await shot("architecture");
  await openView(page, "UI/UX design");
  await page.getByRole("tab", { name: "Design assistant" }).click();
  await page.getByLabel("Visual change request").fill("premium dark SaaS dashboard with emerald accents");
  await page.getByRole("button", { name: "Propose design change" }).click();
  await page.waitForTimeout(300);
  await shot("design-review");
  await page.getByRole("region", { name: "Proposed changes" }).getByRole("button", { name: "Apply changes" }).click();
  await waitSaved(page);
  await page.getByRole("tab", { name: "Theme & tokens" }).click();
  await shot("theme-editor");
  await page.getByRole("tab", { name: "Pages & layout" }).click();
  await page.getByRole("list", { name: "Pages" }).getByText("Inventory items").click();
  await page.waitForTimeout(300);
  await shot("page-designer");
  await openView(page, "Validation findings");
  await page.waitForTimeout(500);
  await shot("validation");
  await openView(page, "Implementation prompt");
  await page.getByLabel("Prompt type").selectOption("frontend");
  await waitSaved(page);
  await page.waitForTimeout(600);
  await shot("prompt");
});
