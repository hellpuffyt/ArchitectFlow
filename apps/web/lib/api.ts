// Browser client for the ArchitectFlow API. All requests go to same-origin /api/* (proxied
// to FastAPI by next.config.ts), so the session cookie is httpOnly and never readable here.
import type { ArchitectureDocument, PromptSettings } from "./types";

let csrfToken = "";
export function setCsrfToken(token: string) {
  csrfToken = token;
}

export interface FieldError { path: string; message: string }

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public errors: FieldError[] = [],
    public detail: unknown = null,
  ) {
    super(message);
  }
}

function describe(status: number, detail: unknown): { message: string; errors: FieldError[] } {
  if (typeof detail === "string") return { message: detail, errors: [] };
  if (Array.isArray(detail)) {
    // FastAPI request validation errors
    const errors = detail.map((d: { loc?: unknown[]; msg?: string }) => ({
      path: (d.loc ?? []).slice(1).join("."),
      message: d.msg ?? "invalid",
    }));
    return { message: "Some fields are invalid.", errors };
  }
  if (detail && typeof detail === "object") {
    const obj = detail as { message?: string; errors?: FieldError[] };
    return { message: obj.message ?? `Request failed (${status})`, errors: obj.errors ?? [] };
  }
  return { message: `Request failed (${status})`, errors: [] };
}

export async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: {
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        ...(method !== "GET" ? { "x-csrf-token": csrfToken } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, "Cannot reach the ArchitectFlow server. Check your connection; nothing was saved.");
  }
  if (res.status === 204) return undefined as T;
  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }
  if (!res.ok) {
    const detail = (payload as { detail?: unknown } | null)?.detail ?? null;
    if (res.status >= 500 && detail === null) {
      throw new ApiError(res.status, "The server is unavailable (" + res.status + "). Nothing was saved.");
    }
    const { message, errors } = describe(res.status, detail);
    throw new ApiError(res.status, message, errors, detail);
  }
  return payload as T;
}

export interface Me {
  user: { id: string; email: string };
  csrf_token: string;
  ai: { provider: string; mode: "example" | "live"; notice: string };
}
export interface ProjectSummary {
  id: string;
  name: string;
  description: string;
  head_revision: number;
  archived: boolean;
  created_at: string;
  updated_at: string;
}
export interface ProjectDetail extends ProjectSummary { document: ArchitectureDocument }
export interface RevisionSummary { number: number; source: string; message: string; created_at: string }
export interface Finding {
  id: string;
  rule: string;
  severity: "error" | "warning" | "info";
  kind: "schema_error" | "recommendation";
  title: string;
  explanation: string;
  evidence: string;
  remediation: string;
  node_ids: string[];
  edge_ids: string[];
}
export interface ChangeSet {
  id: string;
  kind: "generate" | "edit";
  request: string;
  provider: string;
  mode: "example" | "live";
  explanation: string;
  questions: string[];
  operations: unknown[];
  summary: { lines: string[]; large: boolean; added_nodes: number; removed_nodes: number };
  findings: Finding[];
  status: "pending" | "applied" | "rejected" | "stale";
  base_revision: number;
  applied_revision: number | null;
  created_at: string;
}
export interface PromptResult {
  id?: string;
  version?: number;
  source_revision: number;
  content: string;
  characters: number;
  words: number;
  approx_tokens: number;
  outdated?: boolean;
  created_at?: string;
  mode?: string;
}

const enc = encodeURIComponent;
export const api = {
  me: () => request<Me>("GET", "/api/auth/me"),
  signup: (email: string, password: string) =>
    request<Me>("POST", "/api/auth/signup", { email, password }),
  login: (email: string, password: string) =>
    request<Me>("POST", "/api/auth/login", { email, password }),
  logout: () => request<void>("POST", "/api/auth/logout"),
  listProjects: (q = "", archived = false) =>
    request<ProjectSummary[]>("GET", `/api/projects?q=${enc(q)}&archived=${archived}`),
  createProject: (name: string, description = "") =>
    request<ProjectSummary>("POST", "/api/projects", { name, description }),
  getProject: (id: string) => request<ProjectDetail>("GET", `/api/projects/${enc(id)}`),
  patchProject: (id: string, patch: Partial<Pick<ProjectSummary, "name" | "description" | "archived">>) =>
    request<ProjectSummary>("PATCH", `/api/projects/${enc(id)}`, patch),
  duplicateProject: (id: string) => request<ProjectSummary>("POST", `/api/projects/${enc(id)}/duplicate`),
  deleteProject: (id: string) => request<void>("DELETE", `/api/projects/${enc(id)}`),
  saveDocument: (id: string, base_revision: number, document: ArchitectureDocument,
                 source: "manual" | "autosave" | "import" = "autosave", message = "") =>
    request<{ head_revision: number; saved_at: string }>("PUT", `/api/projects/${enc(id)}/document`,
      { base_revision, document, source, message }),
  validateDocument: (id: string, document: unknown) =>
    request<{ valid: boolean; findings: Finding[]; nodes: number; edges: number }>(
      "POST", `/api/projects/${enc(id)}/validate-document`, document),
  revisions: (id: string) => request<RevisionSummary[]>("GET", `/api/projects/${enc(id)}/revisions`),
  revision: (id: string, n: number) =>
    request<RevisionSummary & { document: ArchitectureDocument }>("GET", `/api/projects/${enc(id)}/revisions/${n}`),
  restore: (id: string, n: number, base_revision: number) =>
    request<{ head_revision: number; document: ArchitectureDocument }>(
      "POST", `/api/projects/${enc(id)}/revisions/${n}/restore`, { base_revision }),
  findings: (id: string) =>
    request<{ revision: number; findings: Finding[]; counts: Record<string, number> }>(
      "GET", `/api/projects/${enc(id)}/findings`),
  generate: (id: string, vision: string, base_revision: number) =>
    request<ChangeSet>("POST", `/api/projects/${enc(id)}/ai/generate`, { vision, base_revision }),
  edit: (id: string, req: string, base_revision: number) =>
    request<ChangeSet>("POST", `/api/projects/${enc(id)}/ai/edit`, { request: req, base_revision }),
  changesets: (id: string) => request<ChangeSet[]>("GET", `/api/projects/${enc(id)}/changesets`),
  applyChangeset: (id: string, cs: string, confirm_large = false) =>
    request<{ head_revision: number; document: ArchitectureDocument; changeset: ChangeSet }>(
      "POST", `/api/projects/${enc(id)}/changesets/${enc(cs)}/apply`, { confirm_large }),
  rejectChangeset: (id: string, cs: string) =>
    request<ChangeSet>("POST", `/api/projects/${enc(id)}/changesets/${enc(cs)}/reject`),
  previewPrompt: (id: string, settings: PromptSettings) =>
    request<PromptResult>("POST", `/api/projects/${enc(id)}/prompts/preview`, settings),
  createPrompt: (id: string, settings: PromptSettings) =>
    request<PromptResult>("POST", `/api/projects/${enc(id)}/prompts`, settings),
  prompts: (id: string) => request<PromptResult[]>("GET", `/api/projects/${enc(id)}/prompts`),
};
