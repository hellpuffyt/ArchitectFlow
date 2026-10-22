"use client";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { CATEGORY_COLOR, CATEGORY_LABEL, NODE_TYPES } from "@/lib/registry";
import type { Category } from "@/lib/registry";
import { Input } from "@/components/ui";
import { PALETTE_MIME } from "./ArchCanvas";

/** Component library. Drag onto the canvas, or press Enter/click to add at the view center. */
export function Palette({ onAdd, searchRef }: { onAdd: (type: string) => void; searchRef?: React.Ref<HTMLInputElement> }) {
  const [q, setQ] = useState("");
  const groups = useMemo(() => {
    const m = new Map<Category, typeof NODE_TYPES>();
    for (const t of NODE_TYPES) {
      if (q && !`${t.label} ${t.key} ${CATEGORY_LABEL[t.category]}`.toLowerCase().includes(q.toLowerCase())) continue;
      m.set(t.category, [...(m.get(t.category) ?? []), t]);
    }
    return [...m.entries()];
  }, [q]);
  return (
    <div className="flex h-full flex-col">
      <div className="relative p-3">
        <Search size={13} className="absolute left-5 top-5.5 text-faint" />
        <Input ref={searchRef} aria-label="Search components" placeholder="Search components  /" className="pl-7 text-xs" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="flex-1 overflow-auto px-3 pb-4">
        {groups.length === 0 && <p className="px-1 text-xs text-faint">No component matches “{q}”.</p>}
        {groups.map(([cat, types]) => (
          <div key={cat} className="mb-3">
            <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wider text-faint">{CATEGORY_LABEL[cat]}</p>
            {types.map((t) => {
              const Icon = t.icon;
              return (
                <button key={t.key} type="button" draggable
                  onDragStart={(e) => { e.dataTransfer.setData(PALETTE_MIME, t.key); e.dataTransfer.effectAllowed = "copy"; }}
                  onClick={() => onAdd(t.key)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-muted hover:bg-panel-2 hover:text-fg"
                  aria-label={`Add ${t.label}`}>
                  <Icon size={14} style={{ color: CATEGORY_COLOR[t.category] }} aria-hidden />
                  {t.label}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
