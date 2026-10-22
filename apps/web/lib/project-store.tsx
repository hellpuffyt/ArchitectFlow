"use client";
// Workspace state for one project: the editable document with undo/redo, autosave against the
// server's optimistic-concurrency check, and the selection shared by the workspaces.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ApiError, api } from "./api";
import type { ProjectDetail } from "./api";
import { initHistory, push, redo as redoH, replace, undo as undoH } from "./history";
import type { History } from "./history";
import type { ArchitectureDocument } from "./types";

export type SaveStatus = "loading" | "saved" | "dirty" | "saving" | "offline" | "conflict" | "invalid" | "error";

export interface Selection { nodes: string[]; edges: string[] }

interface Store {
  project: ProjectDetail | null;
  loadError: ApiError | null;
  doc: ArchitectureDocument | null;
  head: number;
  status: SaveStatus;
  saveError: ApiError | null;
  canUndo: boolean;
  canRedo: boolean;
  selection: Selection;
  setSelection: (s: Selection) => void;
  /** Apply an edit as one undoable step. */
  edit: (fn: (d: ArchitectureDocument) => ArchitectureDocument) => void;
  /** Start/stop a continuous gesture (drag): intermediate edits do not create undo steps. */
  beginGesture: () => void;
  transientEdit: (fn: (d: ArchitectureDocument) => ArchitectureDocument) => void;
  endGesture: () => void;
  undo: () => void;
  redo: () => void;
  saveNow: () => Promise<boolean>;
  /**
   * The head revision right now. Use it as the base of a server operation that runs after
   * `await saveNow()`: `head` captured by the render that started the handler is stale then.
   */
  currentHead: () => number;
  /** Adopt a document the server already saved (AI apply, restore). */
  adoptServerDocument: (doc: ArchitectureDocument, head: number) => void;
  /**
   * Run a server-side mutation (restore, apply, import). While it is pending the status shows
   * "Saving…", so the UI never shows "Saved" before the operation has actually landed.
   */
  serverOp: <T>(fn: () => Promise<T>) => Promise<T>;
  reloadLatest: () => Promise<void>;
  keepMine: () => Promise<void>;
  renameProject: (name: string) => Promise<void>;
}

const Ctx = createContext<Store | null>(null);
export function useProject(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useProject outside ProjectProvider");
  return s;
}

const AUTOSAVE_MS = 900;

