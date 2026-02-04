'use client';

import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import ReactFlow, {
  addEdge,
  Background,
  Controls,
  MiniMap,
  Node as RFNode,
  NodeProps,
  Edge,
  Connection,
  MarkerType,
  NodeChange,
  EdgeChange,
  applyNodeChanges,
  applyEdgeChanges,
  Handle,
  Position,
  ConnectionLineType,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { nanoid } from 'nanoid';
import { create } from 'zustand';
import MasterTimeline from '../MasterTimeline';

/**
 * -------------------------
 * Types
 * -------------------------
 */

type TurnoverType = 'gross' | 'design' | 'dev' | 'ops';
type Studio = '27b' | 'Antinomy Studio';

type NodeKind =
  | 'person'
  | 'capacity'
  | 'project'
  | 'budget'
  | 'timeline'
  | 'turnover'
  | 'ledger';

type BaseNodeData = {
  title: string;
  kind: NodeKind;
};

type ViewMode = 'workflow' | 'timeline';
type Dept = 'unassigned' | 'ops' | 'design' | 'dev';


type PersonData = {
  title: string;
  kind: 'person';
  color: string;
  dept: Dept;
  isExternal: boolean;
  externalFeeEUR: number;
  billToBudgetId?: string | null;
  billToPhase?: 'design' | 'dev' | 'ops' | null;
  
};

type CapacityData = {
  title: string;
  kind: 'capacity';
};

type ProjectData = BaseNodeData & {
  kind: 'project';
  studio?: Studio;
  client?: string; // user input (shown in Project node + editable in inspector)
};

type BudgetPhase = 'design' | 'dev' | 'ops';

type BudgetExternalLine = {
  id: string;                // stable row id for editing/removal
  personId?: string;         // optional link to a Person node later
  personName: string;        // snapshot (so if person title changes later, your budget doesn’t silently rewrite history)
  color: string;            // snapshot for UI
  phase: BudgetPhase;
  amountEUR: number;         // positive number
};
type BudgetData = {
  title: string;
  kind: 'budget';
  studio: Studio;
  currency: 'EUR';
  designAmount: number;
  devAmount: number;
  opsAmount: number;
  autoTitle: boolean;

  externals: BudgetExternalLine[]; // ✅ new
};

type TimelineData = {
  title: string;
  kind: 'timeline';
  studio: Studio;
  startDate: string;
  endDate: string;
  autoTitle: boolean;
};

type TurnoverData = {
  title: string;
  kind: 'turnover';
  currency: 'EUR';
  turnoverType: TurnoverType;
};

type LedgerData = {
  title: string;
  kind: 'ledger';
  currency: 'EUR';
  autoTitle?: boolean;
};

type GraphNodeData =
  | PersonData
  | CapacityData
  | ProjectData
  | BudgetData
  | TimelineData
  | TurnoverData
  | LedgerData;

  

type GraphEdgeData = { label?: string; color?: string };

type PersistedGraph = {
  version: 1;
  savedAtISO: string;
  viewMode: ViewMode;
  nodes: RFNode<GraphNodeData>[];
  edges: Edge<GraphEdgeData>[];
  edgeMode: 'radius' | 'bezier';
};

type EdgeMode = 'radius' | 'bezier';

type GraphState = {
  // View
  viewMode: ViewMode;
  setViewMode: (m: ViewMode) => void;

  edgeCornerRadius: number;
  setEdgeCornerRadius: (r: number) => void;

  // Edge routing UI mode
  edgeMode: EdgeMode;
  setEdgeMode: (m: EdgeMode) => void;

  // Graph data
  nodes: RFNode<GraphNodeData>[];
  edges: Edge<GraphEdgeData>[];

  // Selection
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  selectNode: (id: string | null) => void;
  selectEdge: (id: string | null) => void;

  // Add nodes
  addPerson: () => void;
  addCapacity: () => void;
  addProject: () => void;
  addBudget: () => void;
  addTimeline: () => void;
  addTurnover: (t: TurnoverType) => void;
  addLedger: () => void;

  // ReactFlow handlers
  onConnect: (c: Connection) => void;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;

  // Updates
  updateNodeTitle: (id: string, title: string) => void;
  updateTimelineDates: (
    id: string,
    patch: Partial<Pick<TimelineData, 'startDate' | 'endDate'>>
  ) => void;
  updateBudgetPhases: (
    id: string,
    patch: Partial<Pick<BudgetData, 'designAmount' | 'devAmount' | 'opsAmount'>>
  ) => void;

  updatePersonMeta: (id: string, patch: Partial<PersonData>) => void;
  updateProjectStudio: (id: string, studio: Studio) => void;
  updateProjectClient: (id: string, client: string) => void;

  updateEdgeLabel: (id: string, label: string) => void;
  updateEdgeConnection: (edgeId: string, newConn: Connection) => void;
  deleteEdge: (edgeId: string) => void;

  // Persistence
  hydrateFromPersisted: (p: PersistedGraph) => void;
  resetGraph: () => void;
};

/**
 * -------------------------
 * Constants / Helpers
 * -------------------------
 */
// --- Dock / Clip tuning ---
const DOCK_GAP_Y = 10;        // space between stacked nodes when "clipped"
const DOCK_SNAP_Y = 18;       // how close (px) to snap vertically
const DOCK_SNAP_X = 14;       // how close (px) to snap horizontally (left-align)
const APP_STORAGE_KEY = 'studio-ops-graph:v1';

function selectedNodeStyle(is27b: boolean): React.CSSProperties {
  const ring = is27b ? 'rgba(255, 8, 0, 0.18)' : 'rgba(0, 114, 49, 0.10)';
  const band = is27b ? '#ff0800' : BUREAU_GREEN;

  return {
    overflow: 'visible', // critical: never clip handles
    boxShadow: `0 0 0 6px ${ring}, inset 0 -3px 0 0 ${band}`,
    borderRadius: 14,
  };
}

const DEPT_COLOURS: Record<Dept, string> = {
  unassigned: '#94a3b8', // grey
  ops: '#86EFAC',        // green
  design: '#F9A8D4',     // pink
  dev: '#FDE047',        // yellow (Engineering)
};

// --- Dock / Magnetic snap (Budget ↔ Timeline) ---
const DOCK_Y_GAP = 12;        // space between stacked nodes
const DOCK_SNAP_DIST = 28;    // how close before it snaps (Y)
const DOCK_X_SNAP_DIST = 220;  // how close before X aligns

// --- Dock helpers ---
function isDockableKind(kind: NodeKind) {
  return kind === 'budget' || kind === 'timeline';
}
// --- Dock (visual) detection ---
// Purely visual: infer "docked" when a budget/timeline are stacked within tolerance.

const DOCK_VISUAL_Y_TOL = 10;          // how tight the "touch" must be
const DOCK_VISUAL_MIN_X_OVERLAP = 0.35; // prevent accidental docking across the canvas

type DockVisual = { top?: boolean; bottom?: boolean; withId?: string };

function nodeRect(n: any) {
  const w = n.width ?? 260;
  const h = n.height ?? 140;
  const x = n.position?.x ?? 0;
  const y = n.position?.y ?? 0;

  return { x, y, w, h, x2: x + w, y2: y + h, cx: x + w / 2 };
}

function xOverlapRatio(a: any, b: any) {
  const A = nodeRect(a);
  const B = nodeRect(b);

  const overlap = Math.max(0, Math.min(A.x2, B.x2) - Math.max(A.x, B.x));
  const minW = Math.min(A.w, B.w);
  return minW > 0 ? overlap / minW : 0;
}

function computeDockVisual(nodes: any[], dockGap: number) {
  const dock: Record<string, DockVisual> = {};

  const ensure = (id: string) =>
    (dock[id] ??= { top: false, bottom: false, withId: undefined });

  const dockables = nodes.filter((n) => isDockableKind((n as any)?.data?.kind));

  for (const upper of dockables) {
    const upperPos = upper.position;
    const upperH = (upper as any).height ?? 140;

    // we want the closest node that is stacked directly BELOW this upper node
    const expectedLowerY = upperPos.y + upperH + dockGap;

    let bestLower: any | null = null;
    let bestDist = Infinity;

    for (const lower of dockables) {
      if (lower.id === upper.id) continue;

      const lowerPos = lower.position;

      // ✅ prevent ghost snapping: require X alignment first (same column)
      if (Math.abs(lowerPos.x - upperPos.x) > DOCK_X_SNAP_DIST) continue;

      // candidate must be near the "stacked below" Y band
      const yDist = Math.abs(lowerPos.y - expectedLowerY);
      if (yDist > DOCK_SNAP_DIST) continue;

      if (yDist < bestDist) {
        bestDist = yDist;
        bestLower = lower;
      }
    }

    // Rule: ONE clip per junction -> clip lives on the UPPER node's bottom only.
    if (bestLower) {
      ensure(upper.id).bottom = true;
      ensure(upper.id).withId = bestLower.id;
    }
  }

  return dock;
}
function snapDockPosition(
  moving: { x: number; y: number; width?: number; height?: number },
  target: { x: number; y: number; width?: number; height?: number },
  opts: { dockGap: number; snapY: number; snapX: number }
): { x: number; y: number; dockSide: 'top' | 'bottom'; dist: number } | null {
  const { dockGap, snapY } = opts;
  const snapX = opts.snapX ?? 0;

  // Fallback sizes if ReactFlow hasn't measured yet.
  const mH = moving.height ?? 140;
  const tH = target.height ?? 140;

  // Candidate Y positions (stack above / below)
  const yAbove = target.y - dockGap - mH;
  const yBelow = target.y + tH + dockGap;

  const distAbove = Math.abs(moving.y - yAbove);
  const distBelow = Math.abs(moving.y - yBelow);

  // If neither candidate is close enough, no snap.
  const dist = Math.min(distAbove, distBelow);
  if (dist > snapY) return null;

  const dockSide: 'top' | 'bottom' = distAbove <= distBelow ? 'top' : 'bottom';
  const y = dockSide === 'top' ? yAbove : yBelow;

  // Optional X snap (align left edges) — keep OFF by default by passing snapX=0
  let x = moving.x;
  if (snapX > 0 && Math.abs(moving.x - target.x) <= snapX) x = target.x;

  return { x, y, dockSide, dist };
}

function deptLabel(d: Dept) {
  if (d === 'dev') return 'Engineering';
  if (d === 'ops') return 'Operations';
  if (d === 'design') return 'Design';
  return 'Unassigned';
}

function safeNum(n: number) {
  return Number.isFinite(n) ? n : 0;
}
function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function isBetween(d: Date, start: Date, end: Date) {
  return d.getTime() >= start.getTime() && d.getTime() <= end.getTime();
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
function formatEUR(amount: number) {
  const safe = Number.isFinite(amount) ? amount : 0;
  try {
    return new Intl.NumberFormat('en-IE', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0,
    }).format(safe);
  } catch {
    return `€${Math.round(safe).toLocaleString()}`;
  }
}

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function budgetTotal(b: BudgetData) {
  return safeNum(b.designAmount) + safeNum(b.devAmount) + safeNum(b.opsAmount);
}

function turnoverTitle(t: TurnoverType) {
  if (t === 'gross') return 'Total Turnover';
  if (t === 'design') return 'Net Design Turnover';
  if (t === 'dev') return 'Net Dev Turnover';
  return 'Net Ops Turnover';
}

function getNodeKindById(nodes: RFNode<GraphNodeData>[], id?: string | null): NodeKind | null {
  if (!id) return null;
  const n = nodes.find((x) => x.id === id);
  if (!n) return null;
  return n.data.kind;
}

function reactFlowTypeForNode(kind: NodeKind): string {
  if (kind === 'person') return 'personNode';
  if (kind === 'capacity') return 'capacityNode';
  if (kind === 'project') return 'projectNode';
  if (kind === 'budget') return 'budgetNode';
  if (kind === 'timeline') return 'timelineNode';
  if (kind === 'turnover') return 'turnoverNode';
  if (kind === 'ledger') return 'ledgerNode'; // ✅ add this
  return 'projectNode';
}

function tinyPort(): React.CSSProperties {
  return {
    width: 12,
    height: 12,
    borderRadius: 999,
    background: 'rgba(0,0,0,0.55)',
    border: '2px solid rgba(255,255,255,0.92)',
    zIndex: 50,           // <- always above selection rings/bands
    pointerEvents: 'auto',
  };
}

function getNodeBg(kind: NodeKind, turnoverType?: TurnoverType) {
  if (kind === 'turnover') {
    if (turnoverType === 'design') return 'rgba(224, 231, 255, 1)';
    if (turnoverType === 'dev') return 'rgba(209, 250, 229, 1)';
    if (turnoverType === 'ops') return 'rgba(255, 228, 230, 1)';
    return 'rgba(255, 237, 213, 1)';
  }

  switch (kind) {
    case 'person':
      return 'rgba(241, 245, 249, 1)';
    case 'capacity':
      return 'rgba(241, 245, 249, 1)';
    case 'project':
      return 'rgba(220, 252, 231, 1)';
    case 'budget':
  return 'rgba(241, 245, 249, 1)'; // calm neutral
case 'timeline':
  return 'rgba(241, 245, 249, 1)'; // calm neutral
    default:
      return 'white';
  }
}

function edgeColorFromSource(nodes: RFNode<GraphNodeData>[], sourceId?: string | null) {
  if (!sourceId) return 'rgba(0,0,0,0.35)';
  const source = nodes.find((n) => n.id === sourceId);
  if (!source) return 'rgba(0,0,0,0.35)';
  if (source.data.kind === 'person') return (source.data as PersonData).color;
  return 'rgba(0,0,0,0.35)';
}

function isValidConnectionStrict(nodes: RFNode<GraphNodeData>[], c: Connection) {
  if (!c.source || !c.target) return false;

  const sourceKind = getNodeKindById(nodes, c.source);
  const targetKind = getNodeKindById(nodes, c.target);

  // Capacity → Person (capacity-only)
  if (sourceKind === 'capacity' && targetKind === 'person') {
    return c.sourceHandle === 'capacity-out' && c.targetHandle === 'capacity-in';
  }

  // Person → Project (project-only)
  if (sourceKind === 'person' && targetKind === 'project') {
    const okTeamPort = c.targetHandle === 'ops' || c.targetHandle === 'design' || c.targetHandle === 'dev';
    return c.sourceHandle === 'project-out' && okTeamPort;
  }

  // ✅ Person → Timeline (resource assignment)
  if (sourceKind === 'person' && targetKind === 'timeline') {
    return c.sourceHandle === 'timeline-out' && c.targetHandle === 'resource-in';
  }

  // Project → Budget
  if (sourceKind === 'project' && targetKind === 'budget') {
    return c.sourceHandle === 'budget' && c.targetHandle === 'budget-in';
  }

  // Project → Timeline
  if (sourceKind === 'project' && targetKind === 'timeline') {
    return c.sourceHandle === 'timeline' && c.targetHandle === 'timeline-in';
  }

  // Budget → Turnover
  if (sourceKind === 'budget' && targetKind === 'turnover') {
    return c.sourceHandle === 'budget-out' && c.targetHandle === 'turnover-in';
  }

  return false;
}

/**
 * External debits
 */
type DebitPhase = 'design' | 'dev' | 'ops';
type DebitLine = {
  personName: string;
  phase: DebitPhase;
  amount: number;
  color: string;
};

type ProjectDebits = {
  lines: DebitLine[];
  byPhase: { design: number; dev: number; ops: number };
  total: number;
};

function getBudgetIdsForProject(
  nodes: RFNode<GraphNodeData>[],
  edges: Edge<GraphEdgeData>[],
  projectId: string
): string[] {
  const ids = new Set<string>();

  for (const e of edges) {
    const sKind = getNodeKindById(nodes, e.source);
    const tKind = getNodeKindById(nodes, e.target);

    // Project -> Budget
    if (e.source === projectId && sKind === 'project' && tKind === 'budget') {
      ids.add(e.target);
      continue;
    }

    // Budget -> Project
    if (e.target === projectId && tKind === 'project' && sKind === 'budget') {
      ids.add(e.source);
      continue;
    }
  }

  return Array.from(ids);
}



function computeProjectBudgetTotals(
  nodes: RFNode<GraphNodeData>[],
  edges: Edge<GraphEdgeData>[],
  projectId: string
): { gross: number; net: number; budgetCount: number; signedCount: number } {
  const budgetIds = getBudgetIdsForProject(nodes, edges, projectId);

  let gross = 0;
  let net = 0;

  // placeholder until BudgetData gets a signed flag
  let signedCount = 0;

  for (const bid of budgetIds) {
    const bn = nodes.find((n) => n.id === bid);
    if (!bn || bn.data?.kind !== 'budget') continue;

    const computed = computeBudgetNetForBudgetNode(nodes, edges, bid);

    const grossTotal = computed?.grossTotal ?? budgetTotal(bn.data);
    const netTotal = computed?.netTotal ?? budgetTotal(bn.data);

    gross += safeNum(grossTotal);
    net += safeNum(netTotal);

    // forward-compatible: if later you add bn.data.signed boolean
    if ((bn.data as any)?.signed) signedCount += 1;
  }

  return { gross, net, budgetCount: budgetIds.length, signedCount };
}

type DeptKey = 'ops' | 'design' | 'dev';

function computeProjectTeamByDept(
  nodes: RFNode<GraphNodeData>[],
  edges: Edge<GraphEdgeData>[],
  projectId: string
): Record<DeptKey, string[]> {
  const byId = new Map(nodes.map((n) => [n.id, n] as const));

  const sets: Record<DeptKey, Set<string>> = {
    ops: new Set<string>(),
    design: new Set<string>(),
    dev: new Set<string>(),
  };

  const isDept = (v: any): v is DeptKey => v === 'ops' || v === 'design' || v === 'dev';

  for (const e of edges) {
    const s = byId.get(e.source);
    const t = byId.get(e.target);
    if (!s || !t) continue;

    const sKind = s.data?.kind;
    const tKind = t.data?.kind;

    // We consider a "team assignment" as: a person connected to a project's dept handle.
    // Support both directions (in case user connected "backwards").
    const projectIsTarget = e.target === projectId && sKind === 'person' && isDept((e as any).targetHandle);
    const projectIsSource = e.source === projectId && tKind === 'person' && isDept((e as any).sourceHandle);

    if (projectIsTarget) {
      const dept = (e as any).targetHandle as DeptKey;
      sets[dept].add(e.source); // person id
    } else if (projectIsSource) {
      const dept = (e as any).sourceHandle as DeptKey;
      sets[dept].add(e.target); // person id
    }
  }

  // Stable display ordering (by person title)
  const sortByTitle = (ids: string[]) =>
    ids
      .map((pid) => ({ pid, title: String((byId.get(pid)?.data as any)?.title ?? '').trim() }))
      .sort((a, b) => a.title.localeCompare(b.title))
      .map((x) => x.pid);

  return {
    ops: sortByTitle(Array.from(sets.ops)),
    design: sortByTitle(Array.from(sets.design)),
    dev: sortByTitle(Array.from(sets.dev)),
  };
}

function getTimelineIdsForProject(
  nodes: RFNode<GraphNodeData>[],
  edges: Edge<GraphEdgeData>[],
  projectId: string
): string[] {
  const ids = new Set<string>();

  for (const e of edges) {
    if (e.source !== projectId && e.target !== projectId) continue;

    const otherId = e.source === projectId ? e.target : e.source;
    const other = nodes.find((n) => n.id === otherId);

    if (other?.data?.kind === 'timeline') {
      ids.add(otherId);
    }
  }

  return Array.from(ids);
}

function computeProjectTimelineCount(
  nodes: RFNode<GraphNodeData>[],
  edges: Edge<GraphEdgeData>[],
  projectId: string
): number {
  return getTimelineIdsForProject(nodes, edges, projectId).length;
}

function computeProjectDebits(
  nodes: RFNode<GraphNodeData>[],
  edges: Edge<GraphEdgeData>[],
  projectId: string,
  opts?: { budgetId?: string }
): ProjectDebits {
  const lines: DebitLine[] = [];

  const projectBudgetIds = getBudgetIdsForProject(nodes, edges, projectId);
  const activeBudgetId = opts?.budgetId ?? null;

  const personToProjectEdges = edges.filter(
    (e) =>
      e.target === projectId &&
      getNodeKindById(nodes, e.source) === 'person' &&
      getNodeKindById(nodes, e.target) === 'project'
  );

  for (const e of personToProjectEdges) {
    const personNode = nodes.find((n) => n.id === e.source);
    if (!personNode || personNode.data.kind !== 'person') continue;

    const p = personNode.data as PersonData;
    if (!p.isExternal) continue;

    const fee = safeNum(p.externalFeeEUR);
    if (fee <= 0) continue;

    // ✅ Budget scoping
    const billToBudgetId = (p as any).billToBudgetId ?? null;
    if (activeBudgetId) {
      if (billToBudgetId) {
        // Person explicitly billed to a specific budget
        if (billToBudgetId !== activeBudgetId) continue;
      } else {
        // No explicit budget: ONLY include if this project has exactly 1 budget
        if (!(projectBudgetIds.length === 1 && projectBudgetIds[0] === activeBudgetId)) continue;
      }
    }

    // ✅ Phase: prefer explicit billToPhase if set, else fall back to edge handle
    const explicitPhase = (p as any).billToPhase as DebitPhase | undefined;

    const edgePhase = (e.targetHandle as any) ?? 'design';
    const edgeValidPhase: DebitPhase =
      edgePhase === 'dev' || edgePhase === 'ops' || edgePhase === 'design' ? edgePhase : 'design';

    const phase: DebitPhase =
      explicitPhase === 'dev' || explicitPhase === 'ops' || explicitPhase === 'design'
        ? explicitPhase
        : edgeValidPhase;

    lines.push({
      personName: p.title,
      phase,
      amount: fee,
      color: p.color ?? '#999999',
    });
  }

  const byPhase = lines.reduce(
    (acc, l) => {
      acc[l.phase] += safeNum(l.amount);
      return acc;
    },
    { design: 0, dev: 0, ops: 0 }
  );

  const total = byPhase.design + byPhase.dev + byPhase.ops;

  return { lines, byPhase, total };
}

// Keep this OUTSIDE computeProjectDebits (top-level helper)
function snapshotLinesFromProjectDebits(projectDebits: ProjectDebits): BudgetExternalLine[] {
  return (projectDebits.lines ?? []).map((l) => ({
    id: `ext-${nanoid(6)}`,
    personId: undefined, // optional for later
    personName: l.personName,
    color: l.color ?? '#999999',
    phase: l.phase,
    amountEUR: safeNum(l.amount),
  }));
}

function computeBudgetNetForBudgetNode(
  nodes: RFNode<GraphNodeData>[],
  edges: Edge<GraphEdgeData>[],
  budgetNodeId: string
) {
  const budgetNode = nodes.find((n) => n.id === budgetNodeId);
  if (!budgetNode || budgetNode.data.kind !== 'budget') return null;

  const budget = budgetNode.data as BudgetData;

  // Find the linked project (expects Project → Budget, but supports either direction)
  const link = edges.find(
    (e) =>
      (e.target === budgetNodeId && getNodeKindById(nodes, e.source) === 'project') ||
      (e.source === budgetNodeId && getNodeKindById(nodes, e.target) === 'project')
  );

  const projectId =
    link?.target === budgetNodeId ? link?.source : link?.source === budgetNodeId ? link?.target : null;

  // Gross for THIS budget only
  const gross = {
    design: safeNum(budget.designAmount),
    dev: safeNum(budget.devAmount),
    ops: safeNum(budget.opsAmount),
  };
// ✅ LIVE debits derived from current graph, scoped to THIS budget
const projectDebits =
  projectId
    ? computeProjectDebits(nodes, edges, projectId, { budgetId: budgetNodeId })
    : { lines: [], byPhase: { design: 0, dev: 0, ops: 0 }, total: 0 };

const budgetDebits = {
  lines: (projectDebits.lines ?? []).map((l) => ({
    personName: l.personName,
    phase: l.phase,
    amount: safeNum(l.amount),
    color: l.color ?? '#999',
  })),
  byPhase: {
    design: safeNum(projectDebits.byPhase?.design ?? 0),
    dev: safeNum(projectDebits.byPhase?.dev ?? 0),
    ops: safeNum(projectDebits.byPhase?.ops ?? 0),
  },
  total: safeNum(projectDebits.total ?? 0),
};
  // Net (allow negative)
  const net = {
  design: gross.design - budgetDebits.byPhase.design,
  dev: gross.dev - budgetDebits.byPhase.dev,
  ops: gross.ops - budgetDebits.byPhase.ops,
};
const grossTotal = gross.design + gross.dev + gross.ops;
const netTotal = net.design + net.dev + net.ops;
return { projectId, debits: budgetDebits, gross, net, grossTotal, netTotal };
}


/**
 * Capacity labels/colours
 */
function capacityStatus(projectCount: number) {
  if (projectCount <= 0) return { label: 'Available', color: '#60a5fa' };
  if (projectCount === 1) return { label: 'Lightly Allocated', color: '#16a34a' };
  if (projectCount <= 3) return { label: 'In Motion', color: '#dc2626' };
  if (projectCount <= 5) return { label: 'At Capacity', color: '#4c1d95' };
  return { label: 'Overallocated', color: '#111827' };
}

/**
 * Auto-titles
 */
function applyProjectTitleToTimeline(nodes: RFNode<GraphNodeData>[], projectId: string, timelineId: string) {
  const project = nodes.find((n) => n.id === projectId);
  const timeline = nodes.find((n) => n.id === timelineId);
  if (!project || !timeline) return nodes;
  if (project.data.kind !== 'project' || timeline.data.kind !== 'timeline') return nodes;

  const projectTitle = (project.data as ProjectData).title;
  const projectStudio = (project.data as ProjectData).studio ?? 'Antinomy Studio';
  const t = timeline.data as TimelineData;
  if (!t.autoTitle) return nodes;

  return nodes.map((n) => (n.id === timelineId ? { ...n,  data: { ...t, studio: projectStudio, title: `${projectTitle} — Timeline` }} : n));
}

function applyProjectTitleToBudget(
  nodes: RFNode<GraphNodeData>[],
  projectId: string,
  budgetId: string
) {
  const project = nodes.find((n) => n.id === projectId);
  if (!project || project.data.kind !== 'project') return nodes;

  const projectTitle = (project.data as ProjectData).title;
  const projectStudio = (project.data as ProjectData).studio ?? 'Antinomy Studio';

  return nodes.map((n) => {
    if (n.id !== budgetId) return n;
    if (n.data.kind !== 'budget') return n;

    const current = n.data as BudgetData; // IMPORTANT: use current data, not a stale "b"

    if (!current.autoTitle) return n;

    return {
      ...n,
      data: {
        ...current, // preserves externals + everything else
        studio: projectStudio,
        title: `${projectTitle} — Budget`,
      },
    };
  });
}

/**
 * Persistence
 */
function readPersistedGraph(): PersistedGraph | null {
  try {
    const raw = localStorage.getItem(APP_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedGraph;
if (!parsed || parsed.version !== 1) return null;
if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) return null;

// --- MIGRATION: backfill studio on older graphs (prevents board reset) ---
parsed.nodes = parsed.nodes.map((n: any) => {
  const kind = n?.data?.kind;

  if (kind === 'project') {
    return {
      ...n,
      data: {
        ...n.data,
        studio: n.data.studio ?? 'Antinomy Studio',
      },
    };
  }

  if (kind === 'budget') {
    return {
      ...n,
      data: {
        ...n.data,
        studio: n.data.studio ?? 'Antinomy Studio',
      },
    };
  }

  if (kind === 'timeline') {
    return {
      ...n,
      data: {
        ...n.data,
        studio: n.data.studio ?? 'Antinomy Studio',
      },
    };
  }

  return n;
});

return parsed;
  } catch {
    return null;
  }
}

function writePersistedGraph(p: PersistedGraph) {
  localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(p));
}

