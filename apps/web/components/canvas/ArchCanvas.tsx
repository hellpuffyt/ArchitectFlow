"use client";
import { useCallback, useMemo, useRef } from "react";
import {
  Background, BackgroundVariant, ConnectionMode, Controls, MarkerType, MiniMap, ReactFlow, useReactFlow,
} from "@xyflow/react";
import type { Connection, Edge, EdgeChange, Node, NodeChange, Viewport } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useProject } from "@/lib/project-store";
import { addEdge, addNode, groupBounds, moveNodes } from "@/lib/graph";
import { CATEGORY_COLOR, nodeTypeInfo } from "@/lib/registry";
import { ArchNodeView, GroupFrameView } from "./ArchNodeView";
import type { ArchFlowNode, GroupFlowNode } from "./ArchNodeView";

const nodeTypes = { arch: ArchNodeView, groupFrame: GroupFrameView };
export const PALETTE_MIME = "application/x-architectflow-node-type";

export function ArchCanvas({ highlight }: { highlight: Set<string> }) {
  const { doc, edit, transientEdit, beginGesture, endGesture, selection, setSelection } = useProject();
  const flow = useReactFlow();
  const viewport = useRef<Viewport | null>(null);
  const selectedNodes = useMemo(() => new Set(selection.nodes), [selection.nodes]);
  const selectedEdges = useMemo(() => new Set(selection.edges), [selection.edges]);

  const nodes: Node[] = useMemo(() => {
    if (!doc) return [];
    const frames: GroupFlowNode[] = doc.groups.flatMap((g) => {
      const b = groupBounds(doc, g);
      return b ? [{
        id: `group:${g.id}`, type: "groupFrame" as const, position: { x: b.x, y: b.y }, data: { label: g.label },
        style: { width: b.width, height: b.height }, draggable: false, selectable: false, focusable: false, zIndex: -1,
      }] : [];
    });
    const archNodes: ArchFlowNode[] = doc.nodes.map((n) => ({
      id: n.id, type: "arch" as const, position: n.position, data: { node: n, highlight: highlight.has(n.id) },
      selected: selectedNodes.has(n.id),
    }));
    return [...frames, ...archNodes];
  }, [doc, highlight, selectedNodes]);

  const edges: Edge[] = useMemo(() => (doc?.edges ?? []).map((e) => {
    const color = highlight.has(e.id) ? "var(--warn)" : undefined;
    return {
      id: e.id, source: e.source, target: e.target, selected: selectedEdges.has(e.id),
      label: [e.label, e.protocol].filter(Boolean).join(" · "),
      animated: !e.synchronous,
      markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
      markerStart: e.direction === "two_way" ? { type: MarkerType.ArrowClosed, width: 16, height: 16 } : undefined,
      style: { strokeWidth: 1.6, stroke: color, strokeDasharray: e.encrypted === false ? "4 3" : undefined },
      ariaLabel: `Connection ${e.source} to ${e.target} via ${e.protocol}`,
    };
  }), [doc, highlight, selectedEdges]);

  const withViewport = useCallback((fn: Parameters<typeof edit>[0]) => {
    const vp = viewport.current;
    edit((d) => {
      const next = fn(d);
      return vp ? { ...next, viewport: { x: Math.round(vp.x), y: Math.round(vp.y), zoom: Math.round(vp.zoom * 1000) / 1000 } } : next;
    });
  }, [edit]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    const moves: Record<string, { x: number; y: number }> = {};
    let gestureMove = false;
    let keyboardMove = false;
    let sel: string[] | null = null;
    for (const c of changes) {
      if (c.type === "position" && c.position && !c.id.startsWith("group:")) {
        moves[c.id] = c.position;
        if (c.dragging) gestureMove = true; else keyboardMove = true;
      }
      if (c.type === "select" && !c.id.startsWith("group:")) {
        sel = sel ?? [...selection.nodes];
        sel = c.selected ? [...new Set([...sel, c.id])] : sel.filter((x) => x !== c.id);
      }
    }
    if (Object.keys(moves).length) {
      if (gestureMove) transientEdit((d) => moveNodes(d, moves));
      else if (keyboardMove) edit((d) => moveNodes(d, moves));
    }
    if (sel) setSelection({ nodes: sel, edges: selection.edges });
  }, [edit, transientEdit, selection, setSelection]);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    let sel: string[] | null = null;
    for (const c of changes) {
      if (c.type === "select") {
        sel = sel ?? [...selection.edges];
        sel = c.selected ? [...new Set([...sel, c.id])] : sel.filter((x) => x !== c.id);
      }
    }
    if (sel) setSelection({ nodes: selection.nodes, edges: sel });
  }, [selection, setSelection]);

  const onConnect = useCallback((c: Connection) => {
    if (!c.source || !c.target) return;
    withViewport((d) => addEdge(d, c.source, c.target)[0]);
  }, [withViewport]);

  const onDrop = useCallback((e: React.DragEvent) => {
    const type = e.dataTransfer.getData(PALETTE_MIME);
    if (!type) return;
    e.preventDefault();
    const pos = flow.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    let newId = "";
    withViewport((d) => { const [next, id] = addNode(d, type, { x: pos.x - 90, y: pos.y - 30 }); newId = id; return next; });
    setTimeout(() => setSelection({ nodes: [newId], edges: [] }), 0);
  }, [flow, withViewport, setSelection]);

  if (!doc) return null;
  return (
    <div className="h-full w-full" onDragOver={(e) => { if (e.dataTransfer.types.includes(PALETTE_MIME)) e.preventDefault(); }} onDrop={onDrop}>
      <ReactFlow
        nodes={nodes} edges={edges} nodeTypes={nodeTypes}
        onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
        onNodeDragStart={beginGesture} onNodeDragStop={endGesture}
        onPaneClick={() => setSelection({ nodes: [], edges: [] })}
        onMoveEnd={(_, vp) => { viewport.current = vp; }}
        defaultViewport={doc.viewport} fitView={doc.nodes.length > 0 && doc.viewport.x === 0 && doc.viewport.y === 0}
        connectionMode={ConnectionMode.Loose} deleteKeyCode={null} multiSelectionKeyCode={["Meta", "Shift", "Control"]}
        selectionOnDrag panOnDrag={[1, 2]} panOnScroll selectionKeyCode={null}
        minZoom={0.15} maxZoom={2.5} proOptions={{ hideAttribution: true }}
        aria-label="Architecture canvas"
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="#2a3142" />
        <MiniMap pannable zoomable nodeColor={(n) => (n.type === "arch" ? CATEGORY_COLOR[nodeTypeInfo((n.data as ArchFlowNode["data"]).node.type).category] : "transparent")}
          maskColor="rgba(11,13,18,.7)" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
