"use client";
import { useEffect, useState } from "react";
import { Ban, Download, Link2 } from "lucide-react";
import { ApiError, api } from "@/lib/api";
import type { ExportFormatInfo, ShareInfo } from "@/lib/api";
import { useProject } from "@/lib/project-store";
import { Badge, Button, ErrorBox, Select } from "@/components/ui";

/** Server-rendered exports of the saved head revision, plus read-only share links. */
export function ExportsPanel() {
  const { project, head } = useProject();
  const [formats, setFormats] = useState<ExportFormatInfo[]>([]);
  const [shares, setShares] = useState<ShareInfo[]>([]);
  const [created, setCreated] = useState<ShareInfo | null>(null);
  const [hours, setHours] = useState(72);
  const [error, setError] = useState<ApiError | null>(null);
  useEffect(() => {
    if (!project) return;
    api.exportFormats(project.id).then(setFormats, (e) => setError(e as ApiError));
    api.shares(project.id).then(setShares, () => setShares([]));
  }, [project, head]);
  if (!project) return null;
  async function share() {
    try {
      const s = await api.createShare(project!.id, hours);
      setCreated(s);
      setShares(await api.shares(project!.id));
    } catch (e) { setError(e as ApiError); }
  }
  async function revoke(id: string) {
    try { await api.revokeShare(project!.id, id); setShares(await api.shares(project!.id)); if (created?.id === id) setCreated(null); } catch (e) { setError(e as ApiError); }
  }
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return (
    <section className="space-y-5">
      {error && <ErrorBox message={error.message} />}
      <div>
        <h2 className="mb-2 text-sm font-semibold">Exports (revision {head})</h2>
        <p className="mb-2 text-xs text-muted">Derived views of the saved design. Only JSON and the project bundle can be imported back; diagrams and specs are one-way.</p>
        <div className="grid gap-1.5 sm:grid-cols-3" aria-label="Export formats">
          {formats.map((f) => (
            <a key={f.key} href={api.exportUrl(project.id, f.key)} download data-testid={`export-${f.key}`}
              className="flex items-center gap-2 rounded-md border border-line bg-panel px-2.5 py-1.5 text-xs text-muted hover:border-line-strong hover:text-fg">
              <Download size={12} /> {f.label} {f.round_trip && <Badge tone="ok">re-importable</Badge>}
            </a>
          ))}
        </div>
      </div>
      <div>
        <h2 className="mb-2 text-sm font-semibold">Read-only share links</h2>
        <p className="mb-2 text-xs text-muted">Anyone with the link can view the current design (not edit, not export). Links expire and can be revoked. Projects stay private otherwise.</p>
        <div className="flex items-center gap-2">
          <Select aria-label="Link expiry" className="w-40" value={String(hours)} onChange={(e) => setHours(Number(e.target.value))}>
            <option value="1">1 hour</option><option value="24">1 day</option><option value="72">3 days</option><option value="168">7 days</option><option value="720">30 days</option>
          </Select>
          <Button onClick={() => void share()}><Link2 size={13} /> Create link</Button>
        </div>
        {created?.path && (
          <p className="mt-2 rounded border border-ok/30 bg-ok/10 p-2 text-xs text-ok" role="status">
            Copy this link now — it is shown only once: <code data-testid="share-url" className="break-all">{origin}{created.path}</code>
          </p>
        )}
        <ul className="mt-2 space-y-1 text-xs" aria-label="Share links">
          {shares.map((s) => (
            <li key={s.id} className="flex items-center gap-2">
              <Badge tone={s.state === "active" ? "ok" : "neutral"}>{s.state}</Badge>
              <span className="text-muted">expires {new Date(s.expires_at).toLocaleString()}</span>
              {s.state === "active" && <Button size="sm" variant="ghost" onClick={() => void revoke(s.id)}><Ban size={12} /> Revoke</Button>}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