function getDefaultGraph(): PersistedGraph {
  return {
    version: 1,
    savedAtISO: new Date().toISOString(),
    viewMode: 'workflow',
    edgeMode: 'radius',
    nodes: [],
    edges: [],
  };
}
type DockSide = 'top' | 'bottom';

type DockState = {
  top?: { otherId: string };
  bottom?: { otherId: string };
};

function isDockableNode(n: RFNode<GraphNodeData>) {
  const k = n.data?.kind as any;
  return k === 'budget' || k === 'timeline';
}

function getNodeSize(n: any) {
  const w = n?.measured?.width ?? n?.width ?? 260;
  const h = n?.measured?.height ?? n?.height ?? 140;
  return { w, h };
}

function computeDockState(
  nodes: RFNode<GraphNodeData>[],
  opts: { dockGap: number; snapDist: number; xSnapDist: number }
) {
  const { dockGap, snapDist, xSnapDist } = opts;

  const dock: Record<string, DockState> = {};
  const best: Record<string, { top?: number; bottom?: number }> = {};

  const dockables = nodes.filter(isDockableNode);

  for (const a of dockables) {
    for (const b of dockables) {
      if (a.id === b.id) continue;

      const aPos = a.position;
      const bPos = b.position;

      const { h: bH } = getNodeSize(b);

      // a docked BELOW b  => a.top + b.bottom relationship
      const expectedYBelow = bPos.y + bH + dockGap;
      const dyBelow = Math.abs(aPos.y - expectedYBelow);
      const dx = Math.abs(aPos.x - bPos.x);

      if (dx <= xSnapDist && dyBelow <= snapDist) {
        // a.top docked to b.bottom
        best[a.id] ??= {};
        best[b.id] ??= {};

        if (best[a.id].top === undefined || dyBelow < best[a.id].top!) {
          best[a.id].top = dyBelow;
          dock[a.id] ??= {};
          dock[a.id].top = { otherId: b.id };
        }

        if (best[b.id].bottom === undefined || dyBelow < best[b.id].bottom!) {
          best[b.id].bottom = dyBelow;
          dock[b.id] ??= {};
          dock[b.id].bottom = { otherId: a.id };
        }
      }

      // a docked ABOVE b => a.bottom + b.top relationship
      const { h: aH } = getNodeSize(a);
      const expectedYAbove = bPos.y - dockGap - aH;
      const dyAbove = Math.abs(aPos.y - expectedYAbove);

      if (dx <= xSnapDist && dyAbove <= snapDist) {
        best[a.id] ??= {};
        best[b.id] ??= {};

        if (best[a.id].bottom === undefined || dyAbove < best[a.id].bottom!) {
          best[a.id].bottom = dyAbove;
          dock[a.id] ??= {};
          dock[a.id].bottom = { otherId: b.id };
        }

        if (best[b.id].top === undefined || dyAbove < best[b.id].top!) {
          best[b.id].top = dyAbove;
          dock[b.id] ??= {};
          dock[b.id].top = { otherId: a.id };
        }
      }
    }
  }

  return dock;
}
/**
 * -------------------------
 * Zustand Store
 * -------------------------
 */

