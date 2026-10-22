import { expect, test } from "@playwright/test";
import { createProject, signUp, waitSaved } from "./helpers";

test("another user cannot read or edit a private project (UI and API)", async ({ browser }) => {
  const alice = await (await browser.newContext()).newPage();
  await signUp(alice);
  await createProject(alice, "Alice private design");
  await alice.getByRole("navigation", { name: "Workspaces" }).getByRole("button", { name: "Product vision" }).click();
  await alice.getByLabel("Product vision").fill("Alice's confidential vision text for a payments platform.");
  await waitSaved(alice);
  const url = alice.url();
  const id = url.split("/").pop();

  const mallory = await (await browser.newContext()).newPage();
  await signUp(mallory);
  await mallory.goto(url);
  await expect(mallory.getByText("Project not found, or you do not have access to it.")).toBeVisible();
  await expect(mallory.getByText("confidential")).toHaveCount(0);

  expect((await mallory.request.get(`/api/projects/${id}`)).status()).toBe(404);
  expect((await mallory.request.get(`/api/projects/${id}/revisions/1`)).status()).toBe(404);
  // Even with a valid CSRF token for her own session, writes to Alice's project are refused.
  const me = await (await mallory.request.get("/api/auth/me")).json();
  const put = await mallory.request.put(`/api/projects/${id}/document`, {
    headers: { "x-csrf-token": me.csrf_token }, data: { base_revision: 2, document: {} },
  });
  expect(put.status()).toBe(404);
  const anon = await (await browser.newContext()).request.get(`${new URL(url).origin}/api/projects/${id}`);
  expect(anon.status()).toBe(401);

  // Alice's data is intact.
  const own = await (await alice.request.get(`/api/projects/${id}`)).json();
  expect(own.document.vision).toContain("confidential");
});
