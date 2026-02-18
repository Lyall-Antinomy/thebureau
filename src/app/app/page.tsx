'use client';

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, {
  ReactFlowProvider,
  useReactFlow,
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
  type ReactFlowInstance,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { nanoid } from 'nanoid';
import { create } from 'zustand';
import MasterTimeline from '../MasterTimeline';
import * as Select from '@radix-ui/react-select';
/**
 * -------------------------
 * Types
 * -------------------------
 */

type TurnoverType = 'gross' | 'design' | 'dev' | 'ops';
type Studio = '27b' | 'Antinomy Studio';

type NodeKind =
  | 'person'
  | 'alias'
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

type ViewMode = 'manager' | 'workflow' | 'reports';
type Dept = 'unassigned' | 'ops' | 'design' | 'dev';



type MasterResource = {
  id: string;
  title: string;

  // org/meta
  entity: Studio;
  dept: Dept;
  color: string;

  // comp model
  compModel: 'Full time' | 'External';
  contractStartISO: string; // YYYY-MM-DD
  contractEndISO: string;   // YYYY-MM-DD
  salaryAnnual: number;
  billRatePerHour: number;
};

type AliasFeeMode = 'fixed' | 'dayRate';

type AliasData = {
  title: string; // first name only for the node label
  kind: 'alias';
  masterResourceId: string;
  personNameSnapshot: string; // full name snapshot for debits/ledger lines
  dept: Dept;
  color: string;
  compModel: 'Full time' | 'External';

  // External-only finance (stored per alias)
  feeMode: AliasFeeMode;
  feeValueEUR: number;
  billToBudgetId?: string | null;

  // Full time-only linkage (stored per alias)
  linkToTimelineId?: string | null;
};

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
  treeCollapsed?: boolean; // canvas-only filing toggle (hide/show connected nodes)
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
  | AliasData
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
  masterResources?: MasterResource[];
};

type EdgeMode = 'radius' | 'bezier';