const useGraph = create<GraphState>((set, get) => {
  const def = getDefaultGraph();

  return {
    viewMode: def.viewMode,
    setViewMode: (m: ViewMode) => set(() => ({ viewMode: m })),

    // Corner radius for smoothstep edges
    edgeCornerRadius: 50,
    setEdgeCornerRadius: (r: number) => set(() => ({ edgeCornerRadius: r })),

    // Edge mode (default = Radius)
    edgeMode: def.edgeMode ?? 'radius',
    setEdgeMode: (m: 'radius' | 'bezier') =>
    set((s) => ({
    edgeMode: m,
    edges: s.edges.map((e) => ({
      ...e,
      type: m === 'radius' ? 'smoothstep' : 'default', // 'default' renders bezier
    })),
  })),

    nodes: def.nodes ?? [],
    edges: def.edges ?? [],

    selectedNodeId: null,
    selectedEdgeId: null,

    hydrateFromPersisted: (p: PersistedGraph) => {
      const hydratedNodes = (p.nodes ?? []).map((n) => ({
        ...n,
        type: reactFlowTypeForNode((n.data as any).kind),
      }));

      set(() => ({
        viewMode: p.viewMode ?? 'workflow',
        edgeMode: p.edgeMode ?? 'radius',
        nodes: hydratedNodes,
        edges: p.edges ?? [],
        selectedNodeId: null,
        selectedEdgeId: null,
      }));
    },

    resetGraph: () => {
      const fresh = getDefaultGraph();
      set(() => ({
        viewMode: fresh.viewMode,
        nodes: fresh.nodes,
        edges: fresh.edges,
        selectedNodeId: null,
        selectedEdgeId: null,
      }));
    },

    addPerson: () =>
      set((s) => ({
        nodes: [
          ...s.nodes,
          {
            id: `person-${nanoid(6)}`,
            type: 'personNode',
            position: { x: 80, y: 260 + Math.random() * 320 },
            data: {
              title: 'New Person',
              kind: 'person',
              dept: 'unassigned',
              color: DEPT_COLOURS.unassigned,
              isExternal: false,
              externalFeeEUR: 0,
              billToBudgetId: null,
              billToPhase: 'design',
            },
          },
        ],
      })),

    addCapacity: () =>
      set((s) => ({
        nodes: [
          ...s.nodes,
          {
            id: `capacity-${nanoid(6)}`,
            type: 'capacityNode',
            position: { x: 80, y: 260 + Math.random() * 320 },
            data: { title: 'Capacity', kind: 'capacity' },
          },
        ],
      })),

    addProject: () =>
      set((s) => ({
        nodes: [
          ...s.nodes,
          {
            id: `project-${nanoid(6)}`,
            type: 'projectNode',
            position: { x: 420, y: 240 + Math.random() * 320 },
            data: {
              kind: 'project',
              title: 'New Project',
              studio: 'Antinomy Studio',
              client: '',
},
          },
        ],
      })),

    addBudget: () =>
      set((s) => ({
        nodes: [
          ...s.nodes,
          {
            id: `budget-${nanoid(6)}`,
            type: 'budgetNode',
            position: { x: 820, y: 240 + Math.random() * 320 },
            data: {
              title: 'New Budget',
              studio: 'Antinomy Studio',
              kind: 'budget',
              currency: 'EUR',
              designAmount: 0,
              devAmount: 0,
              opsAmount: 0,
              autoTitle: true,
              externals: [], // ✅ add this
            },
          },
        ],
      })),

    addTimeline: () =>
      set((s) => ({
        nodes: [
          ...s.nodes,
          {
            id: `timeline-${nanoid(6)}`,
            type: 'timelineNode',
            position: { x: 820, y: 240 + Math.random() * 320 },
            data: {
              title: 'New Timeline',
              kind: 'timeline',
              studio: 'Antinomy Studio',
              startDate: todayISO(),
              endDate: todayISO(),
              autoTitle: true,
            },
          },
        ],
      })),

    addTurnover: (t) =>
  set((s) => ({
    nodes: [
      ...s.nodes,
      {
        id: `turnover-${t}-${nanoid(6)}`,
        type: 'turnoverNode',
        position: { x: 1180, y: 240 + Math.random() * 420 },
        data: { title: turnoverTitle(t), kind: 'turnover', currency: 'EUR', turnoverType: t },
      },
    ],
  })), // ✅ COMMA HERE


addLedger: () =>
  set((s) => ({
    nodes: [
      ...s.nodes,
      {
        id: `ledger-${nanoid(6)}`,
        type: 'ledgerNode',
        position: { x: 1180, y: 240 + Math.random() * 420 },
        data: { title: 'Ledger', kind: 'ledger', currency: 'EUR' },
      },
    ],
  })), // ✅ COMMA HERE

    onConnect: (c) => {
  const nodes = get().nodes;
  if (!isValidConnectionStrict(nodes, c)) return;

  const color = edgeColorFromSource(nodes, c.source ?? null);

  const label =
    c.sourceHandle === 'project-out' &&
    (c.targetHandle === 'ops' || c.targetHandle === 'design' || c.targetHandle === 'dev')
      ? c.targetHandle
      : c.sourceHandle === 'budget'
      ? 'budget'
      : c.sourceHandle === 'timeline-out' && c.targetHandle === 'resource-in'
      ? 'resource'
      : c.sourceHandle === 'timeline'
      ? 'timeline'
      : c.targetHandle === 'turnover-in'
      ? 'turnover'
      : c.targetHandle === 'capacity-in'
      ? 'capacity'
      : 'linked';

  // ✅ Declare these BEFORE any edge object uses them
  const isRadius = get().edgeMode === 'radius';
  const corner = get().edgeCornerRadius ?? 50;

  const sourceKind = getNodeKindById(nodes, c.source);
  const targetKind = getNodeKindById(nodes, c.target);

  // We want Budget/Timeline to "feed into" Project visually.
  // Without breaking ports, we keep the edge direction as-is and flip the arrow.
  const isProjectToBudgetOrTimeline =
    sourceKind === 'project' && (targetKind === 'budget' || targetKind === 'timeline');

  const newEdge: Edge<GraphEdgeData> = {
    id: `edge-${nanoid(8)}`,
    source: c.source!,
    target: c.target!,
    sourceHandle: c.sourceHandle ?? undefined,
    targetHandle: c.targetHandle ?? undefined,
    label,

       // Arrow direction:
    // - For Project→Budget/Timeline, show arrow at START (points into Project),
    //   and explicitly remove markerEnd so the global defaultEdgeOptions doesn't add a second arrow.
    // - Otherwise default arrow at END.
    ...(isProjectToBudgetOrTimeline
      ? {
          markerStart: { type: MarkerType.ArrowClosed },
          markerEnd: undefined,
        }
      : {
          markerStart: undefined,
          markerEnd: { type: MarkerType.ArrowClosed },
        }),

    // Edge render mode
    type: isRadius ? 'smoothstep' : 'default',

    // smoothstep-only corner rounding
    ...(isRadius ? ({ pathOptions: { borderRadius: corner } } as any) : {}),

    style: {
      strokeWidth: (c.source ?? '').startsWith('person') ? 3 : 2,
      stroke: color,
    },
    data: { color },
  };

  // 1) Add the edge (ONCE)
  set((s) => ({ edges: addEdge(newEdge, s.edges) }));

  // 2) Post-connect side-effects (titles/studio propagation only)

  // Project → Timeline
  if (sourceKind === 'project' && targetKind === 'timeline') {
    const projectId = c.source!;
    const timelineId = c.target!;
    set((s) => ({ nodes: applyProjectTitleToTimeline(s.nodes, projectId, timelineId) }));
    return;
  }

  // Project → Budget (NO external snapshotting anymore)
  if (sourceKind === 'project' && targetKind === 'budget') {
    const projectId = c.source!;
    const budgetId = c.target!;
    set((s) => ({ nodes: applyProjectTitleToBudget(s.nodes, projectId, budgetId) }));
    return;
  }
},

    onNodesChange: (changes) =>
  set((s) => {
    // --- 0) Magnetic snap for Budget/Timeline drags (never snaps projects) ---
    const snappedChanges = changes.map((ch) => {
  if (ch.type !== 'position') return ch;

  const anyCh = ch as any;
  if (!anyCh.dragging) return ch;

  const movedId = anyCh.id as string;
  const movingNode = s.nodes.find((n) => n.id === movedId);
  if (!movingNode) return ch;

  const movingKind = movingNode.data?.kind as NodeKind | undefined;

  // Projects have special group-drag logic; never snap them.
  if (movingKind === 'project') return ch;

  // Only snap budget/timeline
  if (!movingKind || !isDockableKind(movingKind)) return ch;

  const movingPos = (anyCh.position ?? movingNode.position) as { x: number; y: number };

  // Fallback sizes (only used if RF hasn't measured width/height yet)
  const movingW =
    (movingNode as any).width ?? (movingKind === 'budget' ? 320 : 260);
  const movingH =
    (movingNode as any).height ?? (movingKind === 'budget' ? 240 : 140);

  let best: { x: number; y: number } | null = null;
  let bestScore = Infinity;

  const movingCenterX = movingPos.x + movingW / 2;

  for (const target of s.nodes) {
    if (target.id === movedId) continue;

    const targetKind = target.data?.kind as NodeKind | undefined;
    if (!targetKind || !isDockableKind(targetKind)) continue;

    const targetW =
      (target as any).width ?? (targetKind === 'budget' ? 320 : 260);
    const targetH =
      (target as any).height ?? (targetKind === 'budget' ? 240 : 140);

    const targetCenterX = target.position.x + targetW / 2;

       // ✅ Prevent ghost snapping: only consider targets that are reasonably aligned in X
    if (Math.abs(movingCenterX - targetCenterX) > DOCK_X_SNAP_DIST) continue;

    const snapped = snapDockPosition(
      { x: movingPos.x, y: movingPos.y, width: movingW, height: movingH },
      { x: target.position.x, y: target.position.y, width: targetW, height: targetH },
      {
        dockGap: DOCK_Y_GAP,
        snapY: DOCK_SNAP_DIST,
        snapX: 0, // 👈 we are NOT snapping X in this pass
      }
    );

    if (!snapped) continue;

    // Only care about Y movement (we're not snapping X)
    const score = Math.abs(snapped.y - movingPos.y);
    if (score < bestScore) {
      bestScore = score;
      best = snapped;
    }
  }

  return best ? ({ ...anyCh, position: best } as any) : ch;
});

    // --- 1) Apply the changes normally first (use snappedChanges) ---
    const nextNodes = applyNodeChanges(snappedChanges, s.nodes);

    // --- 2) Group-drag only if a PROJECT is actively being dragged ---
    const projectDrag = snappedChanges.find((ch) => {
      if (ch.type !== 'position') return false;
      const anyCh = ch as any;
      if (!anyCh.dragging) return false;

      const movedId = anyCh.id as string;
      const prev = s.nodes.find((n) => n.id === movedId);
      return prev?.data?.kind === 'project';
    }) as any;

    if (!projectDrag) {
      return { nodes: nextNodes };
    }

    const projectId = projectDrag.id as string;

    const prevProject = s.nodes.find((n) => n.id === projectId);
    const nextProject = nextNodes.find((n) => n.id === projectId);

    if (!prevProject || !nextProject) {
      return { nodes: nextNodes };
    }

    const dx = nextProject.position.x - prevProject.position.x;
    const dy = nextProject.position.y - prevProject.position.y;

    if (dx === 0 && dy === 0) {
      return { nodes: nextNodes };
    }

    // one-hop connected nodes = organism
    const connectedIds = new Set<string>();
    for (const e of s.edges) {
      if (e.source === projectId) connectedIds.add(e.target);
      if (e.target === projectId) connectedIds.add(e.source);
    }

    const draggedNodes = nextNodes.map((n) => {
      if (n.id === projectId) return n;
      if (!connectedIds.has(n.id)) return n;

      return {
        ...n,
        position: { x: n.position.x + dx, y: n.position.y + dy },
      };
    });

    return { nodes: draggedNodes };
  }),

    onEdgesChange: (changes) => set((s) => ({ edges: applyEdgeChanges(changes, s.edges) })),

    selectNode: (id) => set(() => ({ selectedNodeId: id, selectedEdgeId: null })),
    selectEdge: (id) => set(() => ({ selectedEdgeId: id, selectedNodeId: null })),

    updateNodeTitle: (id, title) =>
      set((s) => ({
        nodes: s.nodes.map((n) => (n.id === id ? { ...n, data: { ...(n.data as any), title, autoTitle: false } } : n)),
      })),

    updatePersonMeta: (id, patch) =>
      set((s) => {
        const updatedNodes = s.nodes.map((n) => {
          if (n.id !== id) return n;
          if (n.data.kind !== 'person') return n;

          const p = n.data as PersonData;
          const nextDept = (patch.dept ?? p.dept) as Dept;
          const nextColor = DEPT_COLOURS[nextDept] ?? DEPT_COLOURS.unassigned;

          const nextIsExternal = patch.isExternal ?? p.isExternal;
          const nextFee = nextIsExternal ? safeNum(patch.externalFeeEUR ?? p.externalFeeEUR) : 0;
          const nextBillToBudgetId =
  patch.billToBudgetId !== undefined ? patch.billToBudgetId : (p as any).billToBudgetId ?? null;

const nextBillToPhase =
  patch.billToPhase !== undefined ? patch.billToPhase : (p as any).billToPhase ?? 'design';

          return {
            ...n,
            data: {
              ...p,
              ...patch,
              dept: nextDept,
              color: nextColor,
              externalFeeEUR: nextFee,
              billToBudgetId: nextBillToBudgetId,
              billToPhase: nextBillToPhase,
            },
          };
        });

        const person = updatedNodes.find((n) => n.id === id);
        const newColor =
          person?.data.kind === 'person' ? (person.data as PersonData).color : DEPT_COLOURS.unassigned;

        const updatedEdges = s.edges.map((e) => {
          if (e.source !== id) return e;
          return {
            ...e,
            style: { ...(e.style ?? {}), stroke: newColor, strokeWidth: 3 },
            data: { ...(e.data ?? {}), color: newColor },
          };
        });

        return { nodes: updatedNodes, edges: updatedEdges };
      }),
      updateProjectStudio: (id, studio) =>
  set((s) => ({
    nodes: s.nodes.map((n) => {
      if (n.id !== id) return n;
      if (n.data.kind !== 'project') return n;
      return { ...n, data: { ...(n.data as ProjectData), studio } };
    }),
  })),

updateProjectClient: (id, client) =>
  set((s) => ({
    nodes: s.nodes.map((n) => {
      if (n.id !== id) return n;
      if (n.data.kind !== 'project') return n;
      return { ...n, data: { ...(n.data as ProjectData), client } };
    }),
  })),

    updateTimelineDates: (id, patch) =>
      set((s) => ({
        nodes: s.nodes.map((n) => {
          if (n.id !== id) return n;
          if (n.data.kind !== 'timeline') return n;
          return { ...n, data: { ...(n.data as TimelineData), ...patch } };
        }),
      })),

    updateBudgetPhases: (id, patch) =>
      set((s) => ({
        nodes: s.nodes.map((n) => {
          if (n.id !== id) return n;
          if (n.data.kind !== 'budget') return n;
          return { ...n, data: { ...(n.data as BudgetData), ...patch } };
        }),
      })),

    updateEdgeLabel: (id, label) => set((s) => ({ edges: s.edges.map((e) => (e.id === id ? { ...e, label } : e)) })),

    updateEdgeConnection: (edgeId, newConn) =>
  set((s) => {
    if (!isValidConnectionStrict(s.nodes, newConn)) return {};

    return {
      edges: s.edges.map((e) => {
        if (e.id !== edgeId) return e;

        const nextSource = newConn.source ?? e.source;
        const nextTarget = newConn.target ?? e.target;

        // ✅ IMPORTANT: ReactFlow often gives undefined for handles during drag updates.
        // Preserve the old handles unless a new one is explicitly provided.
        const nextSourceHandle = newConn.sourceHandle ?? e.sourceHandle;
        const nextTargetHandle = newConn.targetHandle ?? e.targetHandle;

        const newColor = edgeColorFromSource(s.nodes, nextSource);

        // ✅ Recompute label based on the *new* handles (same logic as onConnect)
        const nextLabel =
          nextSourceHandle === 'project-out' &&
          (nextTargetHandle === 'ops' || nextTargetHandle === 'design' || nextTargetHandle === 'dev')
            ? nextTargetHandle
            : nextSourceHandle === 'budget'
            ? 'budget'
            : nextSourceHandle === 'timeline'
            ? 'timeline'
            : nextTargetHandle === 'turnover-in'
            ? 'turnover'
            : nextTargetHandle === 'capacity-in'
            ? 'capacity'
            : 'linked';

        const nextStrokeWidth = String(nextSource ?? '').startsWith('person') ? 3 : 2;

        return {
          ...e,
          source: nextSource,
          target: nextTarget,
          sourceHandle: nextSourceHandle ?? undefined,
          targetHandle: nextTargetHandle ?? undefined,
          label: nextLabel,
          style: { ...(e.style ?? {}), stroke: newColor, strokeWidth: nextStrokeWidth },
          data: { ...(e.data ?? {}), color: newColor },
        };
      }),

      // ✅ Side-effects when an edge is dragged onto a new node:
      // update derived titles/studio for Project → Budget / Timeline
      nodes: (() => {
        const edge = s.edges.find((x) => x.id === edgeId);
        if (!edge) return s.nodes;

        const nextSource = newConn.source ?? edge.source;
        const nextTarget = newConn.target ?? edge.target;

        const sourceKind = getNodeKindById(s.nodes, nextSource);
        const targetKind = getNodeKindById(s.nodes, nextTarget);

        if (sourceKind === 'project' && targetKind === 'budget') {
          return applyProjectTitleToBudget(s.nodes, nextSource, nextTarget);
        }

        if (sourceKind === 'project' && targetKind === 'timeline') {
          return applyProjectTitleToTimeline(s.nodes, nextSource, nextTarget);
        }

        return s.nodes;
      })(),
    };
  }),

    deleteEdge: (edgeId) =>
      set((s) => ({
        edges: s.edges.filter((e) => e.id !== edgeId),
        selectedEdgeId: s.selectedEdgeId === edgeId ? null : s.selectedEdgeId,
      })),
  };
});

