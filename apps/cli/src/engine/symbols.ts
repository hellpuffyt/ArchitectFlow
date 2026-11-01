// Symbol & relationship extraction (spec section 3, steps 3-5, 11-12). Lightweight,
// deterministic parsing of imports, entry points and HTTP routes. It traces REAL
// imports and route declarations with file+line evidence — it never infers runtime
// architecture from the dependency list alone (spec: "Do not mistake dependencies
// in package.json for actual runtime architecture").

import fs from "node:fs";
import path from "node:path";
import { readTextSafe } from "./discovery.ts";
import { lineAt } from "../util/text.ts";
import type { DiscoveredFile, ImportEdge, EntryPoint, RouteFact, HttpMethod } from "../types.ts";

const JS_EXT = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"];
const CODE_EXT = new Set([...JS_EXT, ".py", ".go", ".rb", ".php", ".java"]);

function resolveJsImport(fromAbs: string, spec: string, fileSet: Set<string>, root: string): string | null {
  if (!spec.startsWith(".")) return null; // bare specifier = external dependency
  const baseAbs = path.resolve(path.dirname(fromAbs), spec);
  const candidates: string[] = [];
  for (const ext of JS_EXT) candidates.push(baseAbs + ext);
  for (const ext of JS_EXT) candidates.push(path.join(baseAbs, "index" + ext));
  candidates.push(baseAbs);
  for (const c of candidates) {
    const rel = path.relative(root, c).split(path.sep).join("/");
    if (fileSet.has(rel)) return rel;
  }
  return null;
}

