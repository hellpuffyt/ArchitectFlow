"use client";
import { useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError, api, setCsrfToken } from "@/lib/api";
import { Button, ErrorBox, Field, Input } from "./ui";
import { Logo } from "./Logo";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const me = mode === "login" ? await api.login(email, password) : await api.signup(email, password);
      setCsrfToken(me.csrf_token);
      router.push("/projects");
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, "Unexpected error"));
      setBusy(false);
    }
  }

  const signup = mode === "signup";
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-xl border border-line bg-panel p-6" noValidate>
        <Link href="/"><Logo /></Link>
        <h1 className="text-lg font-semibold">{signup ? "Create your account" : "Sign in"}</h1>
        <Field label="Email" htmlFor="email">
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password" htmlFor="password" hint={signup ? "At least 10 characters." : undefined}>
          <Input id="password" type="password" autoComplete={signup ? "new-password" : "current-password"} required minLength={signup ? 10 : 1}
            value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {error && <ErrorBox message={error.message} errors={error.errors} />}
        <Button type="submit" variant="primary" className="w-full" disabled={busy}>{busy ? "Please wait…" : signup ? "Create account" : "Sign in"}</Button>
        <p className="text-center text-xs text-muted">
          {signup ? <>Already have an account? <Link className="text-accent" href="/login">Sign in</Link></>
            : <>New here? <Link className="text-accent" href="/signup">Create an account</Link></>}
        </p>
      </form>
    </main>
  );
}