/**
 * -------------------------
 * Node Components
 * -------------------------
 */

function PersonNode({ data }: { id: string; data: GraphNodeData }) {
  if (data.kind !== 'person') return null;

  return (
  <div className="node-card" style={card({ minWidth: 240, background: getNodeBg('person') })}>
      <Handle type="target" position={Position.Left} id="capacity-in" style={{ ...tinyPort(), top: 26 }} />
      <Handle type="source" position={Position.Right} id="project-out" style={{ width: 10, height: 10, background: data.color, border: '2px solid white' }} />
      <Handle type="source" position={Position.Left} id="timeline-out" style={{ ...tinyPort() }} />

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <span style={{ width: 10, height: 10, borderRadius: 999, background: data.color, marginTop: 4 }} />
        <div style={{ width: '100%' }}>
          <div style={{ fontWeight: 650, fontSize: 13 }}>{data.title}</div>
          <div style={{ fontSize: 11, opacity: 0.55 }}>person</div>

          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={pill()}>{data.isExternal ? 'EXTERNAL' : deptLabel(data.dept).toUpperCase()}</span>
            {data.isExternal && (
              <span style={{ marginLeft: 'auto', fontSize: 11, opacity: 0.75 }}>{formatEUR(data.externalFeeEUR)}</span>
            )}
          </div>

          <div style={{ marginTop: 8, display: 'flex', fontSize: 11, opacity: 0.55 }}>
            <span>⬅ capacity</span>
            <span style={{ marginLeft: 'auto' }}>project ➜</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function CapacityNode({ id, data }: { id: string; data: GraphNodeData }) {
  if (data.kind !== 'capacity') return null;

  const nodes = useGraph((s) => s.nodes);
  const edges = useGraph((s) => s.edges);

  const personEdge = edges.find((e) => e.source === id && getNodeKindById(nodes, e.target) === 'person');
  const personId = personEdge?.target ?? null;
  const personNode = personId ? nodes.find((n) => n.id === personId) : null;

  const personProjectEdges = personId
    ? edges.filter((e) => e.source === personId && getNodeKindById(nodes, e.target) === 'project')
    : [];

  const uniqueProjectIds = Array.from(new Set(personProjectEdges.map((e) => e.target)));
  const projectCountForPerson = uniqueProjectIds.length;

  const activeProjectIds = new Set<string>();
  for (const e of edges) {
    const sourceKind = getNodeKindById(nodes, e.source);
    const targetKind = getNodeKindById(nodes, e.target);
    if (sourceKind === 'person' && targetKind === 'project') activeProjectIds.add(e.target);
  }
  const totalActiveProjects = activeProjectIds.size;

  const status = capacityStatus(projectCountForPerson);

  return (
    <div style={card({ minWidth: 280 })}>
      <Handle type="source" position={Position.Right} id="capacity-out" style={tinyPort()} />

      <div style={{ fontWeight: 650, fontSize: 13 }}>{data.title}</div>
      <div style={{ fontSize: 11, opacity: 0.55 }}>capacity</div>

      <div
        style={{
          marginTop: 10,
          padding: 10,
          borderRadius: 12,
          border: '1px solid rgba(0,0,0,0.08)',
          background: 'rgba(0,0,0,0.02)',
        }}
      >
        <div style={{ fontSize: 11, opacity: 0.6 }}>Person</div>
        <div style={{ fontWeight: 650, fontSize: 13 }}>
          {personNode?.data.kind === 'person' ? (personNode.data as PersonData).title : 'Unassigned'}
        </div>

        <div style={{ marginTop: 10, fontSize: 11, opacity: 0.6 }}>Load</div>
        <div style={{ fontWeight: 750, fontSize: 14, color: status.color }}>{status.label}</div>

        <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr auto', gap: 6 }}>
          <div style={{ fontSize: 11, opacity: 0.6 }}>Projects on this person</div>
          <div style={{ fontSize: 11, fontWeight: 700 }}>{projectCountForPerson}</div>
          <div style={{ fontSize: 11, opacity: 0.6 }}>Total active projects</div>
          <div style={{ fontSize: 11, fontWeight: 700 }}>{totalActiveProjects}</div>
        </div>
      </div>
    </div>
  );
}
// --- Shared port defs for Project nodes ---
// IMPORTANT: these `y` values drive BOTH handle positions AND label positions.
const PROJECT_TEAM_PORTS = [
  { id: 'ops', label: 'OPS', y: 146 },
  { id: 'design', label: 'DESIGN', y: 176 },
  { id: 'dev', label: 'DEV', y: 206 },
] as const;

const PROJECT_OUTPUT_PORTS = [
  { id: 'budget', label: 'Budgets', y: 166 },
  { id: 'timeline', label: 'Timelines', y: 196 },
] as const;

const PROJECT_PORT_Y_OFFSET = 10;

// --- Shared DockClip (define ONCE) ---
function DockClip({ side }: { side: 'top' | 'bottom' }) {
  const isTop = side === 'top';

  return (
    <>
      {/* vertical staple clip */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          transform: 'translateX(-50%)',
          [isTop ? 'top' : 'bottom']: -8,
          width: 12,
          height: 18,
          borderRadius: 6,
          border: `2px solid ${BUREAU_GREEN}`,
          background: 'white',
          boxShadow: '0 2px 6px rgba(0,0,0,0.12)',
          zIndex: 5,
          pointerEvents: 'none',
        }}
      />

      {/* thin accent strip along dock edge */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          [isTop ? 'top' : 'bottom']: 0,
          height: 3,
          background: BUREAU_GREEN,
          borderRadius: isTop ? '6px 6px 0 0' : '0 0 6px 6px',
          opacity: 0.9,
          pointerEvents: 'none',
        }}
      />
    </>
  );
}

function CountBadge({ n }: { n: number }) {
  return (
    <span
      style={{
        height: 18,
        minWidth: 18,
        padding: '0 6px',          // makes 2–3 digits become a pill
        borderRadius: 999,
        background: BUREAU_GREEN,  // bureau green
        color: 'white',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 12,
        fontWeight: 900,
        lineHeight: 1,
        boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
      }}
    >
      {n}
    </span>
  );
}