export function extractImports(root: string, files: DiscoveredFile[]): ImportEdge[] {
  const fileSet = new Set(files.map((f) => f.rel));
  const edges: ImportEdge[] = [];
  const reJs = /(?:import\s+[^'"]*?from\s*|import\s*|require\s*\(\s*|import\s*\(\s*)['"]([^'"]+)['"]/g;
  const rePyFrom = /^\s*from\s+(\.*[\w.]+)\s+import\s+/gm;
  const rePyImport = /^\s*import\s+([\w.]+)/gm;

  for (const f of files) {
    if (!CODE_EXT.has(f.ext)) continue;
    const text = readTextSafe(f.abs);
    if (!text) continue;
    if (JS_EXT.includes(f.ext)) {
      let m: RegExpExecArray | null;
      while ((m = reJs.exec(text))) {
        const spec = m[1]!;
        edges.push({ fromRel: f.rel, toRel: resolveJsImport(f.abs, spec, fileSet, root), specifier: spec, line: lineAt(text, m.index) });
      }
    } else if (f.ext === ".py") {
      let m: RegExpExecArray | null;
      while ((m = rePyFrom.exec(text))) {
        edges.push({ fromRel: f.rel, toRel: resolvePyImport(f.rel, m[1]!, fileSet), specifier: m[1]!, line: lineAt(text, m.index) });
      }
      while ((m = rePyImport.exec(text))) {
        edges.push({ fromRel: f.rel, toRel: resolvePyImport(f.rel, m[1]!, fileSet), specifier: m[1]!, line: lineAt(text, m.index) });
      }
    }
  }
  return edges;
}

function resolvePyImport(fromRel: string, spec: string, fileSet: Set<string>): string | null {
  if (spec.startsWith(".")) {
    // relative import: resolve against the current package directory
    const dots = spec.match(/^\.+/)![0].length;
    let dir = path.dirname(fromRel);
    for (let i = 1; i < dots; i++) dir = path.dirname(dir);
    const rest = spec.slice(dots).replace(/\./g, "/");
    const base = rest ? path.join(dir, rest) : dir;
    for (const cand of [base + ".py", path.join(base, "__init__.py")]) {
      const rel = cand.split(path.sep).join("/");
      if (fileSet.has(rel)) return rel;
    }
    return null;
  }
  // absolute import: try to map the top package onto a repo path
  const asPath = spec.replace(/\./g, "/");
  for (const cand of [asPath + ".py", path.join(asPath, "__init__.py")]) {
    const rel = cand.split(path.sep).join("/");
    if (fileSet.has(rel)) return rel;
  }
  return null; // external / stdlib / unresolved
}

export function detectEntryPoints(root: string, files: DiscoveredFile[]): EntryPoint[] {
  const out: EntryPoint[] = [];
  const relSet = new Set(files.map((f) => f.rel));

  // Next.js / app-router / pages-router frontends
  for (const f of files) {
    if (/(^|\/)app\/layout\.(tsx|jsx|ts|js)$/.test(f.rel) || /(^|\/)pages\/_app\.(tsx|jsx|ts|js)$/.test(f.rel)) {
      out.push({ rel: f.rel, kind: "frontend", framework: "Next.js", evidence: { path: f.rel, relationship: "Next.js application entry" } });
    }
  }

  for (const f of files) {
    const base = path.basename(f.rel);
    if (f.ext === ".py") {
      const text = readTextSafe(f.abs);
      if (!text) continue;
      let idx = text.search(/\bFastAPI\s*\(/);
      if (idx >= 0) out.push({ rel: f.rel, kind: "backend", framework: "FastAPI", evidence: { path: f.rel, symbol: "FastAPI()", lineStart: lineAt(text, idx), relationship: "ASGI application instance" } });
      idx = text.search(/\bFlask\s*\(\s*__name__/);
      if (idx >= 0) out.push({ rel: f.rel, kind: "backend", framework: "Flask", evidence: { path: f.rel, symbol: "Flask(__name__)", lineStart: lineAt(text, idx), relationship: "WSGI application instance" } });
      if (base === "manage.py") out.push({ rel: f.rel, kind: "backend", framework: "Django", evidence: { path: f.rel, symbol: "manage.py", relationship: "Django management entry" } });
      if (base === "celery.py" || /\bCelery\s*\(/.test(text)) out.push({ rel: f.rel, kind: "worker", framework: "Celery", evidence: { path: f.rel, symbol: "Celery()", relationship: "task worker entry" } });
      if (/if\s+__name__\s*==\s*["']__main__["']/.test(text) && /argparse|click|typer/.test(text)) out.push({ rel: f.rel, kind: "cli", evidence: { path: f.rel, relationship: "CLI __main__ entry" } });
    }
    if (base === "package.json") {
      const text = readTextSafe(f.abs);
      try {
        const pkg = JSON.parse(text) as { main?: string; bin?: unknown; scripts?: Record<string, string> };
        const dir = path.dirname(f.rel) === "." ? "" : path.dirname(f.rel);
        if (pkg.bin) out.push({ rel: f.rel, kind: "cli", evidence: { path: f.rel, symbol: "bin", relationship: "package executable" } });
        void dir; void relSet;
      } catch { /* ignore */ }
    }
  }
  // Deduplicate by rel+kind
  const seen = new Set<string>();
  return out.filter((e) => { const k = e.rel + "|" + e.kind; if (seen.has(k)) return false; seen.add(k); return true; });
}

// --- HTTP routes ----------------------------------------------------------

const HTTP_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);

function pushRoute(out: RouteFact[], method: string, p: string, framework: string, ev: RouteFact["evidence"], auth?: RouteFact["auth"]) {
  const M = method.toUpperCase();
  if (!HTTP_METHODS.has(M)) return;
  out.push({ method: M as HttpMethod, path: p, framework, evidence: ev, auth });
}

export function extractRoutes(root: string, files: DiscoveredFile[]): RouteFact[] {
  const out: RouteFact[] = [];
  for (const f of files) {
    const text = f.ext === ".py" || JS_EXT.includes(f.ext) ? readTextSafe(f.abs) : "";
    if (!text) continue;

    if (f.ext === ".py") {
      // FastAPI / APIRouter: @router.get("/path"  or  @app.post("/path"
      const reFast = /@(\w+)\.(get|post|put|patch|delete)\s*\(\s*["'`]([^"'`]+)["'`]([^)]*)/gi;
      let m: RegExpExecArray | null;
      while ((m = reFast.exec(text))) {
        const tail = m[4] ?? "";
        const auth = /Depends\s*\(\s*[^)]*(current|auth|user|require|principal)/i.test(tail) ? "authenticated" : undefined;
        pushRoute(out, m[2]!, m[3]!, "FastAPI", { path: f.rel, symbol: `@${m[1]}.${m[2]}`, lineStart: lineAt(text, m.index), relationship: "route declaration" }, auth);
      }
      // Flask: @app.route("/path", methods=["GET","POST"])
      const reFlask = /@\w+\.route\s*\(\s*["'`]([^"'`]+)["'`]([^)]*)\)/g;
      while ((m = reFlask.exec(text))) {
        const methods = [...(m[2] ?? "").matchAll(/["'`](GET|POST|PUT|PATCH|DELETE)["'`]/gi)].map((x) => x[1]!);
        const list = methods.length ? methods : ["GET"];
        for (const mm of list) pushRoute(out, mm, m[1]!, "Flask", { path: f.rel, symbol: "@route", lineStart: lineAt(text, m.index), relationship: "route declaration" });
      }
      // Django urls.py: path("route/", view) / re_path(...)
      if (path.basename(f.rel) === "urls.py") {
        const reDj = /\b(?:path|re_path)\s*\(\s*["'`]([^"'`]*)["'`]/g;
        while ((m = reDj.exec(text))) pushRoute(out, "GET", "/" + m[1]!, "Django", { path: f.rel, symbol: "urlpatterns", lineStart: lineAt(text, m.index), relationship: "URL pattern" });
      }
    } else {
      // Express / Koa: app.get("/path"  router.post('/path'
      const reExpress = /\b(?:app|router|r|api)\.(get|post|put|patch|delete)\s*\(\s*["'`]([^"'`]+)["'`]/gi;
      let m: RegExpExecArray | null;
      while ((m = reExpress.exec(text))) {
        pushRoute(out, m[1]!, m[2]!, "Express", { path: f.rel, symbol: `.${m[1]}()`, lineStart: lineAt(text, m.index), relationship: "route handler" });
      }
      // NestJS: @Get("path") decorators (controller prefix not resolved -> relative path noted)
      const reNest = /@(Get|Post|Put|Patch|Delete)\s*\(\s*["'`]?([^"'`)]*)["'`]?\s*\)/g;
      while ((m = reNest.exec(text))) {
        if (/@(Controller|Injectable|Module)/.test(text)) pushRoute(out, m[1]!, "/" + (m[2] || ""), "NestJS", { path: f.rel, symbol: `@${m[1]}`, lineStart: lineAt(text, m.index), relationship: "controller route" });
      }
      // Next.js app-router API: app/**/route.ts exporting GET/POST/...
      if (/(^|\/)route\.(ts|js|tsx|jsx)$/.test(f.rel) && /\bapp\//.test(f.rel)) {
        const seg = f.rel.replace(/.*?\bapp\//, "/").replace(/\/route\.(ts|js|tsx|jsx)$/, "");
        const routePath = seg.replace(/\/\([^)]+\)/g, "").replace(/\/+/g, "/") || "/";
        const reExport = /export\s+(?:async\s+)?(?:function|const)\s+(GET|POST|PUT|PATCH|DELETE)\b/g;
        while ((m = reExport.exec(text))) pushRoute(out, m[1]!, routePath, "Next.js Route Handler", { path: f.rel, symbol: `export ${m[1]}`, lineStart: lineAt(text, m.index), relationship: "app-router API route" });
      }
    }
  }
  // Deduplicate identical method+path+file
  const seen = new Set<string>();
  return out.filter((r) => { const k = `${r.method} ${r.path} ${r.evidence.path}`; if (seen.has(k)) return false; seen.add(k); return true; });
}