type GraphState = {
  // View
  viewMode: ViewMode;
  setViewMode: (m: ViewMode) => void;
  inspectorCollapsed: boolean;
  setInspectorCollapsed: (v: boolean) => void;
  toggleInspectorCollapsed: () => void;

  // Ledger HUD (screen-space)
  ledgerCollapsed: boolean;
  setLedgerCollapsed: (v: boolean) => void;
  toggleLedgerCollapsed: () => void;

  
  edgeCornerRadius: number;
  setEdgeCornerRadius: (r: number) => void;

  // Edge routing UI mode
  edgeMode: EdgeMode;
  setEdgeMode: (m: EdgeMode) => void;

  // Graph data
  nodes: RFNode<GraphNodeData>[];
  edges: Edge<GraphEdgeData>[];

  // Manager data (Master Resources live outside the canvas graph)
  masterResources: MasterResource[];

  // Selection
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  selectedMasterResourceId: string | null;
  selectNode: (id: string | null) => void;
  selectEdge: (id: string | null) => void;
  selectMasterResource: (id: string | null) => void;

  // Add nodes
  addPerson: () => void;
  addCapacity: () => void;
  addProject: () => void;
  addBudget: () => void;
  addTimeline: () => void;
  addTurnover: (t: TurnoverType) => void;

  // Aliases (spawned from Master Resources)
  spawnAliasFromMaster: (masterResourceId: string, position: { x: number; y: number }) => string;

  // Master Resources (Manager)
  addMasterResource: () => void;
  updateMasterResourceTitle: (id: string, title: string) => void;
  updateMasterResourceMeta: (id: string, patch: Partial<Omit<MasterResource, 'id' | 'title'>>) => void;

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
  updateAliasMeta: (id: string, patch: Partial<AliasData>) => void;
  updateProjectStudio: (id: string, studio: Studio) => void;
  updateProjectClient: (id: string, client: string) => void;
  toggleProjectTreeCollapsed: (projectId: string) => void;

  updateEdgeLabel: (id: string, label: string) => void;
  updateEdgeConnection: (edgeId: string, newConn: Connection) => void;
  deleteEdge: (edgeId: string) => void;
  deleteMasterResource: (id: string) => void;

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


function firstNameOf(name: string) {
  const t = String(name ?? '').trim();
  if (!t) return '';
  // Split on whitespace; take first token (handles "Oscar Pico" → "Oscar")
  return t.split(/\s+/)[0] ?? t;
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

function isoToDMY(iso: string) {
  // expects YYYY-MM-DD; fall back to input if invalid
  const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(String(iso));
  if (!m) return String(iso);
  const [, y, mo, d] = m;
  return `${d}.${mo}.${y}`;
}

function weeksUntil(isoEnd: string) {
  if (!isoEnd) return 0;
  const end = new Date(isoEnd);
  const endMs = end.getTime();
  if (!Number.isFinite(endMs)) return 0;
  const now = new Date();
  const diffMs = endMs - now.getTime();
  const w = Math.ceil(diffMs / (1000 * 60 * 60 * 24 * 7));
  return Math.max(0, w);
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
  if (kind === 'alias') return 'aliasNode';
  if (kind === 'capacity') return 'capacityNode';
  if (kind === 'project') return 'projectNode';
  if (kind === 'budget') return 'budgetNode';
  if (kind === 'timeline') return 'timelineNode';
  if (kind === 'turnover') return 'turnoverNode';
  if (kind === 'ledger') return 'ledgerNode'; // ✅ add this
  return 'projectNode';
}


function normalizeEdgeForMode(
  e: Edge<GraphEdgeData>,
  edgeMode: EdgeMode,
  edgeCornerRadius: number
): Edge<GraphEdgeData> {
  const isRadius = edgeMode === 'radius';
  const corner = Number.isFinite(edgeCornerRadius) ? edgeCornerRadius : 50;

  // Normalize marker sizing if present
  const ms = (m: any) => (m ? { ...m, width: 12, height: 12 } : m);

  const next: any = {
    ...e,
    type: isRadius ? 'smoothstep' : 'default',
    style: { ...(e.style ?? {}), strokeWidth: 2 },
    markerStart: ms((e as any).markerStart),
    markerEnd: ms((e as any).markerEnd),
  };

  if (isRadius) {
    next.pathOptions = { ...((e as any).pathOptions ?? {}), borderRadius: corner };
  } else {
    // Keep any existing pathOptions harmlessly; ReactFlow ignores them on 'default'
    next.pathOptions = undefined;
  }

  return next;
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
    case 'alias':
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
  if (source.data.kind === 'alias') return (source.data as AliasData).color;
  return 'rgba(0,0,0,0.35)';
}

function isValidConnectionStrict(nodes: RFNode<GraphNodeData>[], c: Connection) {
  if (!c.source || !c.target) return false;

  const sourceKind = getNodeKindById(nodes, c.source);
  const targetKind = getNodeKindById(nodes, c.target);

  // Capacity → Person (capacity-only)
if (sourceKind === 'capacity' && (targetKind === 'person' || targetKind === 'alias')) {
      return c.sourceHandle === 'capacity-out' && c.targetHandle === 'capacity-in';
  }

  // Person → Project (project-only)
  if (sourceKind === 'person' && targetKind === 'project') {
    const okTeamPort = c.targetHandle === 'ops' || c.targetHandle === 'design' || c.targetHandle === 'dev';
    return c.sourceHandle === 'project-out' && okTeamPort;
  }

  // Alias → Project (assignment)
  if (sourceKind === 'alias' && targetKind === 'project') {
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
    const projectIsTarget = e.target === projectId && (sKind === 'person' || sKind === 'alias') && isDept((e as any).targetHandle);
    const projectIsSource = e.source === projectId && (tKind === 'person' || tKind === 'alias') && isDept((e as any).sourceHandle);

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
      .map((pid) => {
        const nd = byId.get(pid);
        const k = nd?.data?.kind;
        const d: any = nd?.data ?? {};
        const title =
          k === 'alias'
            ? String(d.personNameSnapshot ?? d.fullName ?? d.title ?? d.firstName ?? '').trim()
            : String(d.title ?? '').trim();
        return { pid, title };
      })
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

  // --- Alias → Project assignment edges (external debits source) ---
  // MVP: only alias.fixed fees are wired into budgets (day rate remains UI-only for now).
  const aliasToProjectEdges = edges.filter((e) => {
    if (e.target !== projectId) return false;
    const sk = getNodeKindById(nodes, e.source);
    const tk = getNodeKindById(nodes, e.target);
    const isAssignment = (e.data as any)?.edgeType === 'assignment';
    return sk === 'alias' && tk === 'project' && isAssignment;
  });

  for (const e of aliasToProjectEdges) {
    const aliasNode = nodes.find((n) => n.id === e.source);
    if (!aliasNode || aliasNode.data.kind !== 'alias') continue;

    const a = aliasNode.data as AliasData;
    if (a.compModel !== 'External') continue;
    if (a.feeMode !== 'fixed') continue;

    const fee = safeNum(a.feeValueEUR);
    if (fee <= 0) continue;

    // ✅ Budget scoping
    const billToBudgetId = (a as any).billToBudgetId ?? null;
    if (activeBudgetId) {
      if (billToBudgetId) {
        if (billToBudgetId !== activeBudgetId) continue;
      } else {
        if (!(projectBudgetIds.length === 1 && projectBudgetIds[0] === activeBudgetId)) continue;
      }
    }

    const edgePhase = (e.targetHandle as any) ?? 'design';
    const phase: DebitPhase =
      edgePhase === 'dev' || edgePhase === 'ops' || edgePhase === 'design' ? edgePhase : 'design';

    lines.push({
      personName: a.personNameSnapshot || a.title,
      phase,
      amount: fee,
      color: a.color ?? '#999999',
    });
  }

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

const UI_STORAGE_KEY = 'studio-ops-ui:v1';

type UiPrefs = {
  inspectorCollapsed: boolean;
};

function readUiPrefs(): UiPrefs {
  try {
    const raw = localStorage.getItem(UI_STORAGE_KEY);
    if (!raw) return { inspectorCollapsed: false };
    const parsed = JSON.parse(raw);
    return { inspectorCollapsed: !!parsed.inspectorCollapsed };
  } catch {
    return { inspectorCollapsed: false };
  }
}

function writeUiPrefs(p: UiPrefs) {
  localStorage.setItem(UI_STORAGE_KEY, JSON.stringify(p));
}

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
    masterResources: [],
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

function normalizeEdge(e: any) {
  const style = { ...(e.style ?? {}), strokeWidth: 2 };

  const markerEnd =
    e.markerEnd && typeof e.markerEnd === "object"
      ? { ...e.markerEnd, width: 12, height: 12 }
      : e.markerEnd ?? { type: "arrowclosed", width: 12, height: 12 };

  // keep existing pathOptions if present
  const pathOptions = e.pathOptions ? { ...e.pathOptions } : undefined;

  return { ...e, style, markerEnd, pathOptions };
}

function normalizeEdges(edges: any[]) {
  return edges.map(normalizeEdge);
}

const useGraph = create<GraphState>((set, get) => {
  
  const ui =
    typeof window !== 'undefined'
      ? readUiPrefs()
      : { inspectorCollapsed: false, ledgerCollapsed: false };

  const def = getDefaultGraph();

  const UI_STORAGE_KEY = 'studio-ops-ui:v1';

  type UiPrefs = { inspectorCollapsed: boolean; ledgerCollapsed: boolean };

function readUiPrefs(): UiPrefs {
  try {
    const raw = localStorage.getItem(UI_STORAGE_KEY);
    if (!raw) return { inspectorCollapsed: false, ledgerCollapsed: false };
    const parsed = JSON.parse(raw);
    return { inspectorCollapsed: !!parsed.inspectorCollapsed, ledgerCollapsed: !!parsed.ledgerCollapsed };
  } catch {
    return { inspectorCollapsed: false, ledgerCollapsed: false };
  }
}

function writeUiPrefs(p: UiPrefs) {
  localStorage.setItem(UI_STORAGE_KEY, JSON.stringify(p));
}

  return {
    viewMode: def.viewMode,
    setViewMode: (m: ViewMode) => set(() => ({ viewMode: m })),
    
// --- UI prefs (Inspector) ---
inspectorCollapsed: ui.inspectorCollapsed,

setInspectorCollapsed: (v: boolean) => {
  set(() => ({ inspectorCollapsed: v }));
  writeUiPrefs({ inspectorCollapsed: v, ledgerCollapsed: get().ledgerCollapsed });
},

toggleInspectorCollapsed: () => {
  const next = !get().inspectorCollapsed;
  set(() => ({ inspectorCollapsed: next }));
  writeUiPrefs({ inspectorCollapsed: next, ledgerCollapsed: get().ledgerCollapsed });
},

    // --- UI prefs (Ledger HUD) ---
    ledgerCollapsed: ui.ledgerCollapsed,

    setLedgerCollapsed: (v: boolean) => {
      set(() => ({ ledgerCollapsed: v }));
      writeUiPrefs({ inspectorCollapsed: get().inspectorCollapsed, ledgerCollapsed: v });
    },

    toggleLedgerCollapsed: () => {
      const next = !get().ledgerCollapsed;
      set(() => ({ ledgerCollapsed: next }));
      writeUiPrefs({ inspectorCollapsed: get().inspectorCollapsed, ledgerCollapsed: next });
    },

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

    masterResources: (def as any).masterResources ?? [],

    selectedNodeId: null,
    selectedEdgeId: null,
    selectedMasterResourceId: null,

    hydrateFromPersisted: (p: PersistedGraph) => {
      const hydratedNodes = (p.nodes ?? []).map((n) => ({
        ...n,
        type: reactFlowTypeForNode((n.data as any).kind),
      }));

      set(() => ({
        viewMode: (p.viewMode === 'reports' ? 'reports' : (p.viewMode ?? 'workflow')) as ViewMode,
        edgeMode: p.edgeMode ?? 'radius',
        nodes: hydratedNodes,
        edges: p.edges ?? [],
        masterResources: p.masterResources ?? [],
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
        masterResources: (fresh as any).masterResources ?? [],
        selectedNodeId: null,
        selectedEdgeId: null,
        selectedMasterResourceId: null,
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

    spawnAliasFromMaster: (masterResourceId, position) => {
      const master = get().masterResources.find((r) => r.id === masterResourceId);
      const firstName = (master?.title ?? 'Alias').trim().split(/\s+/)[0] || 'Alias';
      const personNameSnapshot = (master?.title ?? firstName).trim() || firstName;
      const dept = (master?.dept ?? 'unassigned') as Dept;
      const color = master?.color ?? DEPT_COLOURS[dept] ?? DEPT_COLOURS.unassigned;
      const compModel = (master?.compModel ?? 'Full time') as 'Full time' | 'External';

      const id = `alias-${nanoid(7)}`;

      set((s) => ({
        nodes: [
          ...s.nodes,
          {
            id,
            type: 'aliasNode',
            position,
            data: {
              kind: 'alias',
              title: firstName,
              masterResourceId,
              personNameSnapshot,
              dept,
              color,
              compModel,
              feeMode: compModel === 'External' ? 'fixed' : 'dayRate',
              feeValueEUR: 0,
              billToBudgetId: null,
              linkToTimelineId: null,
            },
          },
        ],
      }));

      return id;
    },

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


    // Master Resources (Manager)
    addMasterResource: () => {
      const id = `resource-${nanoid(6)}`;
      set((s) => ({
        masterResources: [
          ...s.masterResources,
          {
            id,
            title: 'New Resource',
            entity: '27b',
            dept: 'unassigned',
            color: DEPT_COLOURS.unassigned,
            compModel: 'Full time',
            contractStartISO: todayISO(),
            contractEndISO: todayISO(),
            salaryAnnual: 0,
            billRatePerHour: 0,
          },
        ],
        selectedMasterResourceId: id,
        selectedNodeId: null,
        selectedEdgeId: null,
      }));
    },

  deleteMasterResource: (id: string) =>
      set((s) => {
        const aliasIds = new Set(
          s.nodes
            .filter((n) => n.data?.kind === "alias" && (n.data as any).masterResourceId === id)
            .map((n) => n.id)
        );

        const nextNodes = s.nodes.filter(
          (n) => !(n.data?.kind === "alias" && (n.data as any).masterResourceId === id)
        );
        const nextEdges = s.edges.filter((e) => !aliasIds.has(e.source) && !aliasIds.has(e.target));

        const selectedNodeId = s.selectedNodeId && aliasIds.has(s.selectedNodeId) ? null : s.selectedNodeId;
        const selectedEdgeId =
          s.selectedEdgeId && nextEdges.findIndex((e) => e.id === s.selectedEdgeId) === -1
            ? null
            : s.selectedEdgeId;

        return {
          masterResources: s.masterResources.filter((r) => r.id !== id),
          nodes: nextNodes,
          edges: nextEdges,
          selectedNodeId,
          selectedEdgeId,
          selectedMasterResourceId: s.selectedMasterResourceId === id ? null : s.selectedMasterResourceId,
        };
      }),

    updateMasterResourceTitle: (id, title) =>
      set((s) => {
        const masterResources = s.masterResources.map((r) => (r.id === id ? { ...r, title } : r));

        // Sync aliases (data truth) so any computed systems that read alias data remain deterministic.
        const updatedNodes = s.nodes.map((n) => {
          if (n.data.kind !== 'alias') return n;
          const a = n.data as AliasData;
          if (a.masterResourceId !== id) return n;

          const firstName = firstNameOf(title) || a.title;
          return {
            ...n,
            data: {
              ...a,
              // keep node label minimal, but update snapshot for financial lines to avoid stale identity
              title: firstName,
              personNameSnapshot: title,
            },
          };
        });

        // Keep assignment edge styling aligned to current master colour (dept).
        const mr = masterResources.find((r) => r.id === id) ?? null;
        const stroke = String(mr?.color ?? 'rgba(0,0,0,0.35)');
        const aliasIds = new Set(
          updatedNodes
            .filter((n) => n.data.kind === 'alias' && (n.data as AliasData).masterResourceId === id)
            .map((n) => n.id)
        );

        const updatedEdges = s.edges.map((e) => {
          const base = normalizeEdge(e);
          if (!aliasIds.has(base.source)) return base;
          return normalizeEdge({
            ...base,
            style: { ...(base.style ?? {}), stroke, strokeWidth: 2 },
            data: { ...(base.data ?? {}), color: stroke },
          });
        });

        return { masterResources, nodes: updatedNodes, edges: updatedEdges };
      }),

    updateMasterResourceMeta: (id, patch) =>
      set((s) => {
        const masterResources = s.masterResources.map((r) => {
          if (r.id !== id) return r;
          const next = { ...r, ...patch } as MasterResource;

          // External contractors: contract dates + salary fields are not relevant.
          // If user switches a master resource to External, clear these so they don't appear inherited.
          if ('compModel' in patch && patch.compModel === 'External') {
            next.contractStartISO = '';
            next.contractEndISO = '';
            next.salaryAnnual = 0;
            next.billRatePerHour = 0;
          }

          // If switching back to Full time and dates are empty, seed sensible defaults.
          if ('compModel' in patch && patch.compModel === 'Full time') {
            if (!next.contractStartISO) next.contractStartISO = todayISO();
            if (!next.contractEndISO) next.contractEndISO = todayISO();
          }

          // keep color in sync with dept unless explicitly overridden
          if ('dept' in patch && patch.dept) {
            next.color = DEPT_COLOURS[patch.dept as Dept] ?? next.color;
          }

          return next;
        });

        const mr = masterResources.find((r) => r.id === id) ?? null;
        const stroke = String(mr?.color ?? 'rgba(0,0,0,0.35)');

        // Sync aliases so downstream systems that read alias data don't drift from Master truth.
        const updatedNodes = s.nodes.map((n) => {
          if (n.data.kind !== 'alias') return n;
          const a = n.data as AliasData;
          if (a.masterResourceId !== id) return n;

          const nextComp = (mr?.compModel ?? a.compModel) as 'Full time' | 'External';
          const nextDept = (mr?.dept ?? a.dept) as Dept;

          // If a master flips to External, clear incompatible alias linkage (timeline links).
          const linkToTimelineId =
            nextComp === 'External' ? null : (a.linkToTimelineId ?? null);

          // If master flips to Full time, clear external billing link by default.
          const billToBudgetId =
            nextComp === 'Full time' ? null : (a.billToBudgetId ?? null);

          const feeValueEUR = nextComp === 'Full time' ? 0 : (a.feeValueEUR ?? 0);

          return {
            ...n,
            data: {
              ...a,
              dept: nextDept,
              color: stroke,
              compModel: nextComp,
              linkToTimelineId,
              billToBudgetId,
              feeValueEUR,
            },
          };
        });

        const aliasIds = new Set(
          updatedNodes
            .filter((n) => n.data.kind === 'alias' && (n.data as AliasData).masterResourceId === id)
            .map((n) => n.id)
        );

        const updatedEdges = s.edges.map((e) => {
          const base = normalizeEdge(e);
          if (!aliasIds.has(base.source)) return base;
          return normalizeEdge({
            ...base,
            style: { ...(base.style ?? {}), stroke, strokeWidth: 2 },
            data: { ...(base.data ?? {}), color: stroke },
          });
        });

        return { masterResources, nodes: updatedNodes, edges: updatedEdges };
      }),

    onConnect: (c) => {
  const nodes = get().nodes;
  const edges = get().edges;
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

  // Enforce: an alias can only be assigned to ONE project.
  if (sourceKind === 'alias' && targetKind === 'project') {
    const existingProjectEdge = edges.find((e) => {
      if (e.source !== c.source) return false;
      const tk = getNodeKindById(nodes, e.target);
      const isAssignment = (e.data as any)?.edgeType === 'assignment';
      return tk === 'project' && isAssignment;
    });

    if (existingProjectEdge && existingProjectEdge.target !== c.target) {
      // Reject: alias already assigned to a different project
      return;
    }
  }

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
          markerStart: { type: MarkerType.ArrowClosed, width: 12, height: 12 },
          markerEnd: undefined,
        }
      : {
          markerStart: undefined,
          markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12 },
        }),

    // Edge render mode
    type: isRadius ? 'smoothstep' : 'default',

    // smoothstep-only corner rounding
    ...(isRadius ? ({ pathOptions: { borderRadius: corner } } as any) : {}),

    style: {
      strokeWidth: 2,
      stroke: color,
    },
    data: {
      color,
      ...(sourceKind === 'alias' && targetKind === 'project' ? ({ edgeType: 'assignment' } as any) : {}),
    },
  };

  // 1) Add the edge (ONCE)
  set((s) => ({ edges: addEdge(newEdge, s.edges).map((e) => normalizeEdgeForMode(e as any, s.edgeMode, s.edgeCornerRadius)) }));

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

    onEdgesChange: (changes) =>
      set((s) => ({
        edges: applyEdgeChanges(changes, s.edges).map((e) => normalizeEdgeForMode(e as any, s.edgeMode, s.edgeCornerRadius)),
      })),

    selectNode: (id) =>
      set(() => ({ selectedNodeId: id, selectedEdgeId: null, selectedMasterResourceId: null })),
    selectEdge: (id) =>
      set(() => ({ selectedEdgeId: id, selectedNodeId: null, selectedMasterResourceId: null })),
    selectMasterResource: (id) =>
      set(() => ({ selectedMasterResourceId: id, selectedNodeId: null, selectedEdgeId: null })),

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

    updateAliasMeta: (id, patch) =>
      set((s) => {
        // Alias inspector should not be able to mutate Dept / Comp model.
        // Those are defined on the Master Resource (source of truth).
        const safePatch: Partial<AliasData> = { ...patch };
        delete (safePatch as any).dept;
        delete (safePatch as any).color;
        delete (safePatch as any).compModel;
        delete (safePatch as any).title;

        const updatedNodes = s.nodes.map((n) => {
          if (n.id !== id) return n;
          if (n.data.kind !== 'alias') return n;

          const a = n.data as AliasData;

          const nextFeeMode = (safePatch.feeMode ?? a.feeMode) as AliasFeeMode;
          const nextFeeValueEUR = safeNum(safePatch.feeValueEUR ?? a.feeValueEUR);

          const nextBillToBudgetId =
            safePatch.billToBudgetId !== undefined ? safePatch.billToBudgetId : a.billToBudgetId ?? null;

          const nextLinkToTimelineId =
            safePatch.linkToTimelineId !== undefined ? safePatch.linkToTimelineId : a.linkToTimelineId ?? null;

          return {
            ...n,
            data: {
              ...a,
              ...safePatch,
              feeMode: nextFeeMode,
              feeValueEUR: nextFeeValueEUR,
              billToBudgetId: nextBillToBudgetId,
              linkToTimelineId: nextLinkToTimelineId,
            },
          };
        });

        // Keep edge styling deterministic & consistent (stroke width + marker sizing),
        // and keep stroke color aligned with the Master Resource dept colour.
        const alias = updatedNodes.find((n) => n.id === id);
        const masterId = alias?.data.kind === 'alias' ? (alias.data as AliasData).masterResourceId : null;
        const mr = masterId ? s.masterResources.find((r) => r.id === masterId) : null;
        const stroke = String(mr?.color ?? (alias?.data as any)?.color ?? 'rgba(0,0,0,0.35)');

        const updatedEdges = s.edges.map((e) => {
          const isFromAlias = e.source === id;
          const base = normalizeEdge(e);
          if (!isFromAlias) return base;
          return normalizeEdge({
            ...base,
            style: { ...(base.style ?? {}), stroke, strokeWidth: 2 },
            data: { ...(base.data ?? {}), color: stroke },
          });
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

toggleProjectTreeCollapsed: (projectId) =>
      set((s) => ({
        nodes: s.nodes.map((n) => {
          if (n.id !== projectId) return n;
          if (n.data.kind !== 'project') return n;
          const cur = Boolean((n.data as any).treeCollapsed);
          return { ...n, data: { ...(n.data as ProjectData), treeCollapsed: !cur } };
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

        const sourceKind = getNodeKindById(s.nodes, nextSource);
        const targetKind = getNodeKindById(s.nodes, nextTarget);
        const isProjectToBudgetOrTimeline =
          sourceKind === 'project' && (targetKind === 'budget' || targetKind === 'timeline');

        // keep edge rendering consistent system-wide
        const modeNow = get().edgeMode;
        const cornerNow = get().edgeCornerRadius;

        const base: any = {
          ...e,
          source: nextSource,
          target: nextTarget,
          sourceHandle: nextSourceHandle ?? undefined,
          targetHandle: nextTargetHandle ?? undefined,
          label: nextLabel,
          style: { ...(e.style ?? {}), stroke: newColor, strokeWidth: 2 },
          data: { ...(e.data ?? {}), color: newColor },
          type: modeNow === 'radius' ? 'smoothstep' : 'default',
          ...(modeNow === 'radius'
            ? ({ pathOptions: { ...((e as any).pathOptions ?? {}), borderRadius: cornerNow } } as any)
            : {}),
        };

        // Match onConnect arrow conventions (Project→Budget/Timeline arrows originate from Project side)
        if (isProjectToBudgetOrTimeline) {
          base.markerStart = { type: MarkerType.ArrowClosed, width: 12, height: 12 };
          base.markerEnd = undefined;
        } else {
          base.markerStart = undefined;
          base.markerEnd = { type: MarkerType.ArrowClosed, width: 12, height: 12 };
        }

        return base;
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

function AliasNode({ data }: { id: string; data: GraphNodeData }) {
  if (data.kind !== 'alias') return null;

  // Live truth: Alias display pulls from the Master Resource record.
  // Alias keeps only per-assignment financial/linkage data.
  const masterResources = useGraph((s) => s.masterResources);
  const toggleProjectTreeCollapsed = useGraph((s) => s.toggleProjectTreeCollapsed);
  const treeCollapsed = Boolean((data as any).treeCollapsed);
  const mr = masterResources.find((r) => r.id === (data as any).masterResourceId) ?? null;

  const compModel = (mr?.compModel ?? (data as any).compModel) as 'Full time' | 'External';
  const color = String(mr?.color ?? (data as any).color ?? DEPT_COLOURS.unassigned);
  const name = firstNameOf(String(mr?.title ?? (data as any).personNameSnapshot ?? (data as any).title ?? ''));

  const isExternal = compModel === 'External';

  return (
    <div
      className="node-card"
      style={
        card({
          width: 140,
          height: 44,
          minWidth: 140,
          maxWidth: 140,
          padding: 10,
          background: getNodeBg('alias'),
        })
      }
    >
      <Handle
        type="source"
        position={Position.Right}
        id="project-out"
        style={{ width: 10, height: 10, background: color, border: '2px solid white' }}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: 999, background: color }} />
        <div style={{ fontWeight: 450, fontSize: 12, lineHeight: 1, whiteSpace: 'nowrap' }}>{name || '—'}</div>

        {isExternal && (
          <span
            style={{
              marginLeft: 'auto',
              fontSize: 10,
              lineHeight: 1,
              padding: '3px 7px',
              borderRadius: 999,
              border: '1px solid rgba(0,0,0,0.12)',
              background: 'rgba(255,255,255,0.75)',
            }}
          >
            ext
          </span>
        )}
      </div>
    </div>
  );
}


function CapacityNode({ id, data }: { id: string; data: GraphNodeData }) {
  if (data.kind !== 'capacity') return null;

  const nodes = useGraph((s) => s.nodes);
  const edges = useGraph((s) => s.edges);
  const masterResources = useGraph((s) => s.masterResources);
  const toggleProjectTreeCollapsed = useGraph((s) => s.toggleProjectTreeCollapsed);
  const treeCollapsed = Boolean((data as any).treeCollapsed);

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
  const safe = Number.isFinite(n) ? n : 0;
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
        // Use Geist regular for system counts (matches Project node badges)
        fontWeight: 400,
        lineHeight: 1,
        boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
      }}
    >
      {safe}
    </span>
  );
}

function BureauToggle({
  on,
  onToggle,
  label,
}: {
  on: boolean;
  onToggle: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      aria-pressed={on}
      title={label ?? (on ? 'Collapse' : 'Expand')}
      style={{
        // ✅ keep behavior + layout, but REMOVE the outer “capsule”
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,

        // ✅ no padding/background/border/shadow around the toggle
        padding: 0,
        borderRadius: 0,
        border: 'none',
        background: 'transparent',
        boxShadow: 'none',

        cursor: 'pointer',
        userSelect: 'none',
      }}
    >
      {label && (
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            letterSpacing: 0.8,
            textTransform: 'uppercase',
            opacity: 0.7,
          }}
        >
          {label}
        </span>
      )}

      {/* track */}
      <span
        style={{
          position: 'relative',
          width: 34,
          height: 18,
          borderRadius: 999,
          background: on ? 'rgba(0,114,49,0.18)' : 'rgba(0,0,0,0.10)',
          border: on ? '1px solid rgba(0,114,49,0.35)' : '1px solid rgba(0,0,0,0.14)',
          transition: 'all 140ms ease',
        }}
      >
        {/* knob */}
        <span
          style={{
            position: 'absolute',
            top: 1,
            left: on ? 17 : 1,
            width: 14,
            height: 14,
            borderRadius: 999,
            background: on ? '#007231' : 'rgba(0,0,0,0.35)',
            boxShadow: '0 4px 10px rgba(0,0,0,0.18)',
            transition: 'all 140ms ease',
          }}
        />
      </span>
    </button>
  );
}

function ProjectNodeBase({ id, data }: { id: string; data: GraphNodeData }) {
  if (data.kind !== 'project') return null;

  const studio = (data as any).studio ?? 'Antinomy Studio';
  const is27b = studio === '27b';
  const client = String((data as any).client ?? '').trim();

  const nodes = useGraph((s) => s.nodes);
  const edges = useGraph((s) => s.edges);
  const masterResources = useGraph((s) => s.masterResources);
  const toggleProjectTreeCollapsed = useGraph((s) => s.toggleProjectTreeCollapsed);
  const treeCollapsed = Boolean((data as any).treeCollapsed);

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
    if (!pn) return '';
    const d: any = pn.data ?? {};

    // Live truth for aliases: resolve name from the Master Resource record.
    if (d.kind === 'alias') {
      const mr = masterResources.find((r) => r.id === String(d.masterResourceId ?? '')) ?? null;
      const full = String(mr?.title ?? d.personNameSnapshot ?? d.title ?? '').trim();
      return firstNameOf(full);
    }

    const full = String(d.title ?? '').trim();
    return firstNameOf(full);
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
      {/* Filing toggle (hide/show connected nodes) */}
      <div style={{ position: 'absolute', top: 14, right: 14, zIndex: 3 }}>
        <BureauToggle on={!treeCollapsed} onToggle={() => toggleProjectTreeCollapsed(id)} label="" />
      </div>

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
                    {shown.map((n, i) => (
                    <NamePill key={`${n}-${i}`} text={n} />
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
  const masterResources = useGraph((s) => s.masterResources);
  const toggleProjectTreeCollapsed = useGraph((s) => s.toggleProjectTreeCollapsed);
  const treeCollapsed = Boolean((data as any).treeCollapsed);

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
  const masterResources = useGraph((s) => s.masterResources);
  const toggleProjectTreeCollapsed = useGraph((s) => s.toggleProjectTreeCollapsed);
  const treeCollapsed = Boolean((data as any).treeCollapsed);

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
  aliasNode: AliasNode,
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
  const masterResources = useGraph((s) => s.masterResources);
  const toggleProjectTreeCollapsed = useGraph((s) => s.toggleProjectTreeCollapsed);
  const treeCollapsed = Boolean((data as any).treeCollapsed);

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
  fontWeight: 350,
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
  border: '0.75px solid rgba(0,0,0,0.10)',
};

const pillBtn: React.CSSProperties = {
  height: 30, // keep your BTN_H if you want
  padding: '0 14px',
  borderRadius: 999,
  border: '0.75px solid rgba(0,114,49,0.85)',
  background: 'rgba(0,90,39,0.08)',
  color: BUREAU_GREEN,
  fontSize: 13,
  fontWeight: 350,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  lineHeight: 1,
  cursor: 'pointer',
  userSelect: 'none',
  transition: 'background 120ms ease, border-color 120ms ease, transform 120ms ease',
};

const pillBtnActive: React.CSSProperties = {
  ...pillBtn,
  border: '0.75px solid rgba(0,114,49,0.85)',
  background: 'rgba(0,90,39,0.14)',
};

const pillBtnHover: React.CSSProperties = {
  background: 'rgba(0,90,39,0.12)',
  borderColor: 'rgba(0,90,39,0.5)',
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

function InspectorSelect({
  value,
  onValueChange,
  options,
  minWidth = 260,
}: {
  value: string;
  onValueChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  minWidth?: number;
}) {
  return (
    <Select.Root value={value} onValueChange={onValueChange}>
      <Select.Trigger
        style={{
          marginTop: 6,
          width: '100%',
          padding: '10px 12px',
          borderRadius: 12,
          border: '1px solid rgba(0,0,0,0.10)',
          background: 'white',
          fontSize: 13,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          lineHeight: 1.2,
          cursor: 'pointer',
          paddingRight: 16,
        }}
      >
        <Select.Value />
        <Select.Icon
          style={{
            width: 18,
            height: 18,
            display: 'grid',
            placeItems: 'center',
            opacity: 0.65,
            flex: '0 0 auto',
            marginRight: 2,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true">
            <path
              d="M5 7l5 6 5-6"
              fill="none"
              stroke="rgba(0,0,0,0.55)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Select.Icon>
      </Select.Trigger>

      <Select.Portal>
        <Select.Content
          position="popper"
          sideOffset={6}
          style={{
            zIndex: 9999,
            background: 'rgba(255,255,255,0.98)',
            borderRadius: 12,
            border: '1px solid rgba(0,0,0,0.10)',
            boxShadow: '0 14px 30px rgba(0,0,0,0.12)',
            overflow: 'hidden',
            backdropFilter: 'blur(8px)',
            minWidth,
          }}
        >
          <Select.Viewport style={{ padding: 6 }}>
            {options.map((opt) => (
              <Select.Item
                key={opt.value}
                value={opt.value}
                style={{
                  fontSize: 13,
                  padding: '10px 12px',
                  borderRadius: 10,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  cursor: 'pointer',
                  outline: 'none',
                  userSelect: 'none',
                }}
              >
                <Select.ItemText>{opt.label}</Select.ItemText>
                <Select.ItemIndicator
                  style={{
                    width: 18,
                    height: 18,
                    display: 'grid',
                    placeItems: 'center',
                    opacity: 0.95,
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true">
                    <path
                      d="M4 10.5l3.2 3.2L16 5.8"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>

          <style jsx>{`
            :global([role='option']) {
              background: transparent;
              color: rgba(0, 0, 0, 0.85);
            }
            :global([role='option'][data-highlighted]) {
              background: rgba(0, 114, 49, 0.12);
              color: rgba(0, 0, 0, 0.92);
            }
            :global([role='option'][data-state='checked']) {
              background: #007231;
              color: white;
            }
            :global([role='option'][data-state='checked'][data-highlighted]) {
              background: #005a27;
              color: white;
            }
          `}</style>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}

/**
 * -------------------------
 * Main Page
 * -------------------------
 */

export default function Home() {
    const hasLoadedRef = useRef(false);

  return (
    <ReactFlowProvider>
      <HomeInner />
    </ReactFlowProvider>
  );
}
function HomeInner() {
  const hasLoadedRef = useRef(false);
const rfRef = useRef<any>(null);

  const aliasSpawnLaneRef = useRef(0);

  const edgeMode = useGraph((s) => s.edgeMode);
  const setEdgeMode = useGraph((s) => s.setEdgeMode);
  const edgeCornerRadius = useGraph((s) => s.edgeCornerRadius);

  // Keep existing edges visually consistent when edge mode or corner radius changes.
  useEffect(() => {
    useGraph.setState((s: any) => {
      const nextEdges = (s.edges ?? []).map((e: any) => {
        const isRadius = s.edgeMode === 'radius';
        const corner = s.edgeCornerRadius ?? 50;

        const markerStart = e.markerStart
          ? { ...e.markerStart, width: 12, height: 12 }
          : undefined;
        const markerEnd = e.markerEnd
          ? { ...e.markerEnd, width: 12, height: 12 }
          : e.markerStart
          ? undefined
          : { type: MarkerType.ArrowClosed, width: 12, height: 12 };

        return {
          ...e,
          type: isRadius ? 'smoothstep' : 'default',
          ...(isRadius ? { pathOptions: { ...(e.pathOptions ?? {}), borderRadius: corner } } : { pathOptions: undefined }),
          style: { ...(e.style ?? {}), strokeWidth: 2 },
          markerStart,
          markerEnd,
        };
      });

      return { edges: nextEdges };
    });
  }, [edgeMode, edgeCornerRadius]);

  const inspectorCollapsed = useGraph((s) => s.inspectorCollapsed);
  const toggleInspectorCollapsed = useGraph((s) => s.toggleInspectorCollapsed);

  const ledgerCollapsed = useGraph((s) => s.ledgerCollapsed);
  const toggleLedgerCollapsed = useGraph((s) => s.toggleLedgerCollapsed);

  const [hoveredTop, setHoveredTop] = useState<'manager' | 'workflow' | 'reports' | null>(null);

  // Selection ids (declare ONCE)
  const selectedNodeId = useGraph((s) => s.selectedNodeId);
  const selectedEdgeId = useGraph((s) => s.selectedEdgeId);

  const selectedMasterResourceId = useGraph((s) => s.selectedMasterResourceId);

  // Pull graph state/actions ONCE (must be above derived selection)
  const {
    viewMode,
    setViewMode,
    nodes,
    edges,
    masterResources,
    addPerson,
    addCapacity,
    addProject,
    addBudget,
    addTimeline,
    addTurnover,
    spawnAliasFromMaster,
    addLedger,
    onConnect,
    onNodesChange,
    onEdgesChange,
    selectNode,
    selectEdge,
    selectMasterResource,
    addMasterResource,
    deleteMasterResource,
    updateMasterResourceTitle,
    updateMasterResourceMeta,
    updateNodeTitle,
    updatePersonMeta,
    updateAliasMeta,
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

  const getAliasAssignedProjectId = useCallback(
    (aliasId: string): string | null => {
      const edge = edges.find((e) => {
        if (e.source !== aliasId) return false;
        const tk = getNodeKindById(nodes, e.target);
        const isAssignment = (e.data as any)?.edgeType === 'assignment';
        return tk === 'project' && isAssignment;
      });
      return edge?.target ?? null;
    },
    [nodes, edges]
  );

  const getProjectConnectedBudgets = useCallback(
    (projectId: string) => {
      const budgetIds = edges
        .filter((e) => e.source === projectId && getNodeKindById(nodes, e.target) === 'budget')
        .map((e) => e.target);
      return nodes
        .filter((n) => budgetIds.includes(n.id) && n.data.kind === 'budget')
        .map((n) => ({ id: n.id, title: (n.data as BudgetData).title }));
    },
    [nodes, edges]
  );

  const getProjectConnectedTimelines = useCallback(
    (projectId: string) => {
      const timelineIds = edges
        .filter((e) => e.source === projectId && getNodeKindById(nodes, e.target) === 'timeline')
        .map((e) => e.target);
      return nodes
        .filter((n) => timelineIds.includes(n.id) && n.data.kind === 'timeline')
        .map((n) => ({ id: n.id, title: (n.data as TimelineData).title }));
    },
    [nodes, edges]
  );

  const spawnAliasAndFocus = useCallback(
    (masterId: string) => {
      const rf = rfRef.current;

      const lane = aliasSpawnLaneRef.current++;
      const screenX = window.innerWidth - (HUD_PAD + RIGHT_RAIL_W + 32) - 180;
      const screenY = 160 + (lane % 7) * 58;

      const toFlow = rf?.screenToFlowPosition
        ? rf.screenToFlowPosition({ x: screenX, y: screenY })
        : rf?.project
        ? rf.project({ x: screenX, y: screenY })
        : { x: 420, y: 260 + (lane % 7) * 58 };

      const newId = spawnAliasFromMaster(masterId, { x: toFlow.x, y: toFlow.y });

      setViewMode('workflow');
      selectMasterResource(null);
      selectNode(newId);

      requestAnimationFrame(() => {
        const inst = rfRef.current;
        if (!inst?.setCenter) return;
        const curZoom = inst.getViewport?.().zoom ?? 1;
        inst.setCenter(toFlow.x, toFlow.y, { zoom: Math.max(curZoom, 0.95), duration: 220 });
      });
    },
    [spawnAliasFromMaster, setViewMode, selectMasterResource, selectNode]
  );

  // Inspector sizing refs/state
const inspectorWrapRef = useRef<HTMLDivElement | null>(null);
const inspectorBodyRef = useRef<HTMLDivElement | null>(null);

const [inspectorHeight, setInspectorHeight] = useState<number>(520);
const [inspectorAtMax, setInspectorAtMax] = useState(false);

// snap state (prevents slow “step-down” when deselecting)
const [snapInspector, setSnapInspector] = useState(false);
const snapInspectorRef = useRef(false);

// Tuning
const INSPECTOR_MIN = 50;          // collapsed header-only target
const INSPECTOR_MIN_EXPANDED = 180; // when a node/edge is selected
const INSPECTOR_BASELINE = 50;      // expanded, NO selection (edit this)

// ✅ Derived selection (prevents stale content)
const selectedNode = useMemo(
  () => nodes.find((n) => n.id === selectedNodeId) ?? null,
  [nodes, selectedNodeId]
);

const selectedMasterResource = useMemo(
  () => masterResources.find((r) => r.id === selectedMasterResourceId) ?? null,
  [masterResources, selectedMasterResourceId]
);

const masterCompIsExternal = selectedMasterResource?.compModel === 'External';
const disabledInputStyle: React.CSSProperties = {
  opacity: 0.45,
};

const isManager = viewMode === 'manager';

const managerProjectNodes = useMemo(
  () => nodes.filter((n) => n.data.kind === 'project'),
  [nodes]
);

// Ledger HUD rollup (keep deterministic logic identical to LedgerNode)
const ledgerSums = useMemo(() => {
  const allBudgetIds = nodes
    .filter((n) => n.data.kind === 'budget')
    .map((n) => n.id);

  return allBudgetIds.reduce(
    (acc, nodeId) => {
      const calc = computeBudgetNetForBudgetNode(nodes, edges, nodeId);
      if (!calc) return acc;

      acc.grossTotal += safeNum(calc.grossTotal);
      acc.netTotal += safeNum(calc.netTotal);

      acc.netDesign += safeNum(calc.net.design);
      acc.netDev += safeNum(calc.net.dev);
      acc.netOps += safeNum(calc.net.ops);

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
}, [nodes, edges]);

const ledgerOverruns = useMemo(() => {
  const overrunDesign = Math.min(0, ledgerSums.netDesign);
  const overrunDev = Math.min(0, ledgerSums.netDev);
  const overrunOps = Math.min(0, ledgerSums.netOps);
  const overrunTotal = overrunDesign + overrunDev + overrunOps;
  const hasOverrun = overrunTotal < 0;
  return { overrunDesign, overrunDev, overrunOps, overrunTotal, hasOverrun };
}, [ledgerSums]);

// Manager panel sizing — keep a mirrored "virtual" rail on the left (same width/padding
// as the Inspector rail) so Office Manager sits centered and reveals more dimmed canvas.
// Optional polish: clamp the virtual rail so the panel remains usable on smaller screens.
const HUD_PAD = 32;
const RIGHT_RAIL_W = 300; // Inspector width (real)
const LEFT_RAIL_W = 300;  // Virtual mirror of Inspector (do NOT render)
const RAIL_GAP = 14;

// Ledger HUD measurement (so Inspector can snap underneath it)
const ledgerHudRef = useRef<HTMLDivElement | null>(null);
const [ledgerHudHeight, setLedgerHudHeight] = useState<number>(0);

useLayoutEffect(() => {
  const el = ledgerHudRef.current;
  if (!el) return;

  const measure = () => {
    const h = el.getBoundingClientRect().height;
    if (Number.isFinite(h)) setLedgerHudHeight(h);
  };

  measure();

  const ro = new ResizeObserver(() => measure());
  ro.observe(el);

  return () => ro.disconnect();
}, [ledgerCollapsed]);

const managerLeftInset = Math.min(HUD_PAD + LEFT_RAIL_W + RAIL_GAP, 420);
const managerRightInset = HUD_PAD + RIGHT_RAIL_W + RAIL_GAP;

const LEDGER_INSPECTOR_GAP = 32;
const inspectorTop = HUD_PAD + ledgerHudHeight + LEDGER_INSPECTOR_GAP;

// Manager-only overlay state (expanded card that obscures a list column)
const [managerResourceCardId, setManagerResourceCardId] = useState<string | null>(null);

useEffect(() => {
  // leaving Manager should close overlays
  if (!isManager) {
    setManagerResourceCardId(null);
    // master resources are a Manager concept; reset selection when exiting
    selectMasterResource(null);
  }
}, [isManager]);


const selectedEdge = useMemo(
  () => edges.find((e) => e.id === selectedEdgeId) ?? null,
  [edges, selectedEdgeId]
);

const hasSelection = !!selectedNode || !!selectedEdge || !!selectedMasterResource;

// ✅ Snap transition + mute ResizeObserver while returning to baseline
useEffect(() => {
  if (typeof window === 'undefined') return;
  if (inspectorCollapsed) return;

  if (!hasSelection) {
    setSnapInspector(true);
    snapInspectorRef.current = true;

    // jump immediately toward baseline (no long glide)
    setInspectorHeight((h) => Math.min(h, INSPECTOR_BASELINE));

    const t = window.setTimeout(() => {
      setSnapInspector(false);
      snapInspectorRef.current = false;
    }, 180);

    return () => window.clearTimeout(t);
  }
}, [hasSelection, inspectorCollapsed, INSPECTOR_BASELINE]);

// Auto-fit Inspector height to content (expanded) + set inspectorAtMax
useEffect(() => {
  if (typeof window === 'undefined') return;

  const wrapEl = inspectorWrapRef.current;
  const bodyEl = inspectorBodyRef.current;

  if (inspectorCollapsed) {
    setInspectorHeight(INSPECTOR_MIN);
    setInspectorAtMax(false);
    return;
  }

  if (!wrapEl || !bodyEl) return;

  const compute = () => {
    const maxH = window.innerHeight - 24;

    const headerEl = wrapEl.querySelector(
      '[data-inspector-header="true"]'
    ) as HTMLElement | null;

    const headerH = headerEl ? headerEl.getBoundingClientRect().height : INSPECTOR_MIN;

    // KEY FIX:
    // When nothing is selected, DON'T let baseline body content set height.
    // This is what was preventing you from shrinking below ~100+.
    const bodyH = hasSelection ? bodyEl.scrollHeight : 0;

    // wrapper padding top+bottom = 24, header/body gap = 10
    const desired = 24 + 10 + headerH + bodyH;

    const minExpanded = hasSelection ? INSPECTOR_MIN_EXPANDED : INSPECTOR_BASELINE;

    const clamped = Math.min(maxH, Math.max(minExpanded, desired));

    // Only allow scrolling when selection content truly overflows viewport
    const needsScroll = hasSelection && desired > maxH + 1;

    setInspectorHeight(clamped);
    setInspectorAtMax(needsScroll);
  };

  // initial measure (2-pass helps when content mounts/unmounts)
  const raf = window.requestAnimationFrame(() => {
    compute();
    window.requestAnimationFrame(compute);
  });

  const ro = new ResizeObserver(() => {
    if (snapInspectorRef.current) return;
    compute();
  });
  ro.observe(bodyEl);

  window.addEventListener('resize', compute);

  return () => {
    window.cancelAnimationFrame(raf);
    window.removeEventListener('resize', compute);
    ro.disconnect();
  };
}, [
  inspectorCollapsed,
  hasSelection,
  INSPECTOR_MIN,
  INSPECTOR_MIN_EXPANDED,
  INSPECTOR_BASELINE,
  selectedNodeId,
  selectedEdgeId,
  selectedMasterResourceId,
]);

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

  const btnActiveStyle: React.CSSProperties = {
    ...btnStyle,
    // keep padding/height identical, only change border/background/etc if needed
  };

  // ...rest of Home() continues below

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

  // Cmd+\ toggles Inspector
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const isTypingTarget =
        !!t &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          (t as any).isContentEditable);

      if (isTypingTarget) return;

      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault();
        toggleInspectorCollapsed();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggleInspectorCollapsed]);

  /**
   * HARD BLOCK: Chrome back/forward on Mac trackpad swipe.
   * Intercept wheel events inside the flow shell and preventDefault on any horizontal intent.
   */
  useEffect(() => {
  const handler = (e: WheelEvent) => {
    const shell = flowShellRef.current;
    const rf = rfRef.current;
    if (!shell || !rf) return;

    const target = e.target as HTMLElement | null;
    if (!target || !shell.contains(target)) return;

    // Don't hijack wheel inside interactive UI (inspector, selects, inputs, etc.)
    const inUi =
      !!target.closest(
        'input, textarea, select, option, button, [role="listbox"], [role="option"], [data-radix-popper-content-wrapper], [data-radix-select-content], .inspectorBody'
      );
    if (inUi) return;

    // pinch-zoom often reports ctrlKey — let the browser / OS handle it
    if (e.ctrlKey) return;

    // Horizontal intent => prevent browser swipe nav (Mac)
    if (e.deltaX !== 0 || e.shiftKey) {
      e.preventDefault();
      return;
    }

    // Normalize delta
    const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY; // lines -> px
    const abs = Math.abs(delta);

    // Magic Mouse + smooth wheels can be < 24 often. So:
    // - treat "tiny" deltas as trackpad pan
    // - treat "meaningful" deltas as mouse zoom
    const TRACKPAD_LIKE = abs < 8;          // very tiny = trackpad pan
    const MOUSE_LIKE = abs >= 8;            // magic mouse/wheel zoom

    if (TRACKPAD_LIKE) {
      // let ReactFlow panOnScroll handle it
      return;
    }

    // Mouse-like: take over and zoom
    e.preventDefault();

    const rect = shell.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const { x, y, zoom } = rf.getViewport();

    const intensity = 0.0016; // tune 0.0012–0.0020
    const factor = Math.exp(-delta * intensity);
    const nextZoom = Math.min(2.5, Math.max(0.05, zoom * factor));

    // cursor-anchored zoom
    const worldX = (mouseX - x) / zoom;
    const worldY = (mouseY - y) / zoom;

    const nextX = mouseX - worldX * nextZoom;
    const nextY = mouseY - worldY * nextZoom;

    rf.setViewport({ x: nextX, y: nextY, zoom: nextZoom }, { duration: 0 });
  };

  window.addEventListener('wheel', handler, { capture: true, passive: false });
  return () => window.removeEventListener('wheel', handler as any, { capture: true } as any);
}, []);

useEffect(() => {
  setMounted(true);
}, []);

  useEffect(() => {
    setScrubWeek(initialWeek);
  }, [initialWeek]);

  // Derived date from scrub position (uses your existing top-level addDays())
const scrubDate = useMemo(() => addDays(FY_START, scrubWeek * 7), [FY_START, scrubWeek]);

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
    masterResources,
  };

  try {
    writePersistedGraph(payload);
  } catch {
    // ignore
  }
}, [nodes, edges, masterResources, viewMode, edgeMode]);

  // Explicit Save button
const manualSave = useCallback(() => {
  const payload: PersistedGraph = {
    version: 1,
    savedAtISO: new Date().toISOString(),
    viewMode,
    edgeMode,
    nodes,
    edges,
    masterResources,
  };

  try {
    writePersistedGraph(payload);
    alert('Saved ✅');
  } catch {
    alert('Save failed (storage error).');
  }
}, [nodes, edges, masterResources, viewMode, edgeMode]);

  const exportJSON = useCallback(async () => {
  const payload: PersistedGraph = {
    version: 1,
    savedAtISO: new Date().toISOString(),
    viewMode,
    edgeMode,
    nodes,
    edges,
    masterResources,
  };

  const text = JSON.stringify(payload, null, 2);
  
  // ...rest of your export code
}, [nodes, edges, masterResources, viewMode, edgeMode]);

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

  // Project filing: when a project is collapsed, hide its directly connected alias/budget/timeline nodes + edges (visual-only)
  const hiddenNodeIds = useMemo(() => {
    const collapsed = new Set(
      nodes
        .filter((n) => n.data.kind === 'project' && Boolean((n.data as any).treeCollapsed))
        .map((n) => n.id)
    );

    const hidden = new Set();
    if (collapsed.size === 0) return hidden;

    for (const e of edges) {
      // Hide aliases assigned to this project
      if (e.type === 'assignment' && e.target && collapsed.has(e.target)) {
        const src = nodes.find((n) => n.id === e.source);
        if (src && src.data && src.data.kind === 'alias') hidden.add(e.source);
      }

      // Hide budgets/timelines directly connected from the project
      if (e.source && collapsed.has(e.source) && (e.sourceHandle === 'budget' || e.sourceHandle === 'timeline')) {
        const tgt = nodes.find((n) => n.id === e.target);
        if (tgt && tgt.data && (tgt.data.kind === 'budget' || tgt.data.kind === 'timeline')) hidden.add(e.target);
      }
    }

    return hidden;
  }, [nodes, edges]);

const displayNodes = useMemo(() => {
  const FADED = 0.15;
  const SOFT = 0.45;
  const FULL = 1;
  const PAD_DAYS = 14;

  function applyHidden(n: any) {
    return {
      ...n,
      draggable: false,
      selectable: false,
      connectable: false,
      style: {
        ...(n.style || {}),
        opacity: 0,
        pointerEvents: 'none',
        transition: 'opacity 160ms ease',
      },
    };
  }


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
    const isHidden = kind !== 'project' && hiddenNodeIds.has(n.id);

    // Inject dock flags (visual-only). Non-dockables get null.
    const dock =
      kind === 'budget' || kind === 'timeline'
        ? dockMap.get(n.id) ?? { top: false, bottom: false }
        : null;

    // always solid
    if (kind === 'person' || kind === 'alias' || kind === 'capacity') {
      const base = dock ? { ...n, data: { ...(n.data as any), dock } } : n;
      return isHidden ? applyHidden(base) : base;
    }
    if (String(kind).includes('turnover')) {
      const base = dock ? { ...n, data: { ...(n.data as any), dock } } : n;
      return isHidden ? applyHidden(base) : base;
    }

    if (kind === 'project') {
      const op = opacityForProject(n.id);
      const next = { ...n, style: { ...(n.style || {}), opacity: op } };
      const base = dock ? { ...next, data: { ...(next.data as any), dock } } : next;
      return isHidden ? applyHidden(base) : base;
    }

    if (kind === 'budget' || kind === 'timeline') {
      const pid = ownerProjectId(n.id);
      const op = pid ? opacityForProject(pid) : FULL;

      const base = {
        ...n,
        data: { ...(n.data as any), dock },
        style: { ...(n.style || {}), opacity: op },
      };
      return isHidden ? applyHidden(base) : base;
    }

    const base = dock ? { ...n, data: { ...(n.data as any), dock } } : n;
      return isHidden ? applyHidden(base) : base;
  });
}, [wiredNodes, nodes, edges, scrubDate]);

const displayEdges = useMemo(() => {
  if (!hiddenNodeIds || hiddenNodeIds.size === 0) return edges.map((e) => ({ ...e, hidden: false }));
  return edges.map((e) => {
    const hide = hiddenNodeIds.has(e.source) || hiddenNodeIds.has(e.target);
    return hide ? ({ ...e, hidden: true }) : ({ ...e, hidden: false });
  });
}, [edges, hiddenNodeIds]);


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
      {/* TOOLBARS (Top / Left / Bottom) */}
<>
  {/* TOP: Views only */}
  <div
  style={{
    position: 'absolute',
    zIndex: 10,
    top: 32,
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'inline-flex',          // ✅ hug contents
    alignItems: 'center',
    gap: 10,
    background: 'rgba(255,255,255,0.92)',
    padding: 10,
    borderRadius: 25,
    border: '1px solid rgba(0,0,0,0.08)',
    boxShadow: '0 14px 30px rgba(0,0,0,0.08)',
    flexWrap: 'nowrap',              // ✅ keep as one row
    justifyContent: 'flex-start',     // ✅ no internal centering needed
    width: 'fit-content',             // ✅ snug
    backdropFilter: 'blur(6px)',
  }}
>

<button
  onClick={() => setViewMode('workflow')}
  onMouseEnter={() => setHoveredTop('workflow')}
  onMouseLeave={() => setHoveredTop(null)}
  style={{
    ...pillBtn,
    borderRadius: 999,
    border: '0.75px solid rgba(0,114,49,0.85)',

    background:
      viewMode === 'workflow'
        ? '#005a27'
        : hoveredTop === 'workflow'
        ? '#007231'
        : 'rgba(255,255,255,0.92)',

    color:
      viewMode === 'workflow' || hoveredTop === 'workflow'
        ? 'white'
        : 'rgba(0,114,49,0.85)',
  }}
>
  Workflow
</button>

<button
  onClick={() => setViewMode('manager')}
  onMouseEnter={() => setHoveredTop('manager')}
  onMouseLeave={() => setHoveredTop(null)}
  style={{
    ...pillBtn,
    borderRadius: 999,
    border: '0.75px solid rgba(0,114,49,0.85)',

    background:
      viewMode === 'manager'
        ? '#005a27'
        : hoveredTop === 'manager'
        ? '#007231'
        : 'rgba(255,255,255,0.92)',

    color:
      viewMode === 'manager' || hoveredTop === 'manager'
        ? 'white'
        : 'rgba(0,114,49,0.85)',
  }}
>
  Manager
</button>

<button
  onClick={() => setViewMode('reports')}
  onMouseEnter={() => setHoveredTop('reports')}
  onMouseLeave={() => setHoveredTop(null)}
  style={{
    ...pillBtn,
    borderRadius: 999,
    border: '0.75px solid rgba(0,114,49,0.85)',

    background:
      viewMode === 'reports'
        ? '#005a27'
        : hoveredTop === 'reports'
        ? '#007231'
        : 'rgba(255,255,255,0.92)',

    color:
      viewMode === 'reports' || hoveredTop === 'reports'
        ? 'white'
        : 'rgba(0,114,49,0.85)',
  }}
>
  Reports
</button>

    
  </div>

  {/* LEFT: Edge + Save/I-O/Reset (vertical stack) */}
{viewMode === 'workflow' && (
<div
  style={{
    position: 'absolute',
    zIndex: 10,
    top: '50%',
    left: 32,
    transform: 'translateY(-50%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 10,
    background: 'rgba(255,255,255,0.92)',
    padding: 10,
    borderRadius: 25,
    border: '1px solid rgba(0,0,0,0.08)',
    boxShadow: '0 14px 30px rgba(0,0,0,0.08)',
    backdropFilter: 'blur(6px)',
    width: 90,
  }}
>
  {/* Radius (ACTIVE state applies here) */}
  <button
    onClick={() => setEdgeMode('radius')}
    onPointerEnter={(e) => {
      // hover = bureau green w/ white text (only if NOT active)
      if (edgeMode !== 'radius') {
        const el = e.currentTarget as HTMLButtonElement;
        el.style.background = '#007231';
        el.style.color = 'white';
        el.style.borderColor = '#007231';
      }
    }}
    onPointerLeave={(e) => {
      const el = e.currentTarget as HTMLButtonElement;
      const active = edgeMode === 'radius';
      el.style.background = active ? '#005a27' : 'white';
      el.style.color = active ? 'white' : 'rgba(0,114,49,0.85)';
      el.style.borderColor = 'rgba(0,114,49,0.85)';
    }}
    style={{
      ...pillBtn,
      width: '100%',
      background: edgeMode === 'radius' ? '#005a27' : 'white',
      color: edgeMode === 'radius' ? 'white' : 'rgba(0,114,49,0.85)',
      border: '0.75px solid rgba(0,114,49,0.85)',
    }}
  >
    Radius
  </button>

  {/* Bezier (ACTIVE state applies here) */}
  <button
    onClick={() => setEdgeMode('bezier')}
    onPointerEnter={(e) => {
      if (edgeMode !== 'bezier') {
        const el = e.currentTarget as HTMLButtonElement;
        el.style.background = '#007231';
        el.style.color = 'white';
        el.style.borderColor = '#007231';
      }
    }}
    onPointerLeave={(e) => {
      const el = e.currentTarget as HTMLButtonElement;
      const active = edgeMode === 'bezier';
      el.style.background = active ? '#005a27' : 'white';
      el.style.color = active ? 'white' : 'rgba(0,114,49,0.85)';
      el.style.borderColor = 'rgba(0,114,49,0.85)';
    }}
    style={{
      ...pillBtn,
      width: '100%',
      background: edgeMode === 'bezier' ? '#005a27' : 'white',
      color: edgeMode === 'bezier' ? 'white' : 'rgba(0,114,49,0.85)',
      border: '0.75px solid rgba(0,114,49,0.85)',
    }}
  >
    Bezier
  </button>

  <div style={{ height: 1, width: '100%', background: 'rgba(0,0,0,0.08)', margin: '2px 0' }} />

  {/* Save (no active state, just hover) */}
  <button
    onClick={manualSave}
    onPointerEnter={(e) => {
      const el = e.currentTarget as HTMLButtonElement;
      el.style.background = '#007231';
      el.style.color = 'white';
      el.style.borderColor = '#007231';
    }}
    onPointerLeave={(e) => {
      const el = e.currentTarget as HTMLButtonElement;
      el.style.background = 'white';
      el.style.color = 'rgba(0,114,49,0.85)';
      el.style.borderColor = 'rgba(0,114,49,0.85)';
    }}
    style={{
      ...pillBtn,
      width: '100%',
      background: 'white',
      color: 'rgba(0,114,49,0.85)',
      border: '0.75px solid rgba(0,114,49,0.85)',
    }}
  >
    Save
  </button>

  <button
    onClick={exportJSON}
    onPointerEnter={(e) => {
      const el = e.currentTarget as HTMLButtonElement;
      el.style.background = '#007231';
      el.style.color = 'white';
      el.style.borderColor = '#007231';
    }}
    onPointerLeave={(e) => {
      const el = e.currentTarget as HTMLButtonElement;
      el.style.background = 'white';
      el.style.color = 'rgba(0,114,49,0.85)';
      el.style.borderColor = 'rgba(0,114,49,0.85)';
    }}
    style={{
      ...pillBtn,
      width: '100%',
      background: 'white',
      color: 'rgba(0,114,49,0.85)',
      border: '0.75px solid rgba(0,114,49,0.85)',
    }}
  >
    Export
  </button>

  <button
    onClick={importJSON}
    onPointerEnter={(e) => {
      const el = e.currentTarget as HTMLButtonElement;
      el.style.background = '#007231';
      el.style.color = 'white';
      el.style.borderColor = '#007231';
    }}
    onPointerLeave={(e) => {
      const el = e.currentTarget as HTMLButtonElement;
      el.style.background = 'white';
      el.style.color = 'rgba(0,114,49,0.85)';
      el.style.borderColor = 'rgba(0,114,49,0.85)';
    }}
    style={{
      ...pillBtn,
      width: '100%',
      background: 'white',
      color: 'rgba(0,114,49,0.85)',
      border: '0.75px solid rgba(0,114,49,0.85)',
    }}
  >
    Import
  </button>

  <button
    onClick={() => {
      if (confirm('Reset graph? This will wipe the saved canvas.')) {
        localStorage.removeItem(APP_STORAGE_KEY);
        resetGraph();
      }
    }}
    onPointerEnter={(e) => {
      const el = e.currentTarget as HTMLButtonElement;
      el.style.background = '#007231';
      el.style.color = 'white';
      el.style.borderColor = '#007231';
      el.style.opacity = '1';
    }}
    onPointerLeave={(e) => {
      const el = e.currentTarget as HTMLButtonElement;
      el.style.background = 'white';
      el.style.color = 'rgba(0,114,49,0.85)';
      el.style.borderColor = 'rgba(0,114,49,0.85)';
      el.style.opacity = '0.9';
    }}
    style={{
      ...pillBtn,
      width: '100%',
      background: 'white',
      color: 'rgba(0,114,49,0.85)',
      border: '0.75px solid rgba(0,114,49,0.85)',
      opacity: 0.9,
    }}
  >
    Reset
  </button>
</div>

)}

  {/* BOTTOM: Add nodes only (replaces scrubber space) */}
{viewMode === 'workflow' && (
<div
  style={{
    position: 'absolute',
    zIndex: 10,
    bottom: 32,
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 10,
    background: 'rgba(255,255,255,0.92)',
    padding: 10,
    borderRadius: 25,
    border: '0.75px solid rgba(0,0,0,0.08)',
    boxShadow: '0 14px 30px rgba(0,0,0,0.08)',
    flexWrap: 'nowrap',
    justifyContent: 'flex-start',
    width: 'fit-content',
    backdropFilter: 'blur(6px)',
  }}
>
  {(() => {
    const STROKE = 'rgba(0,114,49,0.85)';
    const HOVER_BG = '#007231';

    const ActionPill = ({
      label,
      onClick,
    }: {
      label: string;
      onClick: () => void;
    }) => {
      const [hover, setHover] = useState(false);

      return (
        <button
          onClick={onClick}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          style={{
            ...pillBtn,
            borderColor: STROKE,
            color: hover ? 'white' : STROKE,
            background: hover ? HOVER_BG : 'white',
            transition: 'background 120ms ease, color 120ms ease, border-color 120ms ease',
          }}
        >
          {label}
        </button>
      );
    };

    return (
      <>
        <ActionPill label="+ Resource" onClick={() => setViewMode('manager')} />
        <ActionPill label="+ Project" onClick={addProject} />
        <ActionPill label="+ Budget" onClick={addBudget} />
        <ActionPill label="+ Timeline" onClick={addTimeline} />
        
      </>
    );
  })()}
</div>
)}
</>

{/* Ledger HUD (pinned, screen-space) */}
<div
  ref={ledgerHudRef}
  style={{
    position: 'absolute',
    zIndex: 11,
    top: HUD_PAD,
    right: HUD_PAD,
    width: 300,
    // Collapsed is header-only; expanded grows with content but is capped to viewport.
    height: ledgerCollapsed ? 52 : 'auto',
    maxHeight: ledgerCollapsed ? 52 : 'calc(100vh - 64px)',
    overflow: 'hidden',

    background: 'rgba(255,255,255,0.92)',
    padding: 15,
    borderRadius: 10,
    border: '1px solid rgba(0,0,0,0.08)',
    boxShadow: '0 14px 30px rgba(0,0,0,0.08)',
    backdropFilter: 'blur(6px)',

    display: 'flex',
    flexDirection: 'column',
    transition: 'height 180ms ease, max-height 180ms ease',
    transformOrigin: 'top right',
  }}
>
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    }}
  >
    <div style={{ minWidth: 0 }}>
      <div style={{ fontWeight: 500, fontSize: 13, lineHeight: 1.1 }}>Ledger</div>
      {!ledgerCollapsed && (
        <div style={{ opacity: 0.6, fontSize: 12, marginTop: 2 }}>Totals across all budgets.</div>
      )}
    </div>

    <BureauToggle on={!ledgerCollapsed} onToggle={toggleLedgerCollapsed} label="" />
  </div>

  <div style={{ height: 10 }} />

  {ledgerCollapsed ? (
    <div style={{ flex: 1 }} />
  ) : (
    <div
      style={{
        flex: 1,
        overflowY: 'auto',
        overflowX: 'hidden',
        paddingBottom: 10,
        paddingRight: 2,
        minHeight: 0,
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
      }}
    >
      <div style={{ display: 'flex', gap: 14 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, opacity: 0.65 }}>Gross</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{formatEUR(ledgerSums.grossTotal)}</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, opacity: 0.65 }}>Net</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{formatEUR(ledgerSums.netTotal)}</div>
        </div>
      </div>

      <div style={{ marginTop: 12, display: 'grid', gap: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
          <span style={{ opacity: 0.7 }}>Net Design</span>
          <span style={{ fontWeight: 650 }}>{formatEUR(ledgerSums.netDesign)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
          <span style={{ opacity: 0.7 }}>Net Dev</span>
          <span style={{ fontWeight: 650 }}>{formatEUR(ledgerSums.netDev)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
          <span style={{ opacity: 0.7 }}>Net Ops</span>
          <span style={{ fontWeight: 650 }}>{formatEUR(ledgerSums.netOps)}</span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 6 }}>
          <span style={{ opacity: 0.7 }}>Debits</span>
          <span style={{ fontWeight: 650 }}>
            {formatEUR(ledgerSums.debitsTotal)}{' '}
            <span style={{ opacity: 0.55 }}>({ledgerSums.debitsCount})</span>
          </span>
        </div>

        {ledgerOverruns.hasOverrun && (
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
              <span style={{ fontWeight: 650 }}>{formatEUR(ledgerOverruns.overrunTotal)}</span>
            </div>
            {ledgerOverruns.overrunDesign < 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ opacity: 0.7 }}>Overrun Design</span>
                <span style={{ fontWeight: 650 }}>{formatEUR(ledgerOverruns.overrunDesign)}</span>
              </div>
            )}
            {ledgerOverruns.overrunDev < 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ opacity: 0.7 }}>Overrun Dev</span>
                <span style={{ fontWeight: 650 }}>{formatEUR(ledgerOverruns.overrunDev)}</span>
              </div>
            )}
            {ledgerOverruns.overrunOps < 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ opacity: 0.7 }}>Overrun Ops</span>
                <span style={{ fontWeight: 650 }}>{formatEUR(ledgerOverruns.overrunOps)}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )}
</div>

{/* Inspector */}
<div
  ref={inspectorWrapRef}
  style={{
    position: 'absolute',
    zIndex: 10,
    right: 32,

    // snapped under the Ledger HUD
    top: inspectorTop,
    transform: 'none',

    width: 300, // constant width

    // vertical collapse/expand
    height: inspectorCollapsed ? INSPECTOR_MIN : inspectorHeight,
    maxHeight: 'calc(100vh - 24px)',
    transition: snapInspector ? 'none' : 'height 180ms ease',
    overflow: 'hidden',

    background: 'rgba(255,255,255,0.92)',
    padding: 15,
    borderRadius: 10,
    border: '1px solid rgba(0,0,0,0.08)',
    boxShadow: '0 14px 30px rgba(0,0,0,0.08)',
    backdropFilter: 'blur(6px)',

    display: 'flex',
    flexDirection: 'column',

    // make expand feel like it “grows down” from the header
    transformOrigin: 'top right',
  }}
>
  {/* Header row always visible (ResizeObserver expects this attr) */}
  <div
    data-inspector-header="true"
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    }}
  >
    <div style={{ minWidth: 0 }}>
      <div style={{ fontWeight: 500, fontSize: 13, lineHeight: 1.1 }}>Inspector</div>
      {!inspectorCollapsed && (
        <div style={{ opacity: 0.6, fontSize: 12, marginTop: 2 }}>
          Click a node or connection to edit it.
        </div>
      )}
    </div>

    <BureauToggle on={!inspectorCollapsed} onToggle={toggleInspectorCollapsed} label="" />
  </div>

  <div style={{ height: 10 }} />

  {/* Collapsed hint OR Expanded body */}
  {inspectorCollapsed ? (
    <div
      style={{
        flex: 1,
        display: 'grid',
        placeItems: 'center',
        padding: 8,
      }}
    >
     
    </div>
  ) : (
    <div
  key={`${selectedNodeId ?? 'none'}:${selectedEdgeId ?? 'none'}:${selectedMasterResourceId ?? 'none'}`}
  ref={inspectorBodyRef}
  style={{
    // ✅ critical: don't force tall body unless we're at max
    flex: inspectorAtMax ? 1 : '0 0 auto',
    overflowY: inspectorAtMax ? 'auto' : 'visible',
    overflowX: 'hidden',
    paddingBottom: 15,
    paddingRight: 2,

        // ✅ hide scrollbar chrome (Firefox/IE/Edge legacy)
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
      }}
    >

      {/* Selected MASTER RESOURCE */}
      {selectedMasterResource && (
        <div style={{ marginTop: 6 }}>
          <div style={{ fontWeight: 650, fontSize: 12 }}>MASTER RESOURCE</div>

          <label style={{ display: 'block', marginTop: 10, fontSize: 12, opacity: 0.8 }}>
            Resource Name
            <input
              style={inputStyle}
              value={selectedMasterResource.title}
              onChange={(e) => updateMasterResourceTitle(selectedMasterResource.id, e.target.value)}
            />
          </label>

          {/* Entity */}
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: 12, opacity: 0.75 }}>Entity</div>
            <div style={{ marginLeft: 'auto', fontSize: 12, opacity: 0.7 }}>
              {selectedMasterResource.entity}
            </div>
          </div>

          <InspectorSelect
            value={String(selectedMasterResource.entity)}
            onValueChange={(v) => updateMasterResourceMeta(selectedMasterResource.id, { entity: v as Studio })}
            options={[
              { value: 'Antinomy Studio', label: 'Antinomy Studio' },
              { value: '27b', label: '27b' },
            ]}
          />

          {/* Dept */}
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: 12, opacity: 0.75 }}>Dept</div>
            <span
              style={{
                width: 12,
                height: 12,
                borderRadius: 999,
                background: selectedMasterResource.color,
                border: '1px solid rgba(0,0,0,0.08)',
              }}
            />
            <div style={{ marginLeft: 'auto', fontSize: 12, opacity: 0.7 }}>
              {deptLabel(selectedMasterResource.dept)}
            </div>
          </div>

          {/* Dept */}
          <InspectorSelect
            value={String(selectedMasterResource.dept)}
            onValueChange={(v) => updateMasterResourceMeta(selectedMasterResource.id, { dept: v as Dept })}
            options={[
              { value: 'unassigned', label: 'Unassigned' },
              { value: 'ops', label: 'Operations' },
              { value: 'design', label: 'Design' },
              { value: 'dev', label: 'Engineering' },
            ]}
          />

          {/* Comp model (dropdown) */}
          <div style={{ marginTop: 12, fontSize: 12, fontWeight: 700, opacity: 0.7 }}>Comp model</div>
          <InspectorSelect
            value={String(selectedMasterResource.compModel)}
            onValueChange={(v) => updateMasterResourceMeta(selectedMasterResource.id, { compModel: v as any })}
            options={[
              { value: 'Full time', label: 'Full time' },
              { value: 'External', label: 'External' },
            ]}
          />

          {/* Contract */}
          <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label style={{ display: 'block', fontSize: 12, opacity: 0.85 }}>
              Contract start
              <input
                style={{
                  ...inputStyle,
                  ...(masterCompIsExternal ? disabledInputStyle : null),
                }}
                type="date"
                value={selectedMasterResource.contractStartISO}
                onChange={(e) => updateMasterResourceMeta(selectedMasterResource.id, { contractStartISO: e.target.value })}
                disabled={masterCompIsExternal}
              />
            </label>
            <label style={{ display: 'block', fontSize: 12, opacity: 0.85 }}>
              Contract end
              <input
                style={{
                  ...inputStyle,
                  ...(masterCompIsExternal ? disabledInputStyle : null),
                }}
                type="date"
                value={selectedMasterResource.contractEndISO}
                onChange={(e) => updateMasterResourceMeta(selectedMasterResource.id, { contractEndISO: e.target.value })}
                disabled={masterCompIsExternal}
              />
            </label>
          </div>

          {/* Salary / rate */}
          <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label style={{ display: 'block', fontSize: 12, opacity: 0.85 }}>
              Salary annual
              <input
                style={{
                  ...inputStyle,
                  ...(masterCompIsExternal ? disabledInputStyle : null),
                }}
                type="number"
                value={Number(selectedMasterResource.salaryAnnual ?? 0)}
                onChange={(e) => updateMasterResourceMeta(selectedMasterResource.id, { salaryAnnual: Number(e.target.value) })}
                disabled={masterCompIsExternal}
              />
            </label>
            <label style={{ display: 'block', fontSize: 12, opacity: 0.85 }}>
              Bill rate (€/h)
              <input
                style={{
                  ...inputStyle,
                  ...(masterCompIsExternal ? disabledInputStyle : null),
                }}
                type="number"
                value={Number(selectedMasterResource.billRatePerHour ?? 0)}
                onChange={(e) => updateMasterResourceMeta(selectedMasterResource.id, { billRatePerHour: Number(e.target.value) })}
                disabled={masterCompIsExternal}
              />
            </label>
          </div>

         
          
        </div>
      )}

      {/* Selected NODE */}
{selectedNode && (
  <div style={{ marginTop: 6 }}>
    {(selectedNode.data as any)?.kind !== 'alias' && (
      <div style={{ fontWeight: 650, fontSize: 12 }}>
        {String((selectedNode.data as any)?.kind ?? '').toUpperCase()} Node
      </div>
    )}

    {(selectedNode.data as any).kind !== 'alias' && (
      <label style={{ display: 'block', marginTop: 10, fontSize: 12, opacity: 0.8 }}>
        {(selectedNode.data as any).kind === 'project' ? 'Project name' : 'Title'}
        <input
          style={inputStyle}
          value={String((selectedNode.data as any).title ?? '')}
          onChange={(e) => updateNodeTitle(selectedNode.id, e.target.value)}
        />
      </label>
    )}

    {(selectedNode.data as any).kind === 'person' && (
      <>
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ fontSize: 12, opacity: 0.75 }}>Dept</div>
          <span
            style={{
              width: 12,
              height: 12,
              borderRadius: 999,
              background: (selectedNode.data as any).color,
              border: '1px solid rgba(0,0,0,0.08)',
            }}
          />
          <div style={{ marginLeft: 'auto', fontSize: 12, opacity: 0.7 }}>
            {deptLabel((selectedNode.data as any).dept)}
          </div>
        </div>

              <InspectorSelect
                value={String((selectedNode.data as any).dept)}
                onValueChange={(v) => updatePersonMeta(selectedNode.id, { dept: v as Dept })}
                options={[
                  { value: 'unassigned', label: 'Unassigned' },
                  { value: 'ops', label: 'Operations' },
                  { value: 'design', label: 'Design' },
                  { value: 'dev', label: 'Engineering' },
                ]}
              />

              <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, fontSize: 12 }}>
                <input
                  type="checkbox"
                  checked={Boolean((selectedNode.data as any).isExternal)}
                  onChange={(e) => updatePersonMeta(selectedNode.id, { isExternal: e.target.checked })}
                />
                External to org
              </label>

              <label
                style={{
                  display: 'block',
                  marginTop: 10,
                  fontSize: 12,
                  opacity: (selectedNode.data as any).isExternal ? 0.9 : 0.45,
                }}
              >
                External fee (EUR)
                <input
                  style={inputStyle}
                  type="number"
                  disabled={!(selectedNode.data as any).isExternal}
                  value={Number((selectedNode.data as any).externalFeeEUR ?? 0)}
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
                  opacity: (selectedNode.data as any).isExternal ? 0.9 : 0.45,
                }}
              >
                Budget
                <select
                  style={inputStyle}
                  disabled={!(selectedNode.data as any).isExternal}
                  value={String(((selectedNode.data as PersonData).billToBudgetId ?? '') as any)}
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
                  opacity: (selectedNode.data as any).isExternal ? 0.9 : 0.45,
                }}
              >
                Phase
                <select
                  style={inputStyle}
                  disabled={!(selectedNode.data as any).isExternal}
                  value={String(((selectedNode.data as PersonData).billToPhase ?? 'design') as any)}
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

          {(selectedNode.data as any).kind === 'alias' && (
  <>
    {(() => {
      const a = selectedNode.data as AliasData;

      const mr = masterResources.find((r) => r.id === a.masterResourceId) ?? null;
      const resourceName = String((mr as any)?.name ?? (mr as any)?.title ?? '').trim() || 'Resource';

      const projectId = getAliasAssignedProjectId(selectedNode.id);
      const projectTitle = projectId
        ? ((nodes.find((n) => n.id === projectId)?.data as any)?.title ?? 'Project')
        : null;

      const connectedBudgets = projectId ? getProjectConnectedBudgets(projectId) : [];
      const connectedTimelines = projectId ? getProjectConnectedTimelines(projectId) : [];

      // Master defines Dept + Comp model (alias can carry linkage/finance only)
      const dept = ((mr as any)?.dept ?? a.dept) as Dept;
      const color = String((mr as any)?.color ?? (a as any).color ?? DEPT_COLOURS.unassigned);
      const compModel = (((mr as any)?.compModel ?? (a as any).compModel) as 'Full time' | 'External') || 'Full time';

      return (
        <>
          {/* Header: resource name (uneditable, master truth) */}
          <div style={{ marginTop: 8 }}>
            <div style={{ fontWeight: 700, fontSize: 18, lineHeight: 1.1 }}>{resourceName}</div>
            <div style={{ marginTop: 4, fontSize: 12, opacity: 0.55 }}>Assignment</div>
          </div>

          {/* Dept (display only) */}
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: 12, opacity: 0.75 }}>Dept</div>
            <span
              style={{
                width: 12,
                height: 12,
                borderRadius: 999,
                background: color,
                border: '1px solid rgba(0,0,0,0.08)',
              }}
            />
            <div style={{ marginLeft: 'auto', fontSize: 12, opacity: 0.7 }}>{deptLabel(dept)}</div>
          </div>

          {/* Comp model (display only) */}
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: 12, opacity: 0.75 }}>Comp model</div>
            <div style={{ marginLeft: 'auto', fontSize: 12, opacity: 0.7 }}>{compModel}</div>
          </div>

          {/* Assigned project */}
          <div style={{ marginTop: 12, fontSize: 12, opacity: 0.75 }}>
            Assigned project
            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.6 }}>
              {projectTitle ? projectTitle : 'Connect this alias to a project'}
            </div>
          </div>

          {/* External: fee + bill to budget (scoped) */}
          {compModel === 'External' ? (
            <>
              <div style={{ marginTop: 12, fontSize: 12, fontWeight: 700, opacity: 0.7 }}>Fee</div>
              <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <label style={{ display: 'block', fontSize: 12, opacity: 0.85 }}>
                  Mode
                  <select
                    style={inputStyle}
                    value={String((a as any).feeMode)}
                    onChange={(e) => updateAliasMeta(selectedNode.id, { feeMode: e.target.value as any })}
                  >
                    <option value="fixed">Fixed</option>
                    <option value="dayRate">Day rate</option>
                  </select>
                </label>
                <label style={{ display: 'block', fontSize: 12, opacity: 0.85 }}>
                  Amount (€)
                  <input
                    style={inputStyle}
                    type="number"
                    value={Number((a as any).feeValueEUR ?? 0)}
                    onChange={(e) => updateAliasMeta(selectedNode.id, { feeValueEUR: Number(e.target.value) })}
                  />
                </label>
              </div>

              <div style={{ marginTop: 12, fontWeight: 650, fontSize: 12, opacity: 0.85 }}>
                Bill to budget
              </div>
              <label style={{ display: 'block', marginTop: 10, fontSize: 12, opacity: projectId ? 0.9 : 0.45 }}>
                Budget
                <select
                  style={inputStyle}
                  disabled={!projectId}
                  value={String((a as any).billToBudgetId ?? '')}
                  onChange={(e) =>
                    updateAliasMeta(selectedNode.id, { billToBudgetId: e.target.value ? e.target.value : null })
                  }
                >
                  <option value="">Unassigned</option>
                  {connectedBudgets.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.title}
                    </option>
                  ))}
                </select>
              </label>
              {!projectId && (
                <div style={{ marginTop: 8, fontSize: 12, opacity: 0.55 }}>
                  Connect resource alias → project to scope budgets.
                </div>
              )}
            </>
          ) : (
            <>
              {/* Full time: link to timeline (scoped) */}
              <div style={{ marginTop: 12, fontWeight: 650, fontSize: 12, opacity: 0.85 }}>
                Link to timeline
              </div>
              <label style={{ display: 'block', marginTop: 10, fontSize: 12, opacity: projectId ? 0.9 : 0.45 }}>
                Timeline
                <select
                  style={inputStyle}
                  disabled={!projectId}
                  value={String((a as any).linkToTimelineId ?? '')}
                  onChange={(e) =>
                    updateAliasMeta(selectedNode.id, { linkToTimelineId: e.target.value ? e.target.value : null })
                  }
                >
                  <option value="">Unassigned</option>
                  {connectedTimelines.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </select>
              </label>
              {!projectId && (
                <div style={{ marginTop: 8, fontSize: 12, opacity: 0.55 }}>
                  Connect resource alias → project to scope timelines.
                </div>
              )}
            </>
          )}
        </>
      );
    })()}
  </>
)}

          {(selectedNode.data as any).kind === 'project' && (
            <>
              

              <div style={{ marginTop: 10, fontSize: 12, fontWeight: 700, opacity: 0.7 }}>Studio</div>

<Select.Root
  value={String(((selectedNode.data as ProjectData).studio ?? 'Antinomy Studio') as any)}
  onValueChange={(v: string) => updateProjectStudio(selectedNode.id, v as Studio)}
>
  <Select.Trigger
    aria-label="Studio"
    style={{
      marginTop: 6,
      width: '100%',
      padding: '10px 12px',
      borderRadius: 12,
      border: '1px solid rgba(0,0,0,0.10)',
      background: 'white',
      fontSize: 13,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      lineHeight: 1.2,
      cursor: 'pointer',

      // ✅ safe zone for chevron
      paddingRight: 16,
    }}
  >
    <Select.Value />

    <Select.Icon
      style={{
        width: 18,
        height: 18,
        display: 'grid',
        placeItems: 'center',
        opacity: 0.65,
        flex: '0 0 auto',
        marginRight: 2,
      }}
    >
      <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true">
        <path
          d="M5 7l5 6 5-6"
          fill="none"
          stroke="rgba(0,0,0,0.55)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </Select.Icon>
  </Select.Trigger>

  <Select.Portal>
    <Select.Content
      position="popper"
      sideOffset={6}
      style={{
        zIndex: 9999,
        background: 'rgba(255,255,255,0.98)',
        borderRadius: 12,
        border: '1px solid rgba(0,0,0,0.10)',
        boxShadow: '0 14px 30px rgba(0,0,0,0.12)',
        overflow: 'hidden',
        backdropFilter: 'blur(8px)',
        minWidth: 260,
      }}
    >
      <Select.Viewport style={{ padding: 6 }}>
        <Select.Item
          value="Antinomy Studio"
          style={{
            fontSize: 13,
            padding: '10px 12px',
            borderRadius: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            cursor: 'pointer',
            outline: 'none',
            userSelect: 'none',
          }}
        >
          <Select.ItemText>Antinomy Studio</Select.ItemText>

          <Select.ItemIndicator
            style={{
              width: 18,
              height: 18,
              display: 'grid',
              placeItems: 'center',
              opacity: 0.95,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true">
              <path
                d="M4 10.5l3.2 3.2L16 5.8"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Select.ItemIndicator>
        </Select.Item>

        <Select.Item
          value="27b"
          style={{
            fontSize: 13,
            padding: '10px 12px',
            borderRadius: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            cursor: 'pointer',
            outline: 'none',
            userSelect: 'none',
          }}
        >
          <Select.ItemText>27b</Select.ItemText>

          <Select.ItemIndicator
            style={{
              width: 18,
              height: 18,
              display: 'grid',
              placeItems: 'center',
              opacity: 0.95,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true">
              <path
                d="M4 10.5l3.2 3.2L16 5.8"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Select.ItemIndicator>
        </Select.Item>
      </Select.Viewport>

      {/* ✅ IMPORTANT: Radix Select items do NOT use [data-radix-select-item].
          They use data-radix-collection-item + data-highlighted + data-state="checked".
          Target the actual nodes by role="option". */}
      <style jsx>{`
        :global([role='option']) {
          background: transparent;
          color: rgba(0, 0, 0, 0.85);
        }

        /* Hover / keyboard highlight */
        :global([role='option'][data-highlighted]) {
          background: rgba(0, 114, 49, 0.12);
          color: rgba(0, 0, 0, 0.92);
        }

        /* Selected row (your ask: bureau green selection) */
        :global([role='option'][data-state='checked']) {
          background: #007231;
          color: white;
        }

        /* Selected + highlighted (darker) */
        :global([role='option'][data-state='checked'][data-highlighted]) {
          background: #005a27;
          color: white;
        }
      `}</style>
    </Select.Content>
  </Select.Portal>
</Select.Root>

              <div style={{ marginTop: 10, fontSize: 12, fontWeight: 700, opacity: 0.7 }}>Client</div>
              <input
                value={String((selectedNode.data as ProjectData).client ?? '')}
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

          {(selectedNode.data as any).kind === 'budget' && (
            <>
              <div style={{ marginTop: 12, fontWeight: 650, fontSize: 12, opacity: 0.85 }}>Phase amounts</div>

              <label style={{ display: 'block', marginTop: 10, fontSize: 12, opacity: 0.8 }}>
                Design
                <input
                  style={inputStyle}
                  type="number"
                  value={Number((selectedNode.data as any).designAmount ?? 0)}
                  onChange={(e) => updateBudgetPhases(selectedNode.id, { designAmount: Number(e.target.value) })}
                />
              </label>

              <label style={{ display: 'block', marginTop: 10, fontSize: 12, opacity: 0.8 }}>
                Technology (Engineering)
                <input
                  style={inputStyle}
                  type="number"
                  value={Number((selectedNode.data as any).devAmount ?? 0)}
                  onChange={(e) => updateBudgetPhases(selectedNode.id, { devAmount: Number(e.target.value) })}
                />
              </label>

              <label style={{ display: 'block', marginTop: 10, fontSize: 12, opacity: 0.8 }}>
                Ops
                <input
                  style={inputStyle}
                  type="number"
                  value={Number((selectedNode.data as any).opsAmount ?? 0)}
                  onChange={(e) => updateBudgetPhases(selectedNode.id, { opsAmount: Number(e.target.value) })}
                />
              </label>

              <div
                style={{
                  marginTop: 10,
                  padding: 15,
                  borderRadius: 12,
                  background: 'rgba(0,0,0,0.03)',
                  border: '1px solid rgba(0,0,0,0.08)',
                }}
              >
                <div style={{ fontSize: 12, opacity: 0.7 }}>Total</div>
                <div style={{ fontWeight: 750, fontSize: 14 }}>
                  {formatEUR(budgetTotal(selectedNode.data as any))}
                </div>
              </div>
            </>
          )}

          {(selectedNode.data as any).kind === 'timeline' && (
            <>
              <div style={{ marginTop: 12, fontWeight: 650, fontSize: 12, opacity: 0.85 }}>Date range</div>

              <label style={{ display: 'block', marginTop: 10, fontSize: 12, opacity: 0.8 }}>
                Start
                <input
                  style={inputStyle}
                  type="date"
                  value={String((selectedNode.data as any).startDate ?? '')}
                  onChange={(e) => updateTimelineDates(selectedNode.id, { startDate: e.target.value })}
                />
              </label>

              <label style={{ display: 'block', marginTop: 10, fontSize: 12, opacity: 0.8 }}>
                End
                <input
                  style={inputStyle}
                  type="date"
                  value={String((selectedNode.data as any).endDate ?? '')}
                  onChange={(e) => updateTimelineDates(selectedNode.id, { endDate: e.target.value })}
                />
              </label>
            </>
          )}
        </div>
      )}

      {/* Selected EDGE */}
      {selectedEdge && (
        <div style={{ marginTop: selectedNode ? 18 : 6 }}>
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
    </div>
  )}

  
</div>


      {/* Views */}
      {viewMode === 'reports' ? (
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
  <div style={{ fontSize: 26, fontWeight: 800, opacity: 0.95, letterSpacing: -0.9 }}>
  The Bureau <span style={{ color: BUREAU_GREEN, opacity: 1 }}>•</span>
</div>
<div style={{ fontSize: 14, opacity: 0.4 }}>Prototype Business Reality</div>
</div>
{/* Timeline Scrubber (Workflow view) */}
{/* Time Scrubber */}
<div
  aria-hidden
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

    /* ✅ hide without unmounting */
    opacity: 0,
    pointerEvents: 'none',
    visibility: 'hidden',
  }}
>
  {/* Left meta */}
  <div style={{ minWidth: 120 }}>
    <div style={{ fontSize: 12, fontWeight: 600 }}>FY · Week {scrubWeek + 1}</div>
    <div style={{ fontSize: 11, opacity: 0.65 }}>{mounted ? fmtShort(scrubDate) : ''}</div>
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


{isManager && (
  <div
    style={{
      position: 'absolute',
      zIndex: 9, // keep Inspector above
      left: managerLeftInset,
      right: managerRightInset, // dock up to Inspector rail (right) + virtual rail (left)
      top: 96,
      bottom: 32,
      background: 'rgba(255,255,255,0.92)',
      border: '1px solid rgba(0,0,0,0.08)',
      borderRadius: 18,
      boxShadow: '0 14px 30px rgba(0,0,0,0.08)',
      backdropFilter: 'blur(6px)',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
    }}
  >
    {/* Header */}
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '14px 16px 12px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.22)',
        background: BUREAU_GREEN,
      }}
    >
      {/* Left slot reserved for future Manager controls */}
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: 18 }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <input
          placeholder="Search…"
          style={{ ...inputStyle, width: 220, marginTop: 0, background: 'white' }}
        />
      </div>
    </div>

    {/* Lens strip (placeholder MVP) */}
    <div
      style={{
        padding: '10px 16px',
        borderBottom: '1px solid rgba(0,0,0,0.06)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 650, opacity: 0.75 }}>Timeline lens</div>
      <div style={{ fontSize: 12, opacity: 0.55 }}>Scrub to focus projects and roster.</div>
    </div>

    {/* Body: two columns */}
    <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', minHeight: 0 }}>
      {/* Case Files column (placeholder) */}
      <div style={{ borderRight: '1px solid rgba(0,0,0,0.06)', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.2, textTransform: 'uppercase', opacity: 0.75 }}>
              Projects
            </div>
            <CountBadge n={managerProjectNodes.length} />
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 10px 10px 10px' }}>
          {managerProjectNodes.length === 0 ? (
            <div style={{ padding: 12, fontSize: 12, opacity: 0.55 }}>
              No projects yet. Create your first project in Workflow.
            </div>
          ) : (
            managerProjectNodes
              .slice()
              .sort((a, b) => String((a.data as any).title ?? '').localeCompare(String((b.data as any).title ?? '')))
              .map((p) => (
                <div
                  key={p.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    // Quick jump back into canvas context for this project
                    setViewMode('workflow');
                    selectNode(p.id);
                    selectEdge(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setViewMode('workflow');
                      selectNode(p.id);
                      selectEdge(null);
                    }
                  }}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '12px 12px',
                    borderRadius: 14,
                    border: '1px solid rgba(0,0,0,0.08)',
                    background: 'rgba(255,255,255,0.85)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    marginBottom: 10,
                    userSelect: 'none',
                  }}
                  onPointerEnter={(e) => {
                    const el = e.currentTarget as HTMLDivElement;
                    el.style.background = 'rgba(0,114,49,0.08)';
                    el.style.boxShadow = 'inset 0 -3px 0 0 rgba(0,114,49,0.65)';
                  }}
                  onPointerLeave={(e) => {
                    const el = e.currentTarget as HTMLDivElement;
                    el.style.background = 'rgba(255,255,255,0.85)';
                    el.style.boxShadow = 'none';
                  }}
                >
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 999,
                      background: BUREAU_GREEN,
                      border: '1px solid rgba(0,0,0,0.10)',
                      flex: '0 0 auto',
                    }}
                  />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 650,
                        letterSpacing: -0.2,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {(p.data as any).title ?? 'Untitled project'}
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>
                      {(p.data as any).studio ?? 'Studio'}
                      {String((p.data as any).client ?? '').trim() ? ` · ${(p.data as any).client}` : ''}
                    </div>
                  </div>
                </div>
              ))
          )}
        </div>
      </div>

      {/* Roster column */}
      <div style={{ minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.2, textTransform: 'uppercase', opacity: 0.75 }}>
              Resources
            </div>
            <CountBadge n={masterResources.length} />
          </div>

          <button
            onClick={addMasterResource}
            disabled={!!managerResourceCardId}
            style={{
              ...pillBtn,
              borderColor: 'rgba(0,114,49,0.85)',
              color: 'rgba(0,114,49,0.85)',
              background: 'white',
              padding: '7px 10px',
              opacity: managerResourceCardId ? 0.35 : 1,
              pointerEvents: managerResourceCardId ? 'none' : 'auto',
            }}
            onPointerEnter={(e) => {
              if (managerResourceCardId) return;
              const el = e.currentTarget as HTMLButtonElement;
              el.style.background = '#007231';
              el.style.color = 'white';
              el.style.borderColor = '#007231';
            }}
            onPointerLeave={(e) => {
              if (managerResourceCardId) return;
              const el = e.currentTarget as HTMLButtonElement;
              el.style.background = 'white';
              el.style.color = 'rgba(0,114,49,0.85)';
              el.style.borderColor = 'rgba(0,114,49,0.85)';
            }}
          >
            + resource
          </button>
        </div>

        <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
          {/* Expanded card overlay (obscures list) */}
          {managerResourceCardId ? (() => {
            const r = masterResources.find((x) => x.id === managerResourceCardId) ?? null;
            if (!r) return null;

            const orgActiveProjects = nodes.filter((n) => n.data.kind === 'project').length;
            // System compute: active assignments = aliases for this master resource that are connected to a project via assignment edge.
            const aliasIdsForResource = nodes
              .filter((n) => n.data.kind === 'alias' && (n.data as any).masterResourceId === r.id)
              .map((n) => n.id);

            const activeAliasIds = new Set(
              edges
                .filter((e) => (e.data as any)?.edgeType === 'assignment')
                .filter((e) => aliasIdsForResource.includes(e.source) && getNodeKindById(nodes, e.target) === 'project')
                .map((e) => e.source)
            );

            const activeAssignments = activeAliasIds.size;

            // MVP placeholder for history until we add completion tracking.
            const completedProjects = 0;
            const capLabel = activeAssignments > 0 ? 'In Motion' : 'Available';

            const endingW = weeksUntil(r.contractEndISO);

            const labelStyle: React.CSSProperties = {
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              fontWeight: 400,
              letterSpacing: 0.8,
              textTransform: 'uppercase',
              opacity: 0.72,
              whiteSpace: 'nowrap',
            };

            const valueStyle: React.CSSProperties = {
              fontSize: 16,
              fontWeight: 400,
              letterSpacing: -0.2,
            };

            const rowStyle: React.CSSProperties = {
              display: 'grid',
              gridTemplateColumns: '170px 1fr',
              alignItems: 'baseline',
              gap: 18,
              marginTop: 5,
            };

            return (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  padding: 18,
                  overflowY: 'auto',
                }}
              >
                <div
                  style={card({
                    minHeight: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    background: '#fbfbfc',
                    border: `1px solid ${BUREAU_GREEN}`,
                    boxShadow: '0 8px 20px rgba(0,0,0,0.06), 0 0 0 2px rgba(0,114,49,0.06)',
                    padding: 18,
                  })}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      {/* Card title uses the resource name (no redundant "Resource" label) */}
                      <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: -0.4, lineHeight: 1.08 }}>
                        {r.title}
                      </div>
                    </div>

                    <button
                      onClick={() => { setManagerResourceCardId(null); selectMasterResource(null); }}
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 999,
                        border: '1px solid rgba(0,0,0,0.10)',
                        background: 'rgba(255,255,255,0.85)',
                        cursor: 'pointer',
                        fontSize: 16,
                        lineHeight: 1,
                      }}
                      aria-label="Close"
                    >
                      ×
                    </button>
                  </div>

                  <div style={{ height: 18 }} />

                  <div style={{ maxWidth: 560, marginLeft: 40 }}>

                    <div style={rowStyle}>
                      <div style={labelStyle}>Entity</div>
                      <div style={valueStyle}>{r.entity}</div>
                    </div>

                    <div style={rowStyle}>
                      <div style={labelStyle}>Dept</div>
                      <div style={{ ...valueStyle, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span
                          style={{
                            width: 12,
                            height: 12,
                            borderRadius: 999,
                            background: r.color,
                            border: '1px solid rgba(0,0,0,0.08)',
                            boxShadow: '0 6px 18px rgba(0,0,0,0.08)',
                          }}
                        />
                        <span>{deptLabel(r.dept)}</span>
                      </div>
                    </div>

                    <div style={rowStyle}>
                      <div style={labelStyle}>Comp model</div>
                      <div style={valueStyle}>{r.compModel}</div>
                    </div>

                    <div style={rowStyle}>
                      <div style={labelStyle}>Contract period</div>
                      <div style={valueStyle}>
                        {isoToDMY(r.contractStartISO)} → {isoToDMY(r.contractEndISO)}
                      </div>
                    </div>{r.compModel !== 'External' && (


                    <div style={rowStyle}>
                      <div style={labelStyle}>Ending in</div>
                      <div style={{ ...valueStyle, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <CountBadge n={Math.max(0, endingW)} />
                        <span style={{ fontSize: 14, fontWeight: 400, opacity: 0.9 }}>weeks</span>
                      </div>
                    </div>

)}
                    <div style={rowStyle}>
                      <div style={labelStyle}>Salary annual</div>
                      <div style={valueStyle}>€{Number(r.salaryAnnual ?? 0).toLocaleString()}</div>
                    </div>

                    <div style={rowStyle}>
                      <div style={labelStyle}>Bill rate</div>
                      <div style={valueStyle}>
                        {r.billRatePerHour ? `€${Number(r.billRatePerHour).toLocaleString()} p/h` : '—'}
                      </div>
                    </div>

                    <div style={rowStyle}>
                      <div style={labelStyle}>Completed</div>
                      <div style={{ ...valueStyle, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <CountBadge n={completedProjects} />
                        <span style={{ fontSize: 14, fontWeight: 400, opacity: 0.9 }}>projects</span>
                      </div>
                    </div>

                    {/* Divider between history and capacity section */}
                    <div style={{ marginTop: 16, borderTop: '1px solid rgba(0,0,0,0.10)' }} />

                    <div style={{ height: 26 }} />

                    <div style={rowStyle}>
                      <div style={labelStyle}>Capacity</div>
                      <div style={valueStyle}>{capLabel}</div>
                    </div>

                    <div style={{ marginTop: 16, fontSize: 14, opacity: 0.85, lineHeight: 1.25 }}>
                      Active assignments <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginLeft: 6 }}><CountBadge n={activeAssignments} /></span>
                      <br />
                      Active org projects <span style={{ fontWeight: 400 }}>{orgActiveProjects}</span>
                    </div>
                  </div>

                  <div style={{ flex: 1 }} />

                  {/* Terminate (delete) master resource */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12 }}>
                    <button
                      onClick={() => {
                        deleteMasterResource(r.id);
                        setManagerResourceCardId(null);
                        selectMasterResource(null);
                      }}
                      style={{
                        ...pillBtn,
                        borderColor: 'rgba(180,40,40,0.85)',
                        color: 'rgba(180,40,40,0.90)',
                        background: 'white',
                        padding: '7px 10px',
                      }}
                      onPointerEnter={(e) => {
                        const el = e.currentTarget as HTMLButtonElement;
                        el.style.background = 'rgba(180,40,40,1)';
                        el.style.color = 'white';
                        el.style.borderColor = 'rgba(180,40,40,1)';
                      }}
                      onPointerLeave={(e) => {
                        const el = e.currentTarget as HTMLButtonElement;
                        el.style.background = 'white';
                        el.style.color = 'rgba(180,40,40,0.90)';
                        el.style.borderColor = 'rgba(180,40,40,0.85)';
                      }}
                    >
                      - terminate
                    </button>

                    <button
                      onClick={() => spawnAliasAndFocus(r.id)}
                      style={{
                        ...pillBtn,
                        borderColor: 'rgba(0,114,49,0.85)',
                        color: 'rgba(0,114,49,0.85)',
                        background: 'white',
                        padding: '7px 10px',
                      }}
                      onPointerEnter={(e) => {
                        const el = e.currentTarget as HTMLButtonElement;
                        el.style.background = '#007231';
                        el.style.color = 'white';
                        el.style.borderColor = '#007231';
                      }}
                      onPointerLeave={(e) => {
                        const el = e.currentTarget as HTMLButtonElement;
                        el.style.background = 'white';
                        el.style.color = 'rgba(0,114,49,0.85)';
                        el.style.borderColor = 'rgba(0,114,49,0.85)';
                      }}
                    >
                      + assign
                    </button>
                  </div>

                </div>
              </div>
            );
          })() : (
            <div style={{ height: '100%', overflowY: 'auto', padding: '0 10px 10px 10px' }}>
              {masterResources.length === 0 ? (
                <div style={{ padding: 12, fontSize: 12, opacity: 0.55 }}>
                  No resources yet. Create your first master resource.
                </div>
              ) : (
                masterResources.map((r) => {
                  return (
                  <div
                    key={r.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      selectMasterResource(r.id);
                      setManagerResourceCardId(r.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        selectMasterResource(r.id);
                        setManagerResourceCardId(r.id);
                      }
                    }}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "12px 12px",
                      borderRadius: 14,
                      border: "1px solid rgba(0,0,0,0.08)",
                      background: "rgba(255,255,255,0.85)",
                      boxShadow: "none",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      marginBottom: 10,
                      userSelect: "none",
                    }}
                    onPointerEnter={(e) => {
                      const el = e.currentTarget as HTMLDivElement;
                      el.style.background = "rgba(0,114,49,0.08)";
                      el.style.boxShadow = "inset 0 -3px 0 0 rgba(0,114,49,0.65)";
                    }}
                    onPointerLeave={(e) => {
                      const el = e.currentTarget as HTMLDivElement;
                      el.style.background = "rgba(255,255,255,0.85)";
                      el.style.boxShadow = "none";
                    }}
                  >
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 999,
                        background: r.color,
                        border: "1px solid rgba(0,0,0,0.10)",
                        flex: "0 0 auto",
                      }}
                    />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 650, letterSpacing: -0.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {r.title}
                      </div>
                      <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>
                        {deptLabel(r.dept)}
                      </div>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        // Spawn an alias on the canvas, then switch to Workflow to complete assignment wiring.
                        spawnAliasAndFocus(r.id);
                      }}
                      style={{
                        ...pillBtn,
                        marginLeft: 'auto',
                        padding: "7px 10px",
                        background: "white",
                        borderColor: "rgba(0,0,0,0.12)",
                        color: "rgba(0,0,0,0.72)",
                      }}
                      onPointerEnter={(e) => {
                        const el = e.currentTarget as HTMLButtonElement;
                        el.style.background = "rgba(0,0,0,0.06)";
                      }}
                      onPointerLeave={(e) => {
                        const el = e.currentTarget as HTMLButtonElement;
                        el.style.background = "white";
                      }}
                    >
                      assign
                    </button>
                  </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  </div>
)}

