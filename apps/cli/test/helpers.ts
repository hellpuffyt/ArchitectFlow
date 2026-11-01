import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** Build a throwaway git repo on disk from a {relPath: contents} map. */
export function makeRepo(files: Record<string, string>): { dir: string; cleanup: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "af-test-"));
  fs.mkdirSync(path.join(dir, ".git")); // so findRepoRoot stops here
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
  return { dir, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

export const MONOREPO: Record<string, string> = {
  "package.json": JSON.stringify({ name: "root", private: true, workspaces: ["apps/*", "packages/*"] }),
  "pnpm-lock.yaml": "lockfileVersion: 9",
  "apps/web/package.json": JSON.stringify({ name: "web", dependencies: { next: "15.0.0", react: "19.0.0" } }),
  "apps/web/app/layout.tsx": "export default function Layout({children}){return children}",
  "apps/web/app/users/route.ts": "export async function GET(){return Response.json([])}\nexport async function POST(){return Response.json({})}",
  "apps/web/lib/api.ts": "import { thing } from '../app/layout';\nexport const x = thing;",
  "apps/api/pyproject.toml": "[project]\nname='api'\ndependencies=['fastapi','sqlalchemy','alembic']",
  "apps/api/uv.lock": "version = 1",
  "apps/api/app/main.py": "from fastapi import FastAPI, Depends\nfrom .auth import current_user\napp = FastAPI()\n@app.get('/items')\ndef items():\n    return []\n@app.post('/items')\ndef create(user=Depends(current_user)):\n    return {}",
  "apps/api/app/auth.py": "import jwt\ndef current_user():\n    return {'role': 'ADMIN'}",
  "apps/api/app/models.py": "from sqlalchemy.orm import DeclarativeBase, mapped_column, Mapped\nclass Base(DeclarativeBase): pass\nclass User(Base):\n    __tablename__='users'\n    id: Mapped[str] = mapped_column(UUID, primary_key=True)\n    email: Mapped[str] = mapped_column(String, unique=True, nullable=False)\nclass Order(Base):\n    __tablename__='orders'\n    id = mapped_column(Integer, primary_key=True)\n    user_id = mapped_column(Integer, ForeignKey('users.id'))\n    total = mapped_column(Numeric)",
  "apps/api/migrations/versions/0001_init.py": "revision='0001'\ndown_revision=None",
  "packages/shared/package.json": JSON.stringify({ name: "shared" }),
  "Dockerfile": "FROM python:3.12\nCMD [\"uvicorn\",\"app.main:app\"]",
  "docker-compose.yml": "services:\n  api:\n    build: ./apps/api\n  db:\n    image: postgres:16\n",
  ".github/workflows/ci.yml": "name: CI\non: [push]\njobs:\n  test:\n    runs-on: ubuntu-latest",
  ".env": "SECRET_KEY=sk-super-secret-value-should-never-be-read-1234567890\nDATABASE_URL=postgres://u:p@h/db",
  ".architectflowignore": "packages/legacy/\n",
  "packages/legacy/old.py": "# should be ignored\nclass Legacy(Base):\n    __tablename__='legacy'\n    id = mapped_column(Integer, primary_key=True)",
};
