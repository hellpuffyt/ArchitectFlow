// Language, framework, package-manager, build-system and workspace detection
// (spec section 3, steps 1-2). Everything is evidence-backed: a framework is only
// reported when a manifest actually declares it, never guessed from file names.

import path from "node:path";
import { readTextSafe } from "./discovery.ts";
import { lineAt, tryJson, depNames } from "../util/text.ts";
import type { DiscoveredFile, DetectedStack, Evidence, Workspace } from "../types.ts";
import type { NodeType } from "../registry.ts";

const LANG_BY_EXT: Record<string, string> = {
  ".ts": "TypeScript", ".tsx": "TypeScript", ".mts": "TypeScript", ".cts": "TypeScript",
  ".js": "JavaScript", ".jsx": "JavaScript", ".mjs": "JavaScript", ".cjs": "JavaScript",
  ".py": "Python", ".go": "Go", ".rs": "Rust", ".java": "Java", ".kt": "Kotlin",
  ".rb": "Ruby", ".php": "PHP", ".cs": "C#", ".swift": "Swift",
  ".c": "C", ".h": "C", ".cpp": "C++", ".cc": "C++", ".hpp": "C++", ".scala": "Scala",
};

const LOCKFILE_PM: Record<string, string> = {
  "package-lock.json": "npm", "yarn.lock": "yarn", "pnpm-lock.yaml": "pnpm",
  "bun.lockb": "bun", "uv.lock": "uv", "poetry.lock": "poetry",
  "Pipfile.lock": "pipenv", "Cargo.lock": "cargo", "go.sum": "go modules",
  "Gemfile.lock": "bundler", "composer.lock": "composer",
};

const BUILD_FILES: Record<string, string> = {
  "Dockerfile": "Docker", "docker-compose.yml": "Docker Compose", "docker-compose.yaml": "Docker Compose",
  "Makefile": "Make", "turbo.json": "Turborepo", "nx.json": "Nx", "lerna.json": "Lerna",
  "next.config.js": "Next.js", "next.config.ts": "Next.js", "next.config.mjs": "Next.js",
  "vite.config.ts": "Vite", "vite.config.js": "Vite", "webpack.config.js": "Webpack",
  "pom.xml": "Maven", "build.gradle": "Gradle", "build.gradle.kts": "Gradle",
};

// name in a JS manifest dep -> framework label
const JS_FRAMEWORKS: Record<string, string> = {
  next: "Next.js", react: "React", "react-dom": "React", vue: "Vue", svelte: "Svelte",
  "@angular/core": "Angular", express: "Express", fastify: "Fastify", "@nestjs/core": "NestJS",
  koa: "Koa", "@hapi/hapi": "Hapi", "@remix-run/react": "Remix", astro: "Astro",
  "@prisma/client": "Prisma", typeorm: "TypeORM", sequelize: "Sequelize", mongoose: "Mongoose",
  "drizzle-orm": "Drizzle", "socket.io": "Socket.IO", "@apollo/server": "Apollo",
};

// substring in a Python requirement -> framework label
const PY_FRAMEWORKS: Record<string, string> = {
  fastapi: "FastAPI", django: "Django", flask: "Flask", starlette: "Starlette",
  sqlalchemy: "SQLAlchemy", alembic: "Alembic", celery: "Celery", pydantic: "Pydantic",
  tornado: "Tornado", aiohttp: "aiohttp", strawberry: "Strawberry GraphQL",
};

function manifestName(file: string, text: string): string {
  const base = path.basename(file);
  if (base === "package.json") return (tryJson<Record<string, unknown>>(text)?.name as string) || path.dirname(file) || "web";
  if (base === "go.mod") return text.match(/^module\s+(\S+)/m)?.[1]?.split("/").pop() || "go-module";
  const m = text.match(/name\s*=\s*["']([^"']+)["']/);
  return m?.[1] || path.dirname(file) || base;
}

