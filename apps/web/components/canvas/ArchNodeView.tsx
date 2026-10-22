"use client";
import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import type { Node, NodeProps } from "@xyflow/react";
import { CATEGORY_COLOR, nodeTypeInfo } from "@/lib/registry";
import type { ArchNode } from "@/lib/types";

export type ArchFlowNode = Node<{ node: ArchNode; highlight: boolean }, "arch">;
export type GroupFlowNode = Node<{ label: string }, "groupFrame">;

export const ArchNodeView = memo(function ArchNodeView({ data, selected }: NodeProps<ArchFlowNode>) {
  const { node, highlight } = data;
  const info = nodeTypeInfo(node.type);
  const Icon = info.icon;
  const color = CATEGORY_COLOR[info.category];
  return (
    <div
      className={`min-w-[180px] max-w-[240px] rounded-lg border bg-panel-2 px-3 py-2 shadow-sm transition ${selected ? "border-accent ring-2 ring-accent/30" : highlight ? "border-warn ring-2 ring-warn/30" : "border-line-strong"}`}
      style={{ borderLeft: `3px solid ${color}` }}
      data-testid={`node-${node.id}`}
      aria-label={`${info.label}: ${node.label}`}
    >
      <Handle type="target" position={Position.Left} />
      <Handle type="target" position={Position.Top} id="t" />
      <div className="flex items-center gap-2">
        <Icon size={15} style={{ color }} aria-hidden />
        <span className="truncate text-[13px] font-medium text-fg">{node.label}</span>
        {node.replicas > 1 && <span className="ml-auto text-[10px] text-muted">×{node.replicas}</span>}
      </div>
      <div className="mt-0.5 flex gap-1.5 text-[11px] text-faint">
        <span>{info.label}</span>
        {node.technology && <span className="truncate text-muted">· {node.technology}</span>}
      </div>
      <Handle type="source" position={Position.Right} />
      <Handle type="source" position={Position.Bottom} id="b" />
    </div>
  );
});

export const GroupFrameView = memo(function GroupFrameView({ data, selected }: NodeProps<GroupFlowNode>) {
  return (
    <div className={`h-full w-full rounded-xl border border-dashed ${selected ? "border-accent bg-accent/5" : "border-line-strong bg-white/[0.015]"}`}>
      <span className="absolute left-3 top-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">{data.label}</span>
    </div>
  );
});