function ProjectNodeBase({ id, data }: { id: string; data: GraphNodeData }) {
  if (data.kind !== 'project') return null;

  const studio = (data as any).studio ?? 'Antinomy Studio';
  const is27b = studio === '27b';
  const client = String((data as any).client ?? '').trim();

  const nodes = useGraph((s) => s.nodes);
  const edges = useGraph((s) => s.edges);

  // computed ONLY from budgets connected to THIS project
  const { gross, net, budgetCount, signedCount } = computeProjectBudgetTotals(nodes, edges, id);

  // timeline count connected to THIS project
  const timelineCount = computeProjectTimelineCount(nodes, edges, id);

  // team membership inferred from person ↔ project dept-handle edges
  const teamByDept = computeProjectTeamByDept(nodes, edges, id);
  const teamCount = {
    ops: teamByDept.ops.length,
    design: teamByDept.design.length,
    dev: teamByDept.dev.length,
  };

  const railLabelBase: React.CSSProperties = {
    fontFamily: 'var(--font-mono)',
    fontWeight: 400,
    fontSize: 12,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    opacity: is27b ? 0.78 : 0.72,
  };

  const CountBadge = ({ count }: { count: number }) => {
    const s = String(count);
    const isPill = s.length >= 2;
    return (
      <span
        style={{
          height: 18,
          minWidth: 18,
          padding: isPill ? '0 7px' : 0,
          borderRadius: 999,
          display: 'grid',
          placeItems: 'center',
          background: BUREAU_GREEN,
          color: 'white',
          fontSize: 11,
          fontWeight: 600,
          fontFamily: 'var(--font-mono)',
          lineHeight: 1,
        }}
      >
        {s}
      </span>
    );
  };

  const NamePill = ({ text }: { text: string }) => (
    <span
      style={{
        height: 18,
        padding: '0 8px',
        borderRadius: 999,
        display: 'inline-flex',
        alignItems: 'center',
        background: BUREAU_GREEN,
        color: 'white',
        fontSize: 11,
        fontWeight: 600,
        fontFamily: 'var(--font-mono)',
        lineHeight: 1,
      }}
    >
      {text}
    </span>
  );

  const getPersonName = (pid: string) => {
    const pn = nodes.find((n) => n.id === pid);
    return String((pn?.data as any)?.title ?? '').trim();
  };

  const needsSignedAttention = budgetCount > 0 && signedCount < budgetCount;
  const signedLabel = budgetCount === 0 ? '—' : `${signedCount}/${budgetCount}`;

  return (
    <div
      style={card({
        minWidth: 380,
        maxWidth: 560,
        position: 'relative',
        overflow: 'visible',
        background: is27b ? '#0b0b0c' : '#fbfbfc',
        border: is27b ? '1px solid rgba(255,255,255,0.14)' : `1px solid ${BUREAU_GREEN}`,
        boxShadow: is27b ? '0 10px 24px rgba(0,0,0,0.40)' : '0 8px 20px rgba(0,0,0,0.06), 0 0 0 2px rgba(0,114,49,0.06)',
        color: is27b ? 'rgba(255,255,255,0.92)' : 'rgba(0,0,0,0.92)',
        padding: 18,
      })}
    >
      {/* Handles */}
      {PROJECT_TEAM_PORTS.map((p) => (
        <Handle
          key={p.id}
          type="target"
          position={Position.Left}
          id={String(p.id)}
          style={{ ...tinyPort(), top: p.y }}
        />
      ))}

      {PROJECT_OUTPUT_PORTS.map((p) => (
        <Handle
          key={p.id}
          type="source"
          position={Position.Right}
          id={String(p.id)}
          style={{ ...tinyPort(), top: p.y }}
        />
      ))}

      {/* Left rail labels (aligned to handles) + dept count badge (badge closest to node edge) */}
{PROJECT_TEAM_PORTS.map((p) => {
  const dept = p.id as 'ops' | 'design' | 'dev';
  const c = teamCount[dept] ?? 0;

  return (
    <div
      key={p.id}
      style={{
        position: 'absolute',
        left: 26,
        top: p.y,
        transform: 'translateY(-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        pointerEvents: 'none',
        userSelect: 'none',
      }}
    >
      {/* count first so it sits nearest the node edge */}
      {c > 0 && <CountBadge count={c} />}

      <span style={railLabelBase}>{String(p.label).toUpperCase()}</span>
    </div>
  );
})}

      {/* Right rail labels (aligned to handles) — label + count badge */}
      <div
        style={{
          position: 'absolute',
          right: 26,
          top: 0,
          bottom: 0,
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      >
        {/* Budgets */}
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: PROJECT_OUTPUT_PORTS[0].y,
            transform: 'translateY(-50%)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            whiteSpace: 'nowrap',
          }}
        >
          <span style={railLabelBase}>{String(PROJECT_OUTPUT_PORTS[0].label).toUpperCase()}</span>
          {budgetCount > 0 && <CountBadge count={budgetCount} />}
        </div>

        {/* Timelines */}
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: PROJECT_OUTPUT_PORTS[1].y,
            transform: 'translateY(-50%)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            whiteSpace: 'nowrap',
          }}
        >
          <span style={railLabelBase}>{String(PROJECT_OUTPUT_PORTS[1].label).toUpperCase()}</span>
          {timelineCount > 0 && <CountBadge count={timelineCount} />}
        </div>
      </div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div
          style={{
            width: 16,
            height: 16,
            borderRadius: 999,
            background: is27b ? '#ff0800' : BUREAU_GREEN,
            boxShadow: '0 6px 18px rgba(0,0,0,0.08)',
            marginTop: 6,
            flex: '0 0 auto',
          }}
        />

        <div
          style={{
            fontWeight: 900,
            fontSize: 28,
            letterSpacing: -0.4,
            lineHeight: 1.08,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
          title={data.title}
        >
          {data.title}
        </div>
      </div>

      {/* Meta line */}
      <div
        style={{
          marginTop: 8,
          fontSize: 11,
          opacity: 0.7,
          display: 'flex',
          gap: 6,
          alignItems: 'baseline',
          flexWrap: 'wrap',
        }}
      >
        <span style={{ opacity: 0.65 }}>studio •</span>
        <span style={{ fontWeight: 750, color: is27b ? '#ff0800' : undefined }}>{studio}</span>
        <span style={{ opacity: 0.35 }}>·</span>
        <span style={{ opacity: 0.65 }}>client •</span>
        <span style={{ fontWeight: 650, opacity: client ? 0.9 : 0.45 }}>{client || 'Client —'}</span>
      </div>

      {/* Signed row */}
      <div
        style={{
          marginTop: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          fontSize: 12,
          opacity: 0.82,
        }}
      >
        <div style={{ fontWeight: 850 }}>Signed</div>
        <div style={{ fontWeight: 900, fontSize: 18, opacity: 0.95 }}>{signedLabel}</div>

        {needsSignedAttention && (
          <div
            title="Not all connected budgets are signed"
            style={{
              marginLeft: 2,
              width: 18,
              height: 18,
              borderRadius: 999,
              display: 'grid',
              placeItems: 'center',
              fontSize: 12,
              fontWeight: 900,
              lineHeight: 1,
              color: is27b ? '#ff0800' : '#b45309',
              background: is27b ? 'rgba(255,8,0,0.10)' : 'rgba(245,158,11,0.14)',
              border: is27b ? '1px solid rgba(255,8,0,0.25)' : '1px solid rgba(245,158,11,0.30)',
            }}
          >
            !
          </div>
        )}
      </div>

      {/* Reserve mid-zone for handles/rails */}
      <div style={{ height: 108 }} />

      {/* Team block (names as green pills) */}
      <div style={{ marginTop: 4 }}>
        <div style={{ fontSize: 12, fontWeight: 600, opacity: is27b ? 0.75 : 0.65 }}>Team</div>

        {(
          [
            { key: 'ops', label: 'OPS' },
            { key: 'design', label: 'DES' },
            { key: 'dev', label: 'DEV' },
          ] as const
        ).map((row) => {
          const ids = teamByDept[row.key];
          const names = ids.map(getPersonName).filter(Boolean);

          const maxShown = 3;
          const shown = names.slice(0, maxShown);
          const extra = Math.max(0, names.length - shown.length);

          return (
            <div
              key={row.key}
              style={{
                marginTop: 10,
                display: 'grid',
                gridTemplateColumns: '44px 1fr',
                columnGap: 12,
                alignItems: 'start',
              }}
            >
              <div style={railLabelBase}>{row.label}</div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                {shown.length === 0 ? (
                  <span style={{ opacity: is27b ? 0.45 : 0.4 }}>—</span>
                ) : (
                  <>
                    {shown.map((n) => (
                      <NamePill key={n} text={n} />
                    ))}
                    {extra > 0 && <NamePill text={`+${extra}`} />}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Divider */}
      <div
        style={{
          height: 1,
          background: is27b ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)',
          marginTop: 18,
          marginBottom: 14,
        }}
      />

      {/* Net / Gross */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', rowGap: 12 }}>
        <div style={{ fontWeight: 900, fontSize: 18, letterSpacing: 0.2 }}>NET</div>
        <div style={{ fontWeight: 900, fontSize: 18 }}>{formatEUR(net)}</div>

        <div style={{ fontWeight: 850, fontSize: 18, opacity: 0.6 }}>GROSS</div>
        <div style={{ fontWeight: 850, fontSize: 18, opacity: 0.6 }}>{formatEUR(gross)}</div>
      </div>
    </div>
  );
}

// Keep both exports so you can switch nodeTypes between them.
function ProjectNodeV2({ id, data }: { id: string; data: GraphNodeData }) {
  return <ProjectNodeBase id={id} data={data} />;
}

function ProjectNodeV1({ id, data }: { id: string; data: GraphNodeData }) {
  return <ProjectNodeBase id={id} data={data} />;
}

function BudgetNode({ id, data, selected }: NodeProps<GraphNodeData>) {
  if (data.kind !== 'budget') return null;

  const nodes = useGraph((s) => s.nodes);
  const edges = useGraph((s) => s.edges);

  const computed = computeBudgetNetForBudgetNode(nodes, edges, id);
  const grossTotal = computed?.grossTotal ?? budgetTotal(data);
  const netTotal = computed?.netTotal ?? budgetTotal(data);

  const grossDesign = computed?.gross.design ?? safeNum(data.designAmount);
  const grossDev = computed?.gross.dev ?? safeNum(data.devAmount);
  const grossOps = computed?.gross.ops ?? safeNum(data.opsAmount);

  const netDesign = computed?.net.design ?? grossDesign;
  const netDev = computed?.net.dev ?? grossDev;
  const netOps = computed?.net.ops ?? grossOps;

  const debitLines = computed?.debits.lines ?? [];
  const debitTotal = computed?.debits.total ?? 0;

  const studio = (data as BudgetData).studio ?? 'Antinomy Studio';
  const is27b = studio === '27b';

  // injected by displayNodes (visual-only)
  const dock = (data as any).dock as { top?: boolean; bottom?: boolean } | undefined;

  return (
    <div
      style={card({
        minWidth: 320,
        position: 'relative',
        overflow: 'visible',
        background: is27b ? '#0b0b0c' : getNodeBg('budget'),
        border: is27b ? '1px solid rgba(255,255,255,0.14)' : '1px solid rgba(0,0,0,0.10)',
        boxShadow: is27b ? '0 10px 24px rgba(0,0,0,0.40)' : '0 8px 20px rgba(0,0,0,0.06)',
        color: is27b ? 'rgba(255,255,255,0.92)' : 'rgba(0,0,0,0.92)',

        ...(selected ? selectedNodeStyle(is27b) : {}),
      })}
    >
      {/* visual-only clip indicators (top/bottom only to keep left handle clear) */}
      {dock?.top && <DockClip side="top" />}
      {dock?.bottom && <DockClip side="bottom" />}

      <Handle type="target" position={Position.Left} id="budget-in" style={tinyPort()} />
      <Handle type="source" position={Position.Right} id="budget-out" style={tinyPort()} />

      <div style={{ fontWeight: 650, fontSize: 13 }}>{data.title}</div>

      <div style={{ fontSize: 11, opacity: 0.65 }}>
        budget •{' '}
        <span style={{ fontWeight: 750, color: is27b ? '#ff0800' : undefined }}>{studio}</span>
      </div>

      <div style={{ marginTop: 10, fontWeight: 750, fontSize: 18 }}>{formatEUR(netTotal)}</div>
      <div style={{ fontSize: 11, opacity: 0.6 }}>Net budget (after external fees)</div>

      <div
        style={{
          marginTop: 10,
          display: 'grid',
          gridTemplateColumns: '1fr auto',
          gap: 6,
          fontSize: 11,
          opacity: 0.85,
        }}
      >
        <div>Design</div>
        <div style={{ fontWeight: 700 }}>
          {formatEUR(netDesign)} <span style={{ opacity: 0.55 }}> / {formatEUR(grossDesign)}</span>
        </div>
        <div>Technology</div>
        <div style={{ fontWeight: 700 }}>
          {formatEUR(netDev)} <span style={{ opacity: 0.55 }}> / {formatEUR(grossDev)}</span>
        </div>
        <div>Ops</div>
        <div style={{ fontWeight: 700 }}>
          {formatEUR(netOps)} <span style={{ opacity: 0.55 }}> / {formatEUR(grossOps)}</span>
        </div>
      </div>

      {debitLines.length > 0 && (
        <div
          style={{
            marginTop: 10,
            padding: 10,
            borderRadius: 12,
            border: is27b ? '1px solid rgba(255,8,0,0.30)' : '1px solid rgba(220,38,38,0.20)',
            background: is27b ? 'rgba(255,8,0,0.08)' : 'rgba(220,38,38,0.04)',
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: is27b ? '#ff0800' : 'rgba(220,38,38,0.92)',
            }}
          >
            Debits
          </div>

          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {debitLines.map((l, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'center',
                  fontSize: 11,
                  color: is27b ? '#ff0800' : 'rgba(220,38,38,0.92)',
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: 999, background: l.color }} />
                <span style={{ fontWeight: 650 }}>{l.personName}</span>
                <span style={{ opacity: 0.75 }}>({l.phase})</span>
                <span style={{ marginLeft: 'auto', fontWeight: 750 }}>− {formatEUR(l.amount)}</span>
              </div>
            ))}
          </div>

          <div
            style={{
              marginTop: 8,
              display: 'flex',
              fontSize: 11,
              color: is27b ? '#ff0800' : 'rgba(220,38,38,0.92)',
              fontWeight: 750,
            }}
          >
            <span>Total debits</span>
            <span style={{ marginLeft: 'auto' }}>− {formatEUR(debitTotal)}</span>
          </div>
        </div>
      )}

      <div
        style={{
          marginTop: 10,
          padding: 10,
          borderRadius: 12,
          border: is27b ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(0,0,0,0.08)',
          background: is27b ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
        }}
      >
        <div style={{ fontSize: 11, opacity: 0.6 }}>Gross total</div>
        <div style={{ fontWeight: 700, fontSize: 13 }}>{formatEUR(grossTotal)}</div>
      </div>
    </div>
  );
}

function TimelineNode({ data, selected }: NodeProps<GraphNodeData>) {
  if (data.kind !== 'timeline') return null;

  const studio = (data as TimelineData).studio ?? 'Antinomy Studio';
  const is27b = studio === '27b';

  // injected by displayNodes (visual-only)
  const dock = (data as any).dock as { top?: boolean; bottom?: boolean } | undefined;

  return (
    <div
      style={card({
        minWidth: 320, // match BudgetNode
        position: 'relative',
        overflow: 'visible',
        background: is27b ? '#0b0b0c' : getNodeBg('timeline'),
        border: is27b ? '1px solid rgba(255,255,255,0.14)' : '1px solid rgba(0,0,0,0.10)',
        boxShadow: is27b ? '0 10px 24px rgba(0,0,0,0.40)' : '0 8px 20px rgba(0,0,0,0.06)',
        color: is27b ? 'rgba(255,255,255,0.92)' : 'rgba(0,0,0,0.92)',

        ...(selected ? selectedNodeStyle(is27b) : {}),
      })}
    >
      {/* visual-only clip indicators (top/bottom only to keep left handle clear) */}
      {dock?.top && <DockClip side="top" />}
      {dock?.bottom && <DockClip side="bottom" />}

      <Handle type="target" position={Position.Left} id="timeline-in" style={tinyPort()} />
      <Handle
        type="target"
        position={Position.Bottom}
        id="resource-in"
        style={{ ...tinyPort(), left: '70%' }}
      />

      <div style={{ fontWeight: 650, fontSize: 13 }}>{data.title}</div>
      <div style={{ fontSize: 11, opacity: 0.65 }}>
        timeline •{' '}
        <span style={{ fontWeight: 750, color: is27b ? '#ff0800' : undefined }}>{studio}</span>
      </div>

      <div
        style={{
          marginTop: 10,
          padding: 10,
          borderRadius: 12,
          border: is27b ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(0,0,0,0.08)',
          background: is27b ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
        }}
      >
        <div style={{ fontSize: 11, opacity: 0.6 }}>Date range</div>

        <div
          style={{
            marginTop: 2,
            display: 'flex',
            alignItems: 'baseline',
            gap: 8,
            fontSize: 13,
            fontWeight: 700,
            lineHeight: 1.2,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
          title={`${data.startDate || '—'} → ${data.endDate || '—'}`}
        >
          <span style={{ opacity: 0.92 }}>{data.startDate || '—'}</span>
          <span style={{ opacity: 0.5, fontWeight: 650 }}>→</span>
          <span style={{ opacity: 0.92 }}>{data.endDate || '—'}</span>
        </div>
      </div>
    </div>
  );
}

function TurnoverNode({ id, data }: { id: string; data: GraphNodeData }) {
  if (data.kind !== 'turnover') return null;

  const nodes = useGraph((s) => s.nodes);
  const edges = useGraph((s) => s.edges);

  const incomingBudgetIds = edges.filter((e) => e.target === id).map((e) => e.source).filter(Boolean);

  const sums = incomingBudgetIds.reduce(
    (acc, nodeId) => {
      const calc = computeBudgetNetForBudgetNode(nodes, edges, nodeId);
      if (!calc) return acc;

      acc.grossTotal += safeNum(calc.grossTotal);
      acc.netTotal += safeNum(calc.netTotal);

      acc.netDesign += safeNum(calc.net.design);
      acc.netDev += safeNum(calc.net.dev);
      acc.netOps += safeNum(calc.net.ops);

      return acc;
    },
    { grossTotal: 0, netTotal: 0, netDesign: 0, netDev: 0, netOps: 0 }
  );

  const isTotal = data.turnoverType === 'gross';

  const displayNet =
    data.turnoverType === 'design'
      ? sums.netDesign
      : data.turnoverType === 'dev'
      ? sums.netDev
      : data.turnoverType === 'ops'
      ? sums.netOps
      : sums.netTotal;

  const debitDelta = Math.max(0, sums.grossTotal - sums.netTotal);

  return (
    <div style={card({ minWidth: 320, background: getNodeBg('turnover', data.turnoverType) })}>
      <Handle type="target" position={Position.Left} id="turnover-in" style={tinyPort()} />

      <div style={{ fontWeight: 650, fontSize: 13 }}>{data.title}</div>
      <div style={{ fontSize: 11, opacity: 0.55 }}>{isTotal ? 'turnover • total' : `turnover • net ${data.turnoverType}`}</div>

      {isTotal ? (
        <>
          <div style={{ marginTop: 10, fontSize: 11, opacity: 0.6 }}>Net</div>
          <div style={{ fontWeight: 800, fontSize: 20 }}>{formatEUR(sums.netTotal)}</div>

          <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr auto', gap: 6 }}>
            <div style={{ fontSize: 11, opacity: 0.6 }}>Gross</div>
            <div style={{ fontSize: 11, fontWeight: 650 }}>{formatEUR(sums.grossTotal)}</div>

            <div style={{ fontSize: 11, opacity: 0.6 }}>Debits</div>
            <div style={{ fontSize: 11, fontWeight: 650, color: 'rgba(220,38,38,0.9)' }}>− {formatEUR(debitDelta)}</div>
          </div>
        </>
      ) : (
        <div style={{ marginTop: 12, fontSize: 18, fontWeight: 800 }}>{formatEUR(displayNet)}</div>
      )}

      <div style={{ marginTop: 10, fontSize: 11, opacity: 0.55 }}>Linked budgets: {incomingBudgetIds.length}</div>
    </div>
  );
}

const nodeTypes = {
  personNode: PersonNode,
  capacityNode: CapacityNode,
  projectNode: ProjectNodeV2,
  budgetNode: BudgetNode,
  timelineNode: TimelineNode,
  turnoverNode: TurnoverNode,
  ledgerNode: LedgerNode, // ✅ add this
};


function LedgerNode({ id, data }: { id: string; data: GraphNodeData }) {
  if (data.kind !== 'ledger') return null;

  const nodes = useGraph((s) => s.nodes);
  const edges = useGraph((s) => s.edges);

  // ✅ Pull ALL budget nodes (no wiring required)
  const allBudgetIds = nodes
    .filter((n) => n.data.kind === 'budget')
    .map((n) => n.id);

  const seenProjects = new Set<string>();

  const sums = allBudgetIds.reduce(
    (acc, nodeId) => {
      const calc = computeBudgetNetForBudgetNode(nodes, edges, nodeId);
      if (!calc) return acc;

      acc.grossTotal += safeNum(calc.grossTotal);
      acc.netTotal += safeNum(calc.netTotal);

      acc.netDesign += safeNum(calc.net.design);
      acc.netDev += safeNum(calc.net.dev);
      acc.netOps += safeNum(calc.net.ops);

      // ✅ Debits rollup (total + count)
      acc.debitsTotal += safeNum(calc.debits?.total);
      acc.debitsCount += calc.debits?.lines?.length ?? 0;

      return acc;
    },
    {
      grossTotal: 0,
      netTotal: 0,
      netDesign: 0,
      netDev: 0,
      netOps: 0,
      debitsTotal: 0,
      debitsCount: 0,
    }
  );

  // ✅ Overruns (negative net only)
  const overrunDesign = Math.min(0, sums.netDesign);
  const overrunDev = Math.min(0, sums.netDev);
  const overrunOps = Math.min(0, sums.netOps);
  const overrunTotal = overrunDesign + overrunDev + overrunOps;
  const hasOverrun = overrunTotal < 0;

  return (
    <div
      className="node-card"
      style={card({ minWidth: 260, background: getNodeBg('turnover') })}
    >
      <div style={{ fontWeight: 700, fontSize: 14 }}>Ledger</div>
      <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 10 }}>
        Totals across all budgets
      </div>

      <div style={{ display: 'flex', gap: 14 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, opacity: 0.65 }}>Gross</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>
            {formatEUR(sums.grossTotal)}
          </div>
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, opacity: 0.65 }}>Net</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>
            {formatEUR(sums.netTotal)}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 12, display: 'grid', gap: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
          <span style={{ opacity: 0.7 }}>Net Design</span>
          <span style={{ fontWeight: 650 }}>{formatEUR(sums.netDesign)}</span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
          <span style={{ opacity: 0.7 }}>Net Dev</span>
          <span style={{ fontWeight: 650 }}>{formatEUR(sums.netDev)}</span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
          <span style={{ opacity: 0.7 }}>Net Ops</span>
          <span style={{ fontWeight: 650 }}>{formatEUR(sums.netOps)}</span>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 12,
            marginTop: 6,
          }}
        >
          <span style={{ opacity: 0.7 }}>Debits</span>
          <span style={{ fontWeight: 650 }}>
            {formatEUR(sums.debitsTotal)}{' '}
            <span style={{ opacity: 0.55 }}>({sums.debitsCount})</span>
          </span>
        </div>

        {hasOverrun && (
          <div
            style={{
              marginTop: 8,
              paddingTop: 8,
              borderTop: '1px solid rgba(0,0,0,0.08)',
              display: 'grid',
              gap: 4,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ opacity: 0.7 }}>Overrun (Total)</span>
              <span style={{ fontWeight: 650 }}>{formatEUR(overrunTotal)}</span>
            </div>

            {overrunDesign < 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ opacity: 0.7 }}>Overrun Design</span>
                <span style={{ fontWeight: 650 }}>{formatEUR(overrunDesign)}</span>
              </div>
            )}

            {overrunDev < 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ opacity: 0.7 }}>Overrun Dev</span>
                <span style={{ fontWeight: 650 }}>{formatEUR(overrunDev)}</span>
              </div>
            )}

            {overrunOps < 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ opacity: 0.7 }}>Overrun Ops</span>
                <span style={{ fontWeight: 650 }}>{formatEUR(overrunOps)}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
