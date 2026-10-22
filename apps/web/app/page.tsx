import Link from "next/link";
import { Logo } from "@/components/Logo";

const STEPS = [
  ["Describe", "Write what you want to build. Requirements, roles and open questions are extracted — inferred items are labeled as assumptions for you to confirm."],
  ["Design", "Review the proposed architecture, then edit the graph: components, connections, protocols, data model and API."],
  ["Validate", "Deterministic rules flag broken references, exposed data stores, missing auth, unbounded queues and more — with evidence."],
  ["Hand off", "Generate an implementation prompt from the exact saved revision, copy it, or download it as Markdown."],
];

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col px-6">
      <header className="flex items-center justify-between py-6">
        <Logo />
        <nav className="flex gap-2 text-sm">
          <Link href="/login" className="rounded-md px-3 py-1.5 text-muted hover:text-fg">Sign in</Link>
          <Link href="/signup" className="rounded-md bg-accent px-3 py-1.5 font-medium text-white">Create account</Link>
        </nav>
      </header>
      <section className="py-16">
        <p className="text-sm font-medium text-accent">Open-source system design studio</p>
        <h1 className="mt-3 max-w-3xl text-4xl font-semibold leading-tight tracking-tight">
          From a product idea to an editable architecture — and a prompt that matches it.
        </h1>
        <p className="mt-4 max-w-2xl text-base text-muted">
          ArchitectFlow keeps your design as structured, versioned data. Every AI suggestion is a reviewable change set,
          every check is deterministic, and every generated prompt records the design revision it came from.
        </p>
        <div className="mt-8 flex gap-3">
          <Link href="/signup" className="rounded-md bg-accent px-4 py-2 font-medium text-white">Start designing</Link>
          <a href="https://github.com/hellpuffyt/ArchitectFlow" className="rounded-md border border-line px-4 py-2 text-fg">View source</a>
        </div>
      </section>
      <section className="grid gap-4 pb-20 sm:grid-cols-2">
        {STEPS.map(([title, body], i) => (
          <div key={title} className="rounded-xl border border-line bg-panel p-5">
            <p className="text-xs font-medium text-faint">Step {i + 1}</p>
            <h2 className="mt-1 font-semibold">{title}</h2>
            <p className="mt-1.5 text-sm text-muted">{body}</p>
          </div>
        ))}
      </section>
      <footer className="mt-auto border-t border-line py-6 text-xs text-faint">
        Experimental 0.1.0 · MIT OR Apache-2.0 · Without an AI provider configured, ArchitectFlow runs in a clearly labeled deterministic example mode.
      </footer>
    </main>
  );
}
