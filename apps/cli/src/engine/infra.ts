// Infrastructure & deployment discovery (spec section 3, step 10). Reads the
// deployment configuration that is actually in the repo. No cloud APIs are called;
// nothing is executed.

import path from "node:path";
import { readTextSafe } from "./discovery.ts";
import { lineAt } from "../util/text.ts";
import type { DiscoveredFile, InfraFact } from "../types.ts";

export function discoverInfra(root: string, files: DiscoveredFile[]): InfraFact[] {
  const out: InfraFact[] = [];
  for (const f of files) {
    const base = path.basename(f.rel);
    const rel = f.rel;

    if (base === "Dockerfile" || /\.dockerfile$/i.test(base) || /^Dockerfile\./.test(base)) {
      const text = readTextSafe(f.abs);
      const from = text.match(/^FROM\s+(\S+)/im)?.[1];
      out.push({ kind: "dockerfile", name: path.dirname(rel) || ".", evidence: { path: rel, relationship: "container image build" }, detail: from ? `base ${from}` : undefined });
    }

    if (base === "docker-compose.yml" || base === "docker-compose.yaml" || /^docker-compose\..+\.ya?ml$/.test(base) || base === "compose.yml" || base === "compose.yaml") {
      const text = readTextSafe(f.abs);
      // top-level "services:" then 2-space-indented service names
      const svcBlock = text.split(/\n(?=\S)/).find((b) => /^services:/.test(b.trim()));
      if (svcBlock) {
        for (const sm of svcBlock.matchAll(/^\s{2}([A-Za-z0-9_.-]+):\s*$/gm)) {
          out.push({ kind: "compose_service", name: sm[1]!, evidence: { path: rel, symbol: sm[1]!, lineStart: lineAt(text, text.indexOf(sm[0])), relationship: "compose service" } });
        }
      }
    }

    if (/^\.github\/workflows\/.+\.ya?ml$/.test(rel)) {
      const text = readTextSafe(f.abs);
      const name = text.match(/^name:\s*(.+)$/m)?.[1]?.trim() || base;
      out.push({ kind: "ci", name, evidence: { path: rel, relationship: "GitHub Actions workflow" } });
    }

    if (base === "vercel.json") out.push({ kind: "vercel", name: "Vercel", evidence: { path: rel, relationship: "Vercel deployment config" } });
    if (base === "netlify.toml") out.push({ kind: "netlify", name: "Netlify", evidence: { path: rel, relationship: "Netlify deployment config" } });
    if (base === "Caddyfile" || /\.caddy$/.test(base)) out.push({ kind: "caddy", name: "Caddy", evidence: { path: rel, relationship: "Caddy reverse proxy" } });
    if (base === "nginx.conf" || /\.nginx$/.test(base)) out.push({ kind: "nginx", name: "nginx", evidence: { path: rel, relationship: "nginx config" } });

    if ((f.ext === ".yaml" || f.ext === ".yml") && /(^|\/)(k8s|kubernetes|deploy|manifests|charts)\//.test(rel)) {
      const text = readTextSafe(f.abs);
      const kind = text.match(/^kind:\s*(Deployment|StatefulSet|Service|Ingress|CronJob|DaemonSet)\b/m)?.[1];
      if (kind) out.push({ kind: "kubernetes", name: `${kind}`, evidence: { path: rel, symbol: kind, relationship: "Kubernetes manifest" } });
    }
  }
  // Deduplicate by kind+name
  const seen = new Set<string>();
  return out.filter((i) => { const k = i.kind + "|" + i.name; if (seen.has(k)) return false; seen.add(k); return true; });
}
