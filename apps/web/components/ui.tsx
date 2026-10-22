"use client";
// Small accessible primitives shared across the app.
import { forwardRef, useEffect, useId, useRef } from "react";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
const VARIANT: Record<Variant, string> = {
  primary: "bg-accent text-white hover:brightness-110 border-transparent",
  secondary: "bg-panel-2 text-fg border-line hover:bg-raised",
  ghost: "bg-transparent text-muted border-transparent hover:bg-panel-2 hover:text-fg",
  danger: "bg-err/15 text-err border-err/40 hover:bg-err/25",
};

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" }>(
  function Button({ variant = "secondary", size = "md", className = "", type = "button", ...props }, ref) {
    const sz = size === "sm" ? "h-7 px-2.5 text-xs" : "h-9 px-3.5 text-sm";
    return (
      <button ref={ref} type={type} {...props}
        className={`inline-flex items-center justify-center gap-1.5 rounded-md border font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${sz} ${VARIANT[variant]} ${className}`} />
    );
  });

export function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: string; error?: string; children: ReactNode; htmlFor: string }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-xs font-medium text-muted">{label}</label>
      {children}
      {hint && !error && <p className="text-xs text-faint">{hint}</p>}
      {error && <p role="alert" className="text-xs text-err">{error}</p>}
    </div>
  );
}

const control = "w-full rounded-md border border-line bg-bg px-2.5 py-1.5 text-sm text-fg placeholder:text-faint focus:border-accent focus:outline-none";
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className = "", ...p }, ref) {
  return <input ref={ref} {...p} className={`${control} ${className}`} />;
});
export function Textarea({ className = "", ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...p} className={`${control} ${className}`} />;
}
export function Select({ className = "", ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...p} className={`${control} ${className}`} />;
}

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "ok" | "warn" | "err" | "info" | "accent"; children: ReactNode }) {
  const tones = {
    neutral: "bg-panel-2 text-muted border-line", ok: "bg-ok/10 text-ok border-ok/30", warn: "bg-warn/10 text-warn border-warn/30",
    err: "bg-err/10 text-err border-err/30", info: "bg-info/10 text-info border-info/30", accent: "bg-accent/15 text-accent border-accent/30",
  };
  return <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-medium ${tones[tone]}`}>{children}</span>;
}

/** Native <dialog> modal: focus trap, Escape to close and inert background come from the browser. */
export function Dialog({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId(); // unique per dialog: several dialogs can be mounted in one view
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
    // Close on cleanup too: Next.js may keep a hidden previous route mounted (React Activity),
    // and a modal dialog left in the top layer would make the new page inert.
    return () => { if (d.open) d.close(); };
  }, [open]);
  return (
    <dialog ref={ref} aria-labelledby={titleId}
      // The native "close" event is queued; ignore a stale one that arrives after a quick reopen.
      onClose={() => { if (!ref.current?.open) onClose(); }}
      className="m-auto w-[min(560px,92vw)] rounded-xl border border-line bg-panel p-0 text-fg shadow-2xl">
      <div className="border-b border-line px-5 py-3.5"><h2 id={titleId} className="text-base font-semibold">{title}</h2></div>
      <div className="max-h-[60vh] overflow-auto px-5 py-4 text-sm">{children}</div>
      {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
    </dialog>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line p-10 text-center">
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-md text-sm text-muted">{body}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorBox({ message, errors }: { message: string; errors?: { path: string; message: string }[] }) {
  return (
    <div role="alert" className="rounded-md border border-err/40 bg-err/10 p-3 text-sm text-err">
      <p className="font-medium">{message}</p>
      {errors && errors.length > 0 && (
        <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-xs">
          {errors.slice(0, 12).map((e, i) => <li key={i}><code>{e.path}</code>: {e.message}</li>)}
        </ul>
      )}
    </div>
  );
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return <span role="status" aria-label={label} className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-line border-t-accent" />;
}
