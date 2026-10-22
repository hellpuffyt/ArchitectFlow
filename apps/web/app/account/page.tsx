"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Download, Trash2 } from "lucide-react";
import { ApiError, api } from "@/lib/api";
import { SessionProvider, useSession } from "@/lib/session";
import { Button, Dialog, ErrorBox, Field, Input, Spinner } from "@/components/ui";

export default function AccountPage() {
  return <SessionProvider><Account /></SessionProvider>;
}

function Account() {
  const { me } = useSession();
  const router = useRouter();
  const [error, setError] = useState<ApiError | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [password, setPassword] = useState("");
  if (!me) return <div className="flex h-screen items-center justify-center"><Spinner /></div>;
  async function exportData() {
    try {
      const data = await api.exportAccount();
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = "architectflow-account-export.json";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) { setError(e as ApiError); }
  }
  async function del() {
    try { await api.deleteAccount(password); router.replace("/"); } catch (e) { setError(e as ApiError); setConfirm(false); }
  }
  return (
    <main className="mx-auto max-w-2xl space-y-6 p-8">
      <Link href="/projects" className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg"><ArrowLeft size={14} /> Projects</Link>
      <h1 className="text-xl font-semibold">Account</h1>
      <p className="text-sm text-muted">Signed in as {me.user.email}.</p>
      {error && <ErrorBox message={error.message} />}
      <section className="rounded-xl border border-line bg-panel p-5">
        <h2 className="font-medium">Your data</h2>
        <p className="mt-1 text-sm text-muted">Download every project, revision and generated prompt stored for your account as JSON.</p>
        <Button className="mt-3" onClick={() => void exportData()}><Download size={13} /> Export my data</Button>
      </section>
      <section className="rounded-xl border border-err/40 bg-panel p-5">
        <h2 className="font-medium text-err">Delete account</h2>
        <p className="mt-1 text-sm text-muted">Permanently deletes your account, projects, revisions, prompts and share links.</p>
        <Button className="mt-3" variant="danger" onClick={() => setConfirm(true)}><Trash2 size={13} /> Delete account</Button>
      </section>
      <Dialog open={confirm} onClose={() => setConfirm(false)} title="Delete your account permanently?"
        footer={<><Button onClick={() => setConfirm(false)}>Cancel</Button><Button variant="danger" disabled={!password} onClick={() => void del()}>Delete everything</Button></>}>
        <Field label="Confirm with your password" htmlFor="del-pw"><Input id="del-pw" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
      </Dialog>
    </main>
  );
}
