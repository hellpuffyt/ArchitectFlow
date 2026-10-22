"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Finding } from "@/lib/api";
import { useProject } from "@/lib/project-store";
import { nodeTypeInfo } from "@/lib/registry";
import { Badge, Button } from "@/components/ui";

const SECURITY_RULES = new Set(["missing-auth", "public-internal-component", "client-to-datastore", "unencrypted-boundary", "plaintext-protocol",
  "missing-secrets-management", "encryption-at-rest-unstated", "single-point-of-failure", "missing-observability", "missing-backup-plan", "unbounded-queue", "unbounded-retries"]);

/** Security & infrastructure summary derived from the saved design. */
export function SecurityView({ onShow }: { onShow: (f: Finding) => void }) {
  const { doc, project, head } = useProject();
  const [findings, setFindings] = useState<Finding[]>([]);
  useEffect(() => { if (project) api.findings(project.id).then((f) => setFindings(f.findings.filter((x) => SECURITY_RULES.has(x.rule)))).catch(() => setFindings([])); }, [project, head]);
  if (!doc) return null;
  const pub = doc.nodes.filter((n) => n.public ?? ["web_client", "mobile_client", "api_gateway", "load_balancer", "cdn", "waf"].includes(n.type));
  const secNodes = doc.nodes.filter((n) => ["security", "identity", "operations", "infrastructure"].includes(nodeTypeInfo(n.type).category));
  const protectedEps = doc.api.endpoints.filter((e) => e.auth !== "public").length;
  const unencrypted = doc.edges.filter((e) => e.encrypted !== true);
  return (
    <div className="mx-auto max-w-5xl space-y-5 p-8">
      <div>
        <h1 className="text-lg font-semibold">Security & infrastructure</h1>
        <p className="text-sm text-muted">A view over the saved design. It summarizes what the design states; it is not a security audit.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        {[["Publicly reachable", pub.length], ["Security/ops components", secNodes.length], ["Protected endpoints", `${protectedEps}/${doc.api.endpoints.length}`], ["Links not marked encrypted", unencrypted.length]].map(([l, v]) => (
          <div key={String(l)} className="rounded-xl border border-line bg-panel p-4"><p className="text-xs text-muted">{l}</p><p className="mt-1 text-2xl font-semibold">{v}</p></div>
        ))}
      </div>
      <section className="rounded-xl border border-line bg-panel p-4">
        <h2 className="mb-2 text-sm font-semibold">Security, identity, operations and infrastructure components</h2>
        {secNodes.length === 0 ? <p className="text-sm text-faint">None in the design.</p> : (
          <ul className="grid gap-1 text-sm sm:grid-cols-2">{secNodes.map((n) => <li key={n.id}>{n.label} <span className="text-faint">· {nodeTypeInfo(n.type).label}{n.technology ? ` · ${n.technology}` : ""}</span></li>)}</ul>
        )}
      </section>
      <section className="rounded-xl border border-line bg-panel p-4">
        <h2 className="mb-2 text-sm font-semibold">Deployment groups & boundaries</h2>
        {doc.groups.length === 0 ? <p className="text-sm text-faint">No groups. Select components on the canvas and press ⌘G to group them into a boundary.</p> : (
          <ul className="space-y-1 text-sm">{doc.groups.map((g) => <li key={g.id}><span className="font-medium">{g.label}</span> <Badge>{g.kind}</Badge> <span className="text-muted">{g.node_ids.map((id) => doc.nodes.find((n) => n.id === id)?.label ?? id).join(", ")}</span></li>)}</ul>
        )}
      </section>
      <section>
        <h2 className="mb-2 text-sm font-semibold">Security-relevant findings ({findings.length})</h2>
        <ul className="space-y-2">
          {findings.map((f) => (
            <li key={f.id} className="flex items-start gap-3 rounded-lg border border-line bg-panel p-3 text-sm">
              <Badge tone={f.severity === "error" ? "err" : f.severity === "warning" ? "warn" : "info"}>{f.severity}</Badge>
              <div className="flex-1"><p className="font-medium">{f.title}</p><p className="text-xs text-muted">{f.evidence} — {f.remediation}</p></div>
              {f.node_ids.length + f.edge_ids.length > 0 && <Button size="sm" variant="ghost" onClick={() => onShow(f)}>Show</Button>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