/**
 * -------------------------
 * UI Styles (softer)
 * -------------------------
 */

function card(overrides: React.CSSProperties = {}): React.CSSProperties {
  return {
    background: 'white',
    borderRadius: 14,
    border: '1px solid rgba(0,0,0,0.10)',
    padding: 12,
    minWidth: 260,
    boxShadow: '0 8px 20px rgba(0,0,0,0.06)',
    ...overrides,
  };
}

function pill(): React.CSSProperties {
  return {
    fontSize: 10,
    padding: '4px 8px',
    borderRadius: 999,
    border: '1px solid rgba(0,0,0,0.10)',
    background: 'rgba(0,0,0,0.02)',
    fontWeight: 600,
    opacity: 0.85,
  };
}

const BTN_H = 40;
const BUREAU_GREEN = '#007231';
const BUREAU_GREEN_DARK = '#005a27'; // tweak if you want

const btnStyle: React.CSSProperties = {
  padding: '10px 14px',
  borderRadius: 12,
  border: '1px solid rgba(0,0,0,0.06)',
  background: BUREAU_GREEN,
  color: 'white',
  fontWeight: 700,
  fontSize: 12,
  lineHeight: 1,
  height: 40,                 // keeps alignment clean
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  cursor: 'pointer',
  boxShadow: '0 6px 14px rgba(0,0,0,0.06)',
};

const btnActiveStyle: React.CSSProperties = {
  ...btnStyle,
  background: BUREAU_GREEN_DARK,
  border: '1px solid rgba(0,0,0,0.10)',
};

const dividerStyle: React.CSSProperties = {
  width: 1,
  height: BTN_H,
  background: 'rgba(0,0,0,0.08)',
  margin: '0 4px',
};

const inputStyle: React.CSSProperties = {
  marginTop: 6,
  width: '100%',
  padding: '8px 10px',
  borderRadius: 12,
  border: '1px solid rgba(0,0,0,0.12)',
  fontSize: 12,
};

/**
 * -------------------------
 * Main Page
 * -------------------------
 */

