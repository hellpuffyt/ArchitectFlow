"use client";
// Token controls. Sliders coalesce a drag into ONE undo step (gesture), like canvas drags.
import { useRef, useState } from "react";
import { contrastRatio, hexToRgb, hslToRgb, isHex, rgbToHex, rgbToHsl } from "@/lib/contrast";
import { useProject } from "@/lib/project-store";

export function Slider({ label, value, min, max, step = 1, unit = "", onChange }: {
  label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (v: number, transient: boolean) => void;
}) {
  const { beginGesture, endGesture } = useProject();
  const dragging = useRef(false);
  const id = `sl-${label.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <div className="flex items-center gap-2 text-xs">
      <label htmlFor={id} className="w-28 shrink-0 text-muted">{label}</label>
      <input id={id} type="range" min={min} max={max} step={step} value={value} className="flex-1 accent-[var(--accent)]"
        onPointerDown={() => { dragging.current = true; beginGesture(); }}
        onPointerUp={() => { dragging.current = false; endGesture(); }}
        onPointerCancel={() => { dragging.current = false; endGesture(); }}
        onChange={(e) => onChange(Number(e.target.value), dragging.current)} />
      <input aria-label={`${label} value`} type="number" min={min} max={max} step={step} value={value}
        className="w-16 rounded border border-line bg-bg px-1 py-0.5 text-right text-xs"
        onChange={(e) => { const v = Number(e.target.value); if (!Number.isNaN(v)) onChange(Math.min(max, Math.max(min, v)), false); }} />
      <span className="w-6 text-faint">{unit}</span>
    </div>
  );
}

export function Choice<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly T[]; onChange: (v: T) => void }) {
  const id = `ch-${label.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <div className="flex items-center gap-2 text-xs">
      <label htmlFor={id} className="w-28 shrink-0 text-muted">{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value as T)} className="flex-1 rounded border border-line bg-bg px-1.5 py-1 text-xs">
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

/** HEX / RGB / HSL editor for one color token. Invalid input is held locally, never saved. */
export function ColorEditor({ name, value, onChange }: { name: string; value: string; onChange: (hex: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [r, g, b] = hexToRgb(value);
  const [h, sat, l] = rgbToHsl(r, g, b);
  const hexShown = draft ?? value;
  return (
    <div className="space-y-2 rounded-md border border-line bg-panel-2 p-2.5 text-xs" aria-label={`${name} color editor`}>
      <div className="flex items-center gap-2">
        <input type="color" aria-label={`${name} picker`} value={value} onChange={(e) => onChange(e.target.value)} className="h-8 w-10 cursor-pointer rounded border border-line bg-transparent" />
        <label className="flex items-center gap-1">HEX
          <input aria-label={`${name} hex`} value={hexShown} maxLength={7}
            className={`w-20 rounded border bg-bg px-1.5 py-0.5 font-mono ${isHex(hexShown) ? "border-line" : "border-err"}`}
            onChange={(e) => { const v = e.target.value.startsWith("#") ? e.target.value : `#${e.target.value}`; setDraft(v); if (isHex(v)) { onChange(v.toLowerCase()); setDraft(null); } }}
            onBlur={() => setDraft(null)} />
        </label>
        {draft !== null && !isHex(draft) && <span className="text-err" role="alert">Use #rrggbb</span>}
      </div>
      <div className="flex items-center gap-1.5">RGB
        {[r, g, b].map((v, i) => (
          <input key={i} aria-label={`${name} ${"rgb"[i]}`} type="number" min={0} max={255} value={v} className="w-14 rounded border border-line bg-bg px-1 py-0.5"
            onChange={(e) => { const c: [number, number, number] = [r, g, b]; c[i] = Math.max(0, Math.min(255, Number(e.target.value) || 0)); onChange(rgbToHex(...c)); }} />
        ))}
      </div>
      <div className="flex items-center gap-1.5">HSL
        {[h, sat, l].map((v, i) => (
          <input key={i} aria-label={`${name} ${["hue", "saturation", "lightness"][i]}`} type="number" min={0} max={i === 0 ? 360 : 100} value={v} className="w-14 rounded border border-line bg-bg px-1 py-0.5"
            onChange={(e) => { const c: [number, number, number] = [h, sat, l]; c[i] = Math.max(0, Math.min(i === 0 ? 360 : 100, Number(e.target.value) || 0)); onChange(rgbToHex(...hslToRgb(...c))); }} />
        ))}
      </div>
    </div>
  );
}

export function ContrastRow({ label, fg, bg, min }: { label: string; fg: string; bg: string; min: number }) {
  const ratio = contrastRatio(fg, bg);
  const ok = ratio >= min;
  return (
    <tr className="border-t border-line" data-testid={`contrast-${label.replace(/\W+/g, "-").toLowerCase()}`}>
      <td className="py-1">{label}</td>
      <td><span className="inline-block h-3 w-3 rounded-sm border border-line align-middle" style={{ background: fg }} /> <span className="inline-block h-3 w-3 rounded-sm border border-line align-middle" style={{ background: bg }} /></td>
      <td className="font-mono">{ratio.toFixed(2)}:1</td>
      <td className={ok ? "text-ok" : "text-err"}>{ok ? `pass (≥${min})` : `fail (<${min})`}</td>
    </tr>
  );
}