export function detectStack(root: string, files: DiscoveredFile[]): DetectedStack {
  const byName = new Map<string, DiscoveredFile[]>();
  for (const f of files) {
    const base = path.basename(f.rel);
    (byName.get(base) ?? byName.set(base, []).get(base)!).push(f);
  }

  // Languages
  const langCount = new Map<string, number>();
  for (const f of files) {
    const lang = LANG_BY_EXT[f.ext];
    if (lang) langCount.set(lang, (langCount.get(lang) ?? 0) + 1);
  }
  const languages = [...langCount.entries()]
    .map(([name, filesN]) => ({ name, files: filesN }))
    .sort((a, b) => b.files - a.files);

  // Package managers + build systems
  const packageManagers = new Set<string>();
  const buildSystems = new Set<string>();
  for (const f of files) {
    const base = path.basename(f.rel);
    if (LOCKFILE_PM[base]) packageManagers.add(LOCKFILE_PM[base]!);
    if (BUILD_FILES[base]) buildSystems.add(BUILD_FILES[base]!);
  }

  // Workspaces (one per manifest) + frameworks
  const manifestBases = ["package.json", "pyproject.toml", "go.mod", "Cargo.toml", "pom.xml", "build.gradle", "Gemfile", "composer.json", "requirements.txt"];
  const workspaces: Workspace[] = [];
  const frameworks: { name: string; evidence: Evidence }[] = [];
  const seenFw = new Set<string>();

  for (const base of manifestBases) {
    for (const f of byName.get(base) ?? []) {
      // Skip nested manifests inside already-excluded dirs (discovery handled that).
      const text = readTextSafe(f.abs);
      const dir = path.dirname(f.rel) === "." ? "" : path.dirname(f.rel);
      if (base === "package.json") {
        const pkg = tryJson<Record<string, unknown>>(text);
        // A package.json without a name that is only config (e.g. tsconfig holder) still counts as a workspace boundary.
        workspaces.push({ rel: dir, manifest: f.rel, name: manifestName(f.rel, text) });
        const deps = depNames(pkg);
        for (const [dep, label] of Object.entries(JS_FRAMEWORKS)) {
          if (deps.has(dep) && !seenFw.has(label)) {
            seenFw.add(label);
            const idx = text.indexOf(`"${dep}"`);
            frameworks.push({ name: label, evidence: { path: f.rel, symbol: dep, lineStart: idx >= 0 ? lineAt(text, idx) : undefined, relationship: "declared dependency" } });
          }
        }
      } else if (base === "pyproject.toml" || base === "requirements.txt") {
        workspaces.push({ rel: dir, manifest: f.rel, name: manifestName(f.rel, text) });
        const lower = text.toLowerCase();
        for (const [dep, label] of Object.entries(PY_FRAMEWORKS)) {
          const idx = lower.indexOf(dep);
          if (idx >= 0 && !seenFw.has(label)) {
            seenFw.add(label);
            frameworks.push({ name: label, evidence: { path: f.rel, symbol: dep, lineStart: lineAt(text, idx), relationship: "declared dependency" } });
          }
        }
      } else {
        workspaces.push({ rel: dir, manifest: f.rel, name: manifestName(f.rel, text) });
      }
    }
  }

  // Deduplicate workspaces by directory, preferring an app manifest.
  const wsByDir = new Map<string, Workspace>();
  for (const w of workspaces) if (!wsByDir.has(w.rel)) wsByDir.set(w.rel, w);
  const uniqueWorkspaces = [...wsByDir.values()].sort((a, b) => a.rel.localeCompare(b.rel));

  // Monorepo heuristic: a root package.json "workspaces" field, or >1 workspace dir.
  let monorepo = uniqueWorkspaces.filter((w) => w.rel !== "").length >= 1 && uniqueWorkspaces.length > 1;
  const rootPkg = (byName.get("package.json") ?? []).find((f) => path.dirname(f.rel) === ".");
  if (rootPkg) {
    const pkg = tryJson<Record<string, unknown>>(readTextSafe(rootPkg.abs));
    if (pkg && (Array.isArray(pkg.workspaces) || (pkg.workspaces && typeof pkg.workspaces === "object"))) monorepo = true;
  }
  if ((byName.get("pnpm-workspace.yaml") ?? []).length) monorepo = true;

  return {
    languages,
    packageManagers: [...packageManagers].sort(),
    buildSystems: [...buildSystems].sort(),
    frameworks,
    workspaces: uniqueWorkspaces,
    monorepo,
  };
}

// Integration/service dependency detection from manifest dependencies.
const INTEGRATION_DEPS: { match: RegExp; name: string; category: NodeType }[] = [
  { match: /^(ioredis|redis|@upstash\/redis)$/, name: "Redis", category: "cache" },
  { match: /redis/i, name: "Redis", category: "cache" },
  { match: /(pg|postgres|psycopg|asyncpg)/i, name: "PostgreSQL", category: "database" },
  { match: /(mysql|mysql2)/i, name: "MySQL", category: "database" },
  { match: /(mongodb|mongoose|pymongo|motor)/i, name: "MongoDB", category: "database" },
  { match: /(elasticsearch|@elastic|opensearch)/i, name: "Elasticsearch", category: "search_index" },
  { match: /(amqplib|kafkajs|pika|aio-pika|confluent-kafka|@nestjs\/microservices)/i, name: "Message broker", category: "message_broker" },
  { match: /(aws-sdk|@aws-sdk|boto3|minio|@google-cloud\/storage)/i, name: "Object storage / cloud SDK", category: "object_storage" },
  { match: /(stripe)/i, name: "Stripe", category: "external_api" },
  { match: /(twilio)/i, name: "Twilio", category: "external_api" },
  { match: /(@sendgrid|resend|nodemailer|postmark)/i, name: "Email provider", category: "external_api" },
  { match: /(openai|@anthropic|anthropic|cohere|@google\/generative-ai)/i, name: "LLM provider", category: "external_api" },
  { match: /(prom-client|opentelemetry|@sentry|sentry-sdk|datadog)/i, name: "Observability", category: "observability" },
];

export function detectIntegrations(root: string, files: DiscoveredFile[]): { name: string; category: NodeType; evidence: Evidence }[] {
  const out: { name: string; category: NodeType; evidence: Evidence }[] = [];
  const seen = new Set<string>();
  for (const f of files) {
    const base = path.basename(f.rel);
    const isJs = base === "package.json";
    const isPy = base === "pyproject.toml" || base === "requirements.txt";
    if (!isJs && !isPy) continue;
    const text = readTextSafe(f.abs);
    const deps = isJs ? depNames(tryJson<Record<string, unknown>>(text)) : new Set(text.split(/\r?\n/).map((l) => l.split(/[=<>~!\s]/)[0]?.trim() || "").filter(Boolean));
    for (const dep of deps) {
      for (const rule of INTEGRATION_DEPS) {
        if (rule.match.test(dep) && !seen.has(rule.name)) {
          seen.add(rule.name);
          const idx = text.indexOf(dep);
          out.push({ name: rule.name, category: rule.category, evidence: { path: f.rel, symbol: dep, lineStart: idx >= 0 ? lineAt(text, idx) : undefined, relationship: "declared dependency" } });
        }
      }
    }
  }
  return out;
}