export default function Home() {
  const hasLoadedRef = useRef(false);

  const edgeMode = useGraph((s) => s.edgeMode);
  const setEdgeMode = useGraph((s) => s.setEdgeMode);

  const BTN_H = 30;

  const btnStyle: React.CSSProperties = {
    height: BTN_H,
    padding: '0 16px',
    borderRadius: 14,
    border: '1px solid rgba(0,0,0,0.12)',
    background: 'rgba(255,255,255,0.85)',
    fontSize: 14,
    fontWeight: 600,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: 1,
    cursor: 'pointer',
  };

  const btnActiveStyle = {
    ...btnStyle,
    // keep padding/height identical, only change border/background/etc if needed
  };

  const {
    viewMode,
    setViewMode,
    nodes,
    edges,
    addPerson,
    addCapacity,
    addProject,
    addBudget,
    addTimeline,
    addTurnover,
    addLedger,
    onConnect,
    onNodesChange,
    onEdgesChange,
    selectNode,
    selectEdge,
    updateNodeTitle,
    updatePersonMeta,
    updateProjectStudio,
    updateProjectClient,
    updateBudgetPhases,
    updateTimelineDates,
    updateEdgeLabel,
    updateEdgeConnection,
    deleteEdge,
    hydrateFromPersisted,
    resetGraph,
  } = useGraph();

  // --- Timeline Scrubber (FY: Jan → Dec) ---
  const FY_START = useMemo(() => new Date(new Date().getFullYear(), 0, 1), []);
  const TOTAL_WEEKS = 52;

  function fmtShort(d: Date) {
    return d.toLocaleDateString(undefined, { month: 'short', day: '2-digit' });
  }

  const today = useMemo(() => new Date(), []);
  const initialWeek = useMemo(() => {
    const diffMs = today.getTime() - FY_START.getTime();
    const diffDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
    return Math.min(TOTAL_WEEKS, Math.floor(diffDays / 7));
  }, [FY_START, today]);

  const [scrubWeek, setScrubWeek] = useState<number>(0);
  const [mounted, setMounted] = useState(false);

  // --- Flow shell ref (used to scope wheel interception) ---
  const flowShellRef = useRef<HTMLDivElement | null>(null);

  /**
   * HARD BLOCK: Chrome back/forward on Mac trackpad swipe.
   *
   * Key change vs your current code:
   * - Do NOT require dx > dy (trackpad swipes often include dy).
   * - If there is *any* horizontal intent (deltaX != 0 OR shift+wheel), preventDefault.
   * - Keep ctrlKey (pinch zoom) untouched.
   */
  useEffect(() => {
    const handler = (e: WheelEvent) => {
      // pinch-zoom (trackpad) often reports ctrlKey → do not interfere
      if (e.ctrlKey) return;

      const shell = flowShellRef.current;
      if (!shell) return;

      const target = e.target as HTMLElement | null;
      if (!target) return;

      // Only intercept events that originate inside the flow shell
      if (!shell.contains(target)) return;

      const dx = Math.abs(e.deltaX);

      // shift+wheel is treated as horizontal scroll in many browsers
      const horizontalIntent = dx > 0 || e.shiftKey;

      if (horizontalIntent) {
        // THIS is what stops Chrome history navigation
        e.preventDefault();
      }
    };

    // Capture + passive:false is mandatory or preventDefault gets ignored.
    window.addEventListener('wheel', handler, { capture: true, passive: false });

    return () => {
      window.removeEventListener('wheel', handler as any, { capture: true } as any);
    };
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setScrubWeek(initialWeek);
  }, [initialWeek]);

  // Derived date from scrub position (uses your existing top-level addDays())
const scrubDate = useMemo(() => addDays(FY_START, scrubWeek * 7), [FY_START, scrubWeek]);

const selectedNodeId = useGraph((s) => s.selectedNodeId);
const selectedEdgeId = useGraph((s) => s.selectedEdgeId);

const selectedNode = useMemo(() => nodes.find((n) => n.id === selectedNodeId) ?? null, [nodes, selectedNodeId]);
const selectedEdge = useMemo(() => edges.find((e) => e.id === selectedEdgeId) ?? null, [edges, selectedEdgeId]);

/**
 * Persistence: prevent overwriting saved work on first paint
 */
const readyToPersist = useRef(false);

useEffect(() => {
  const persisted = readPersistedGraph();
  if (persisted) hydrateFromPersisted(persisted);
  else resetGraph();

  requestAnimationFrame(() => {
    readyToPersist.current = true;
  });
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);

// Background autosave
useEffect(() => {
  if (!readyToPersist.current) return;

  const payload: PersistedGraph = {
    version: 1,
    savedAtISO: new Date().toISOString(),
    viewMode,
    edgeMode,
    nodes,
    edges,
  };

  try {
    writePersistedGraph(payload);
  } catch {
    // ignore
  }
}, [nodes, edges, viewMode, edgeMode]);

  // Explicit Save button
const manualSave = useCallback(() => {
  const payload: PersistedGraph = {
    version: 1,
    savedAtISO: new Date().toISOString(),
    viewMode,
    edgeMode,
    nodes,
    edges,
  };

  try {
    writePersistedGraph(payload);
    alert('Saved ✅');
  } catch {
    alert('Save failed (storage error).');
  }
}, [nodes, edges, viewMode, edgeMode]);

  const exportJSON = useCallback(async () => {
  const payload: PersistedGraph = {
    version: 1,
    savedAtISO: new Date().toISOString(),
    viewMode,
    edgeMode,
    nodes,
    edges,
  };

  const text = JSON.stringify(payload, null, 2);
  
  // ...rest of your export code
}, [nodes, edges, viewMode, edgeMode]);

  const importJSON = useCallback(() => {
    const raw = prompt('Paste JSON export:');
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw) as PersistedGraph;
      if (!parsed || parsed.version !== 1) {
        alert('Invalid JSON/version.');
        return;
      }
      hydrateFromPersisted(parsed);
      alert('Imported ✅');
    } catch {
      alert('Invalid JSON.');
    }
  }, [hydrateFromPersisted]);

  /**
   * ✅ Drag-to-disconnect edges (stable + named uniquely to avoid collisions)
   */
  const edgeUpdateSuccessful = useRef(true);

  const handleEdgeUpdateStart = useCallback(() => {
    edgeUpdateSuccessful.current = false;
  }, []);

  const handleEdgeUpdate = useCallback(
    (oldEdge: any, newConnection: Connection) => {
      edgeUpdateSuccessful.current = true;
      updateEdgeConnection(oldEdge.id, newConnection);
    },
    [updateEdgeConnection]
  );

  const handleEdgeUpdateEnd = useCallback(
    (_: any, edge: any) => {
      // if update never succeeded, treat it as "pulled off" and delete it
      if (!edgeUpdateSuccessful.current) {
        deleteEdge(edge.id);
      }
      edgeUpdateSuccessful.current = true;
    },
    [deleteEdge]
  );

  const wiredNodes = useMemo(() => nodes.map((n) => ({ ...n, type: reactFlowTypeForNode(n.data.kind) })), [nodes, edges, scrubDate]);
const displayNodes = useMemo(() => {
  const FADED = 0.15;
  const SOFT = 0.45;
  const FULL = 1;
  const PAD_DAYS = 14;

  function addDays(d: Date, days: number) {
    const x = new Date(d);
    x.setDate(x.getDate() + days);
    return x;
  }

  function getProjectRange(projectId: string) {
    const timelineEdge = edges.find(
      (e) => e.source === projectId && e.sourceHandle === 'timeline'
    );
    if (!timelineEdge) return null;

    const tNode = nodes.find((n) => n.id === timelineEdge.target);
    if (!tNode || tNode.data?.kind !== 'timeline') return null;

    const t = tNode.data as any;

    // 👇 your timeline node stores these
    const startISO = t.startDate;
    const endISO = t.endDate;

    if (!startISO || !endISO) return null;

    return { start: new Date(startISO), end: new Date(endISO) };
  }

  function opacityForProject(projectId: string) {
    const r = getProjectRange(projectId);
    if (!r) return FULL;

    const padStart = addDays(r.start, -PAD_DAYS);
    const padEnd = addDays(r.end, PAD_DAYS);

    if (isBetween(scrubDate, r.start, r.end)) return FULL;
    if (isBetween(scrubDate, padStart, padEnd)) return SOFT;
    return FADED;
  }

  function ownerProjectId(nodeId: string) {
    const ownerEdge = edges.find(
      (e) =>
        e.target === nodeId &&
        (e.sourceHandle === 'budget' || e.sourceHandle === 'timeline')
    );
    return ownerEdge?.source ?? null;
  }

  // --- Dock / Clip visual state (purely visual, no graph logic changes) ---
  const dockMap = new Map<string, { top: boolean; bottom: boolean }>();

  function isDockable(kind: any) {
    return kind === 'budget' || kind === 'timeline';
  }

  function getDockFlags(id: string) {
    const cur = dockMap.get(id);
    if (cur) return cur;
    const next = { top: false, bottom: false };
    dockMap.set(id, next);
    return next;
  }

    // Detect “snapped” top/bottom relationships using your snap tolerances
  // Rule: ONE clip per junction -> clip lives on the UPPER node's bottom only.
  for (const a of wiredNodes) {
    const aKind = (a as any)?.data?.kind;
    if (!isDockable(aKind)) continue;

    for (const b of wiredNodes) {
      if (a.id === b.id) continue;
      const bKind = (b as any)?.data?.kind;
      if (!isDockable(bKind)) continue;

      const aPos = a.position;
      const bPos = b.position;

      // Default sizes if ReactFlow hasn't measured yet
      const aH = (a as any).height ?? 140;
      const bH = (b as any).height ?? 140;

      // We only care about top/bottom docking (no left/right)
      const yAboveB = bPos.y - DOCK_Y_GAP - aH; // a above b
      const yBelowB = bPos.y + bH + DOCK_Y_GAP; // a below b

      const ySnap =
        Math.abs(aPos.y - yAboveB) <= DOCK_SNAP_DIST ||
        Math.abs(aPos.y - yBelowB) <= DOCK_SNAP_DIST;

      // Only allow x alignment when y is also snapping (prevents ghost x snaps)
      let xSnap = false;
      if (ySnap) {
        xSnap = Math.abs(aPos.x - bPos.x) <= DOCK_X_SNAP_DIST;
      }

      if (!ySnap || !xSnap) continue;

      // a snapped ABOVE b -> clip on a.bottom only
      if (Math.abs(aPos.y - yAboveB) <= DOCK_SNAP_DIST) {
        getDockFlags(a.id).bottom = true;
      }

      // a snapped BELOW b -> clip on b.bottom only (since b is the upper node)
      if (Math.abs(aPos.y - yBelowB) <= DOCK_SNAP_DIST) {
        getDockFlags(b.id).bottom = true;
      }
    }
  }

  return wiredNodes.map((n) => {
    const kind = n.data?.kind;

    // Inject dock flags (visual-only). Non-dockables get null.
    const dock =
      kind === 'budget' || kind === 'timeline'
        ? dockMap.get(n.id) ?? { top: false, bottom: false }
        : null;

    // always solid
    if (kind === 'person' || kind === 'capacity') {
      return dock ? { ...n, data: { ...(n.data as any), dock } } : n;
    }
    if (String(kind).includes('turnover')) {
      return dock ? { ...n, data: { ...(n.data as any), dock } } : n;
    }

    if (kind === 'project') {
      const op = opacityForProject(n.id);
      const next = { ...n, style: { ...(n.style || {}), opacity: op } };
      return dock ? { ...next, data: { ...(next.data as any), dock } } : next;
    }

    if (kind === 'budget' || kind === 'timeline') {
      const pid = ownerProjectId(n.id);
      const op = pid ? opacityForProject(pid) : FULL;

      return {
        ...n,
        data: { ...(n.data as any), dock },
        style: { ...(n.style || {}), opacity: op },
      };
    }

    return dock ? { ...n, data: { ...(n.data as any), dock } } : n;
  });
}, [wiredNodes, nodes, edges, scrubDate]);

const isValidConnection = useCallback(
  (c: Connection) => isValidConnectionStrict(nodes, c),
  [nodes]
);

/**
 * Timeline items come from timeline nodes
 */
const masterTimelineItems = useMemo(() => {
  return wiredNodes
    .filter((n) => n.data.kind === 'timeline')
    .map((n) => {
      const t = n.data as TimelineData;
      return {
        id: n.id,
        title: t.title,
        startDate: t.startDate,
        endDate: t.endDate,
      };
    });
}, [wiredNodes]);

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      {/* Toolbar */}
<div
  style={{
    position: 'absolute',
    zIndex: 10,
    top: 12,
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    background: 'rgba(255,255,255,0.92)',
    padding: 10,
    borderRadius: 18,
    border: '1px solid rgba(0,0,0,0.08)',
    boxShadow: '0 14px 30px rgba(0,0,0,0.08)',
    flexWrap: 'wrap',
    justifyContent: 'center',
    maxWidth: 1040,
    width: 'calc(100vw - 24px)',
    backdropFilter: 'blur(6px)',
  }}
>
  {/* View */}
  <button
    onClick={() => setViewMode('workflow')}
    style={{
      ...btnStyle,
      background: viewMode === 'workflow' ? '#005a27' : '#007231',
      color: 'white',
    }}
  >
    Workflow
  </button>

  <button
    onClick={() => setViewMode('timeline')}
    style={{
      ...btnStyle,
      background: viewMode === 'timeline' ? '#005a27' : '#007231',
      color: 'white',
    }}
  >
    Timeline
  </button>

  <div style={{ width: 1, height: 40, background: 'rgba(0,0,0,0.08)', margin: '0 4px' }} />

  {/* Connection type */}
  <button
    onClick={() => setEdgeMode('radius')}
    style={{
      ...btnStyle,
      background: edgeMode === 'radius' ? '#005a27' : '#007231',
      color: 'white',
    }}
  >
    Radius
  </button>

  <button
    onClick={() => setEdgeMode('bezier')}
    style={{
      ...btnStyle,
      background: edgeMode === 'bezier' ? '#005a27' : '#007231',
      color: 'white',
    }}
  >
    Bezier
  </button>

  <div style={{ width: 1, height: 40, background: 'rgba(0,0,0,0.08)', margin: '0 4px' }} />

  {/* Add nodes */}
  <button onClick={addPerson} style={{ ...btnStyle, background: '#007231', color: 'white' }}>
    + Resource
  </button>

  <button onClick={addProject} style={{ ...btnStyle, background: '#007231', color: 'white' }}>
    + Project
  </button>

  <button onClick={addBudget} style={{ ...btnStyle, background: '#007231', color: 'white' }}>
    + Budget
  </button>

  <button onClick={addTimeline} style={{ ...btnStyle, background: '#007231', color: 'white' }}>
    + Timeline
  </button>

  <div style={{ width: 1, height: 40, background: 'rgba(0,0,0,0.08)', margin: '0 4px' }} />

  <button onClick={addLedger} style={{ ...btnStyle, background: '#007231', color: 'white' }}>
    + Ledger
  </button>

  <div style={{ width: 1, height: 40, background: 'rgba(0,0,0,0.08)', margin: '0 4px' }} />

  {/* Save / I/O */}
  <button onClick={manualSave} style={{ ...btnStyle, background: '#007231', color: 'white' }}>
    Save
  </button>

  <button onClick={exportJSON} style={{ ...btnStyle, background: '#007231', color: 'white' }}>
    Export
  </button>

  <button onClick={importJSON} style={{ ...btnStyle, background: '#007231', color: 'white' }}>
    Import
  </button>

  <button
    onClick={() => {
      if (confirm('Reset graph? This will wipe the saved canvas.')) {
        localStorage.removeItem(APP_STORAGE_KEY);
        resetGraph();
      }
    }}
    style={{ ...btnStyle, background: '#007231', color: 'white', opacity: 0.9 }}
  >
    Reset
  </button>
