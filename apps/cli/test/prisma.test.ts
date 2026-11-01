import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze } from "../src/engine/analyze.ts";
import { validateDocument } from "../src/engine/validate.ts";
import { makeRepo } from "./helpers.ts";

const PRISMA = {
  "package.json": JSON.stringify({ name: "app", dependencies: { "@prisma/client": "5.0.0", express: "4.19.0" } }),
  "package-lock.json": "{}",
  "prisma/schema.prisma": `
datasource db { provider = "postgresql" url = env("DATABASE_URL") }
model User {
  id        String   @id @default(uuid())
  email     String   @unique
  createdAt DateTime @default(now())
  posts     Post[]
}
model Post {
  id        Int     @id @default(autoincrement())
  title     String
  published Boolean @default(false)
  authorId  String  @relation(references: [id])
}`,
  "src/index.ts": "import express from 'express';\nconst app = express();\napp.get('/health', (req,res)=>res.json({ok:true}));\napp.post('/posts', (req,res)=>res.json({}));",
};

test("parses Prisma models into entities and keeps scalar fields", () => {
  const { dir, cleanup } = makeRepo(PRISMA);
  try {
    const r = analyze(dir);
    const names = r.document.database.entities.map((e) => e.name).sort();
    assert.deepEqual(names, ["post", "user"]);
    const user = r.document.database.entities.find((e) => e.name === "user")!;
    assert.ok(user.fields.some((f) => f.name === "email" && f.unique));
    assert.ok(user.fields.some((f) => f.name === "id" && f.primary_key));
    // relation field "posts Post[]" is not a column
    assert.ok(!user.fields.some((f) => f.name === "posts"));
    // express routes extracted
    const paths = r.document.api.endpoints.map((e) => `${e.method} ${e.path}`);
    assert.ok(paths.includes("GET /health") && paths.includes("POST /posts"));
    assert.deepEqual(validateDocument(r.document), []);
  } finally { cleanup(); }
});
