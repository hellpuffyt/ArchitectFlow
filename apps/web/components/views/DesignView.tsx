"use client";
import { useState } from "react";
import { ThemeEditor } from "@/components/design/ThemeEditor";
import { PageDesigner } from "@/components/design/PageDesigner";
import { UiJourneys } from "@/components/design/UiJourneys";
import { DesignAssistant } from "@/components/design/DesignAssistant";

const TABS = [["theme", "Theme & tokens"], ["pages", "Pages & layout"], ["journeys", "UI journeys"], ["assistant", "Design assistant"]] as const;
type Tab = (typeof TABS)[number][0];

export function DesignView() {
  const [tab, setTab] = useState<Tab>("theme");
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div role="tablist" aria-label="UI/UX design" className="flex gap-1 border-b border-line bg-panel px-4 pt-2">
        {TABS.map(([k, label]) => (
          <button key={k} role="tab" type="button" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`rounded-t-md px-3 py-2 text-xs font-medium ${tab === k ? "border-b-2 border-accent text-fg" : "text-muted hover:text-fg"}`}>{label}</button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-auto" role="tabpanel">
        {tab === "theme" && <ThemeEditor />}
        {tab === "pages" && <PageDesigner />}
        {tab === "journeys" && <UiJourneys />}
        {tab === "assistant" && <DesignAssistant />}
      </div>
    </div>
  );
}