<div
  id="flow-shell"
  ref={flowShellRef}
  onWheelCapture={(e) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;

    // don't hijack wheel over UI controls
    const inUi = !!target.closest(
      [
        'input',
        'textarea',
        'select',
        'option',
        'button',
        '[role="listbox"]',
        '[role="option"]',
        '[data-radix-popper-content-wrapper]',
        '[data-radix-select-content]',
        '.inspectorBody',
      ].join(',')
    );
    if (inUi) return;

    // pinch zoom (trackpad) uses ctrlKey — let ReactFlow handle it
    if (e.ctrlKey) return;

    // block horizontal swipe/nav
    if (e.deltaX !== 0 || e.shiftKey) {
      e.preventDefault();
      return;
    }

    // wheel zoom for mouse / magic mouse
    if (e.deltaY !== 0) {
      e.preventDefault();

      const rf = rfRef.current;
      if (!rf) return;

      // smooth-ish step, but instant
      const step = 0.08;
      const nextZoom = e.deltaY > 0 ? rf.getZoom() - step : rf.getZoom() + step;

      rf.setViewport(
        { x: rf.getViewport().x, y: rf.getViewport().y, zoom: nextZoom },
        { duration: 0 }
      );
    }
  }}
  style={{ width: '100vw', height: '100vh', overflow: 'hidden', overscrollBehavior: 'none', opacity: isManager ? 0.22 : 1, pointerEvents: isManager ? 'none' : 'auto', transition: 'opacity 180ms ease' }}
