import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { runInit } from "../src/cli/init.ts";
import { runUninstall } from "../src/cli/uninstall.ts";
import { readManifest, SKILL_REL, IGNORE_REL } from "../src/cli/install.ts";
import { makeRepo } from "./helpers.ts";

test("init installs the skill + manifest and is idempotent; uninstall removes only owned files", () => {
  const { dir, cleanup } = makeRepo({
    "README.md": "# app",
    ".claude/settings.json": '{"existing":true}',        // pre-existing user config — must survive
  });
  try {
    assert.equal(runInit(dir), 0);
    assert.ok(fs.existsSync(path.join(dir, SKILL_REL)), "skill installed");
    assert.ok(fs.existsSync(path.join(dir, IGNORE_REL)), "ignore created");
    const m = readManifest(dir)!;
    assert.ok(m.ownedFiles.includes(SKILL_REL));
    const installedAt = m.installedAt;

    // idempotent: second init keeps installedAt, does not duplicate
    runInit(dir);
    assert.equal(readManifest(dir)!.installedAt, installedAt);

    // user config untouched
    assert.equal(fs.readFileSync(path.join(dir, ".claude/settings.json"), "utf8"), '{"existing":true}');

    // uninstall removes owned files only, leaves user config
    assert.equal(runUninstall(dir, false), 0);
    assert.ok(!fs.existsSync(path.join(dir, SKILL_REL)), "skill removed");
    assert.ok(!fs.existsSync(path.join(dir, IGNORE_REL)), "created ignore removed");
    assert.ok(fs.existsSync(path.join(dir, ".claude/settings.json")), "user config preserved");
  } finally { cleanup(); }
});

test("init preserves a pre-existing .architectflowignore and does not remove it on uninstall", () => {
  const { dir, cleanup } = makeRepo({ "README.md": "# app", ".architectflowignore": "custom/\n" });
  try {
    runInit(dir);
    assert.equal(fs.readFileSync(path.join(dir, IGNORE_REL), "utf8"), "custom/\n", "user ignore not overwritten");
    assert.equal(readManifest(dir)!.createdIgnore, false);
    runUninstall(dir, false);
    assert.ok(fs.existsSync(path.join(dir, IGNORE_REL)), "pre-existing ignore not removed");
  } finally { cleanup(); }
});