</div>
      {/* Inspector */}
      <div
        style={{
          position: 'absolute',
          zIndex: 10,
          right: 12,
          top: '50%',
          transform: 'translateY(-50%)',
          width: 340,
          maxHeight: 'calc(100vh - 24px)',
          overflow: 'auto',
          background: 'rgba(255,255,255,0.92)',
          padding: 12,
          borderRadius: 18,
          border: '1px solid rgba(0,0,0,0.08)',
          boxShadow: '0 14px 30px rgba(0,0,0,0.08)',
          backdropFilter: 'blur(6px)',
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 13 }}>Inspector</div>
        <div style={{ opacity: 0.6, fontSize: 12, marginTop: 2 }}>Click a node or connection to edit it.</div>

        <div style={{ height: 10 }} />

        {selectedEdge && (
          <div style={{ marginTop: 6 }}>
            <div style={{ fontWeight: 650, fontSize: 12 }}>Connection</div>
            <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>
              {selectedEdge.source} → {selectedEdge.target}
            </div>

            <label style={{ display: 'block', marginTop: 10, fontSize: 12, opacity: 0.8 }}>
              Label
              <input
                style={inputStyle}
                value={String(selectedEdge.label ?? '')}
                onChange={(e) => updateEdgeLabel(selectedEdge.id, e.target.value)}
              />
            </label>

            <button
              style={{
                ...btnStyle,
                marginTop: 10,
                borderColor: 'rgba(220,38,38,0.25)',
                color: 'rgba(220,38,38,0.9)',
              }}
              onClick={() => deleteEdge(selectedEdge.id)}
            >
              Delete connection
            </button>
          </div>
        )}

        {selectedNode && (
          <div style={{ marginTop: selectedEdge ? 18 : 6 }}>
            <div style={{ fontWeight: 650, fontSize: 12 }}>{selectedNode.data.kind.toUpperCase()} Node</div>

            <label style={{ display: 'block', marginTop: 10, fontSize: 12, opacity: 0.8 }}>
              {selectedNode.data.kind === 'project' ? 'Project name' : 'Title'}
              <input
                style={inputStyle}
                value={selectedNode.data.title}
                onChange={(e) => updateNodeTitle(selectedNode.id, e.target.value)}
              />
            </label>

            {selectedNode.data.kind === 'person' && (
              <>
                <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ fontSize: 12, opacity: 0.75 }}>Dept</div>
                  <span
                    style={{
                      width: 12,
                      height: 12, 
                      borderRadius: 999,
                      background: selectedNode.data.color,
                      border: '1px solid rgba(0,0,0,0.08)',
                    }}
                  />
                  <div style={{ marginLeft: 'auto', fontSize: 12, opacity: 0.7 }}>{deptLabel(selectedNode.data.dept)}</div>
                </div>

                <select
                  style={{ ...inputStyle, marginTop: 6 }}
                  value={selectedNode.data.dept}
                  onChange={(e) => updatePersonMeta(selectedNode.id, { dept: e.target.value as Dept })}
                >
                  <option value="unassigned">Unassigned</option>
                  <option value="ops">Operations</option>
                  <option value="design">Design</option>
                  <option value="dev">Engineering</option>
                </select>

                <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, fontSize: 12 }}>
                  <input
                    type="checkbox"
                    checked={selectedNode.data.isExternal}
                    onChange={(e) => updatePersonMeta(selectedNode.id, { isExternal: e.target.checked })}
                  />
                  External to org
                </label>

                <label
                  style={{
                    display: 'block',
                    marginTop: 10,
                    fontSize: 12,
                    opacity: selectedNode.data.isExternal ? 0.9 : 0.45,
                  }}
                >
                  External fee (EUR)
                  <input
                    style={inputStyle}
                    type="number"
                    disabled={!selectedNode.data.isExternal}
                    value={selectedNode.data.externalFeeEUR}
                    onChange={(e) => updatePersonMeta(selectedNode.id, { externalFeeEUR: Number(e.target.value) })}
                  />
                </label>

                <div style={{ height: 10 }} />

                <div style={{ marginTop: 6, fontWeight: 650, fontSize: 12, opacity: 0.85 }}>
                  Bill external fee to
                </div>

                <label
                  style={{
                    display: 'block',
                    marginTop: 10,
                    fontSize: 12,
                    opacity: selectedNode.data.isExternal ? 0.9 : 0.45,
                  }}
                >
                  Budget
                  <select
                    style={inputStyle}
                    disabled={!selectedNode.data.isExternal}
                    value={String((selectedNode.data as PersonData).billToBudgetId ?? '')}
                    onChange={(e) =>
                      updatePersonMeta(selectedNode.id, {
                        billToBudgetId: e.target.value ? e.target.value : null,
                      })
                    }
                  >
                    <option value="">Unassigned</option>
                    {nodes
                      .filter((n) => n.data.kind === 'budget')
                      .map((b) => (
                        <option key={b.id} value={b.id}>
                          {(b.data as BudgetData).title}
                        </option>
                      ))}
                  </select>
                </label>

                <label
                  style={{
                    display: 'block',
                    marginTop: 10,
                    fontSize: 12,
                    opacity: selectedNode.data.isExternal ? 0.9 : 0.45,
                  }}
                >
                  Phase
                  <select
                    style={inputStyle}
                    disabled={!selectedNode.data.isExternal}
                    value={String((selectedNode.data as PersonData).billToPhase ?? 'design')}
                    onChange={(e) =>
                      updatePersonMeta(selectedNode.id, {
                        billToPhase: e.target.value as any,
                      })
                    }
                  >
                    <option value="design">Design</option>
                    <option value="dev">Engineering</option>
                    <option value="ops">Ops</option>
                  </select>
                </label>
              </>
            )}
            {selectedNode.data.kind === 'project' && (
  <>
    <div style={{ marginTop: 12, fontSize: 12, fontWeight: 700, opacity: 0.8 }}>
      PROJECT Node
    </div>

    {/* Studio */}
    <div style={{ marginTop: 10, fontSize: 12, fontWeight: 700, opacity: 0.7 }}>Studio</div>
    <select
      value={(selectedNode.data as ProjectData).studio ?? 'Antinomy Studio'}
      onChange={(e) => updateProjectStudio(selectedNode.id, e.target.value as Studio)}
      style={{
        marginTop: 6,
        width: '100%',
        padding: '10px 12px',
        borderRadius: 12,
        border: '1px solid rgba(0,0,0,0.10)',
        background: 'white',
        fontSize: 13,
      }}
    >
      <option value="Antinomy Studio">Antinomy Studio</option>
      <option value="27b">27b</option>
    </select>

    {/* Client */}
    <div style={{ marginTop: 10, fontSize: 12, fontWeight: 700, opacity: 0.7 }}>Client</div>
    <input
      value={(selectedNode.data as ProjectData).client ?? ''}
      onChange={(e) => updateProjectClient(selectedNode.id, e.target.value)}
      placeholder="e.g. Vast Space"
      style={{
        marginTop: 6,
        width: '100%',
        padding: '10px 12px',
        borderRadius: 12,
        border: '1px solid rgba(0,0,0,0.10)',
        background: 'white',
        fontSize: 13,
      }}
    />
  </>
)}

            {selectedNode.data.kind === 'budget' && (
              <>
                <div style={{ marginTop: 12, fontWeight: 650, fontSize: 12, opacity: 0.85 }}>Phase amounts</div>

                <label style={{ display: 'block', marginTop: 10, fontSize: 12, opacity: 0.8 }}>
                  Design
                  <input
                    style={inputStyle}
                    type="number"
                    value={selectedNode.data.designAmount}
                    onChange={(e) => updateBudgetPhases(selectedNode.id, { designAmount: Number(e.target.value) })}
                  />
                </label>

                <label style={{ display: 'block', marginTop: 10, fontSize: 12, opacity: 0.8 }}>
                  Technology (Engineering)
                  <input
                    style={inputStyle}
                    type="number"
                    value={selectedNode.data.devAmount}
                    onChange={(e) => updateBudgetPhases(selectedNode.id, { devAmount: Number(e.target.value) })}
                  />
                </label>

                <label style={{ display: 'block', marginTop: 10, fontSize: 12, opacity: 0.8 }}>
                  Ops
                  <input
                    style={inputStyle}
                    type="number"
                    value={selectedNode.data.opsAmount}
                    onChange={(e) => updateBudgetPhases(selectedNode.id, { opsAmount: Number(e.target.value) })}
                  />
                </label>

                <div
                  style={{
                    marginTop: 10,
                    padding: 10,
                    borderRadius: 12,
                    background: 'rgba(0,0,0,0.03)',
                    border: '1px solid rgba(0,0,0,0.08)',
                  }}
                >
                  <div style={{ fontSize: 12, opacity: 0.7 }}>Total</div>
                  <div style={{ fontWeight: 750, fontSize: 14 }}>{formatEUR(budgetTotal(selectedNode.data))}</div>
                </div>
              </>
            )}

            {selectedNode.data.kind === 'timeline' && (
              <>
                <div style={{ marginTop: 12, fontWeight: 650, fontSize: 12, opacity: 0.85 }}>Date range</div>

                <label style={{ display: 'block', marginTop: 10, fontSize: 12, opacity: 0.8 }}>
                  Start
                  <input
                    style={inputStyle}
                    type="date"
                    value={selectedNode.data.startDate}
                    onChange={(e) => updateTimelineDates(selectedNode.id, { startDate: e.target.value })}
                  />
                </label>

                <label style={{ display: 'block', marginTop: 10, fontSize: 12, opacity: 0.8 }}>
                  End
                  <input
                    style={inputStyle}
                    type="date"
                    value={selectedNode.data.endDate}
                    onChange={(e) => updateTimelineDates(selectedNode.id, { endDate: e.target.value })}
                  />
                </label>
              </>
            )}
          </div>
        )}

        {!selectedNode && !selectedEdge && (
          <div
            style={{
              marginTop: 14,
              padding: 12,
              borderRadius: 14,
              background: 'rgba(0,0,0,0.03)',
              border: '1px solid rgba(0,0,0,0.08)',
            }}
          >
            <div style={{ fontSize: 12, opacity: 0.65 }}>Nothing selected. Click a node to edit metadata.</div>
          </div>
        )}
      </div>

      {/* Views */}
      {viewMode === 'timeline' ? (
        <MasterTimeline items={masterTimelineItems} />
      ) : (
  <div style={{ position: 'relative', height: '100%', width: '100%' }}>
    {/* Canvas stamp */}
    <div
  style={{
    position: 'absolute',
    top: 32,
    left: 32,
    zIndex: 50,
    pointerEvents: 'none',
    userSelect: 'none',
  }}
>
  <div style={{ fontSize: 26, fontWeight: 800, opacity: 0.75, letterSpacing: -0.9 }}>
    The Bureau •
  </div>
  <div style={{ fontSize: 16, opacity: 0.4 }}>Prototype Business Reality</div>
</div>
{/* Timeline Scrubber (Workflow view) */}
{/* Time Scrubber */}
<div
  style={{
    position: 'absolute',
    left: '50%',
    bottom: 18,
    transform: 'translateX(-50%)',
    zIndex: 30,
    width: '92vw',
    maxWidth: 980,
    background: 'rgba(255,255,255,0.92)',
    border: '1px solid rgba(0,0,0,0.08)',
    borderRadius: 18,
    boxShadow: '0 14px 30px rgba(0,0,0,0.08)',
    backdropFilter: 'blur(10px)',
    padding: '12px 14px',
    display: 'flex',
    alignItems: 'center',
    gap: 14,
  }}
>
  {/* Left meta */}
  <div style={{ minWidth: 120 }}>
    <div style={{ fontSize: 12, fontWeight: 600 }}>FY · Week {scrubWeek + 1}</div>
    <div style={{ fontSize: 11, opacity: 0.65 }}>
     {mounted ? fmtShort(scrubDate) : ''}
    </div>
  </div>

  {/* Ruler + slider */}
  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
    {/* Labels row */}
    <div style={{ position: 'relative', width: '100%', height: 14, fontSize: 10, opacity: 0.7 }}>
      {/* Quarters */}
      <div style={{ position: 'absolute', top: 0, left: '0%' }}>Q1</div>
      <div style={{ position: 'absolute', top: 0, left: '25%', transform: 'translateX(-50%)' }}>Q2</div>
      <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)' }}>Q3</div>
      <div style={{ position: 'absolute', top: 0, left: '75%', transform: 'translateX(-50%)' }}>Q4</div>

      {/* Months anchors */}
      <div style={{ position: 'absolute', top: 0, left: '0%', transform: 'translateY(12px)', opacity: 0.55 }}>Jan</div>
      <div style={{ position: 'absolute', top: 0, left: '25%', transform: 'translate(-50%, 12px)', opacity: 0.55 }}>Apr</div>
      <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translate(-50%, 12px)', opacity: 0.55 }}>Jul</div>
      <div style={{ position: 'absolute', top: 0, left: '75%', transform: 'translate(-50%, 12px)', opacity: 0.55 }}>Oct</div>
      <div style={{ position: 'absolute', top: 0, left: '100%', transform: 'translate(-100%, 12px)', opacity: 0.55 }}>Dec</div>
    </div>

    {/* Slider */}
    <input
      type="range"
      min={0}
      max={51}
      value={scrubWeek}
      onChange={(e) => setScrubWeek(parseInt(e.target.value, 10))}
      style={{ width: '100%' }}
    />
  </div>

  {/* Today button */}
  <button
    onClick={() => {
  const now = new Date();
  const diffMs = now.getTime() - FY_START.getTime();
  const diffDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  const w = Math.min(TOTAL_WEEKS - 1, Math.floor(diffDays / 7));
  setScrubWeek(w);
}}
    style={{
      padding: '8px 10px',
      borderRadius: 12,
      border: '1px solid rgba(0,0,0,0.08)',
      background: 'rgba(255,255,255,0.9)',
      fontSize: 12,
      cursor: 'pointer',
      whiteSpace: 'nowrap',
    }}
  >
    Today
  </button>
</div>

<div
  id="flow-shell"
  ref={flowShellRef}
  style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}
  
>
  <ReactFlow
  nodes={displayNodes}
  edges={edges}
  nodeTypes={nodeTypes}
  onConnect={onConnect}
  onNodesChange={onNodesChange}
  onEdgesChange={onEdgesChange}
  onNodeClick={(_, node) => selectNode(node.id)}
  onEdgeClick={(_, edge) => selectEdge(edge.id)}
  onEdgeUpdateStart={handleEdgeUpdateStart}
  onEdgeUpdate={handleEdgeUpdate}
  onEdgeUpdateEnd={handleEdgeUpdateEnd}
  edgeUpdaterRadius={18}
  panOnDrag={true}        // ✅ drag empty canvas to pan
  panOnScroll={false}     // ✅ do not pan on wheel/trackpad scroll
  zoomOnScroll={false}    // ✅ do not zoom on scroll
  zoomOnPinch={true}      // ✅ pinch zoom stays
  preventScrolling={true} // ✅ stop page scroll behind canvas
  isValidConnection={() => true}
  fitView
  minZoom={0.05}
  maxZoom={2.5}
  defaultEdgeOptions={{
    type: edgeMode === 'radius' ? 'smoothstep' : 'default',
    markerEnd: { type: MarkerType.ArrowClosed },
  }}
  connectionLineType={
    edgeMode === 'radius' ? ConnectionLineType.SmoothStep : ConnectionLineType.Bezier
  }
>
  <MiniMap />
  <Controls />
  <Background />
</ReactFlow>
</div>
</div>
)}
</div>
);
}