>
<ReactFlowProvider>
  <ReactFlow
  onInit={(inst) => {
    rfRef.current = inst;
  }}
  nodes={displayNodes}
  edges={displayEdges}
  nodeTypes={nodeTypes}
  onConnect={onConnect}
  onNodesChange={onNodesChange}
  onEdgesChange={onEdgesChange}
  onNodeClick={(_, node) => {
    selectEdge(null);
    selectNode(node.id);
  }}
  onEdgeClick={(_, edge) => {
    selectNode(null);
    selectEdge(edge.id);
  }}
  onPaneClick={() => {
    selectNode(null);
    selectEdge(null);
  }}
  onEdgeUpdateStart={handleEdgeUpdateStart}
  onEdgeUpdate={handleEdgeUpdate}
  onEdgeUpdateEnd={handleEdgeUpdateEnd}
  edgeUpdaterRadius={18}
  panOnDrag={true}
  panOnScroll={true}         // ✅ CHANGED: allow trackpad scroll to pan
  zoomOnScroll={false}       // ✅ keep off (we handle mouse wheel zoom)
  zoomOnPinch={true}
  zoomOnDoubleClick={false}
  preventScrolling={true}
  isValidConnection={() => true}
  defaultViewport={{ x: 0, y: 0, zoom: 0.75 }}
  minZoom={0.05}
  maxZoom={2.5}
  defaultEdgeOptions={{
    type: edgeMode === 'radius' ? 'smoothstep' : 'default',
    ...(edgeMode === 'radius' ? ({ pathOptions: { borderRadius: edgeCornerRadius } } as any) : {}),
    style: { strokeWidth: 2 },
    markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12 },
  }}
  connectionLineType={edgeMode === 'radius' ? ConnectionLineType.SmoothStep : ConnectionLineType.Bezier}
>
  <MiniMap />
  <Controls />
  <Background />
</ReactFlow>
</ReactFlowProvider>
</div>
</div>
)}
</div>
);
}