export function ProjectProvider({ id, children }: { id: string; children: ReactNode }) {
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const [hist, setHist] = useState<History<ArchitectureDocument> | null>(null);
  const [head, setHead] = useState(0);
  const [saved, setSaved] = useState<ArchitectureDocument | null>(null);
  const [status, setStatus] = useState<SaveStatus>("loading");
  const [saveError, setSaveError] = useState<ApiError | null>(null);
  const [selection, setSelection] = useState<Selection>({ nodes: [], edges: [] });
  const [pendingOps, setPendingOps] = useState(0);
  const gestureBase = useRef<ArchitectureDocument | null>(null);
  const saving = useRef(false);
  const headRef = useRef(0);
  const doc = hist?.present ?? null;
  const docRef = useRef<ArchitectureDocument | null>(null);
  useEffect(() => { headRef.current = head; }, [head]);
  useEffect(() => { docRef.current = doc; }, [doc]);

  const onLoaded = useCallback((p: ProjectDetail) => {
    setProject(p);
    setHist(initHistory(p.document));
    setSaved(p.document);
    setHead(p.head_revision);
    headRef.current = p.head_revision;
    docRef.current = p.document;
    setStatus("saved");
    setSaveError(null);
  }, []);
  const load = useCallback(async () => {
    await api.getProject(id).then(onLoaded, (e) => setLoadError(e as ApiError));
  }, [id, onLoaded]);
  useEffect(() => {
    api.getProject(id).then(onLoaded, (e) => setLoadError(e as ApiError));
  }, [id, onLoaded]);

  const saveNow = useCallback(async (): Promise<boolean> => {
    const current = docRef.current;
    if (!current || saving.current) return false;
    if (current === saved) return true;
    saving.current = true;
    setStatus("saving");
    try {
      const r = await api.saveDocument(id, headRef.current, current, "autosave");
      setHead(r.head_revision);
      headRef.current = r.head_revision;
      setSaved(current);
      setSaveError(null);
      setStatus("saved");
      return true;
    } catch (e) {
      const err = e as ApiError;
      setSaveError(err);
      setStatus(err.status === 409 ? "conflict" : err.status === 422 ? "invalid" : err.status === 0 || err.status >= 500 ? "offline" : "error");
      return false;
    } finally {
      saving.current = false;
    }
  }, [id, saved]);

  // Debounced autosave whenever the document differs from the last saved snapshot.
  useEffect(() => {
    if (!doc || !saved || doc === saved) return;
    if (status === "conflict" || status === "invalid") return;
    if (gestureBase.current) return;
    const t = setTimeout(() => { void saveNow(); }, AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [doc, saved, status, saveNow]);

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (docRef.current && docRef.current !== saved) e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [saved]);

  const edit = useCallback((fn: (d: ArchitectureDocument) => ArchitectureDocument) => {
    setHist((h) => (h ? push(h, fn(h.present)) : h));
    if (status === "invalid") setStatus("dirty");
  }, [status]);
  const beginGesture = useCallback(() => { gestureBase.current = docRef.current; }, []);
  const transientEdit = useCallback((fn: (d: ArchitectureDocument) => ArchitectureDocument) => {
    setHist((h) => (h ? replace(h, fn(h.present)) : h));
  }, []);
  const endGesture = useCallback(() => {
    const base = gestureBase.current;
    gestureBase.current = null;
    setHist((h) => {
      if (!h || !base || h.present === base) return h;
      return { past: [...h.past, base].slice(-200), present: h.present, future: [] };
    });
  }, []);
  const currentHead = useCallback(() => headRef.current, []);
  const undo = useCallback(() => setHist((h) => (h ? undoH(h) : h)), []);
  const redo = useCallback(() => setHist((h) => (h ? redoH(h) : h)), []);

  const adoptServerDocument = useCallback((d: ArchitectureDocument, newHead: number) => {
    setHist((h) => (h ? push(h, d) : initHistory(d)));
    setSaved(d);
    setHead(newHead);
    headRef.current = newHead;
    setStatus("saved");
    setSaveError(null);
  }, []);

  const serverOp = useCallback(async <T,>(fn: () => Promise<T>): Promise<T> => {
    setPendingOps((n) => n + 1);
    try {
      return await fn();
    } finally {
      setPendingOps((n) => n - 1);
    }
  }, []);

  const reloadLatest = useCallback(async () => {
    setStatus("loading");
    await load();
  }, [load]);

  const keepMine = useCallback(async () => {
    // Explicit user choice: save the local version on top of the newer server revision.
    const p = await api.getProject(id);
    setHead(p.head_revision);
    headRef.current = p.head_revision;
    setSaved(p.document);
    setStatus("saved");
  }, [id]);

  const renameProject = useCallback(async (name: string) => {
    const p = await api.patchProject(id, { name });
    setProject((old) => (old ? { ...old, name: p.name } : old));
  }, [id]);

  // "dirty" is derived: the document differs from the last saved snapshot.
  const shownStatus: SaveStatus = pendingOps > 0 && (status === "saved" || status === "dirty") ? "saving"
    : status === "saved" && doc !== null && saved !== null && doc !== saved ? "dirty" : status;
  const value = useMemo<Store>(() => ({
    project, loadError, doc, head, status: shownStatus, saveError,
    canUndo: (hist?.past.length ?? 0) > 0, canRedo: (hist?.future.length ?? 0) > 0,
    selection, setSelection, edit, beginGesture, transientEdit, endGesture, undo, redo, saveNow,
    currentHead, adoptServerDocument, serverOp, reloadLatest, keepMine, renameProject,
  }), [project, loadError, doc, head, shownStatus, saveError, hist, selection, edit, beginGesture, transientEdit,
    endGesture, undo, redo, saveNow, currentHead, adoptServerDocument, serverOp, reloadLatest, keepMine, renameProject]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
