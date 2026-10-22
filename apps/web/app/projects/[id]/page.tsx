"use client";
import { Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { SessionProvider } from "@/lib/session";
import { ProjectProvider } from "@/lib/project-store";
import { Workspace } from "@/components/Workspace";
import { Spinner } from "@/components/ui";

function ProjectWorkspace() {
  const { id } = useParams<{ id: string }>();
  const sample = useSearchParams().get("sample") === "1";
  return (
    <SessionProvider>
      <ProjectProvider id={id}>
        <Workspace sample={sample} />
      </ProjectProvider>
    </SessionProvider>
  );
}

export default function ProjectPage() {
  return <Suspense fallback={<div className="flex h-screen items-center justify-center"><Spinner /></div>}><ProjectWorkspace /></Suspense>;
}
