'use client';

import { useMemo } from 'react';

type TimelineItem = {
  id: string;
  title: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
};

function toDate(d: string) {
  const x = new Date(d);
  return Number.isNaN(x.getTime()) ? null : x;
}

function daysBetween(a: Date, b: Date) {
  const ms = b.getTime() - a.getTime();
  return Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)));
}

function assignLanes(items: { start: Date; end: Date; item: TimelineItem }[]) {
  const lanes: { end: Date }[] = [];
  const placed: { lane: number; item: TimelineItem; start: Date; end: Date }[] = [];

  for (const x of items) {
    let laneIndex = -1;
    for (let i = 0; i < lanes.length; i++) {
      if (x.start.getTime() > lanes[i].end.getTime()) {
        laneIndex = i;
        break;
      }
    }
    if (laneIndex === -1) {
      laneIndex = lanes.length;
      lanes.push({ end: x.end });
    } else {
      lanes[laneIndex].end = x.end;
    }
    placed.push({ lane: laneIndex, item: x.item, start: x.start, end: x.end });
  }

  return { lanesCount: lanes.length, placed };
}

export default function MasterTimeline({ items }: { items: TimelineItem[] }) {
  const parsed = useMemo(() => {
    const clean = items
      .map((i) => {
        const s = toDate(i.startDate);
        const e = toDate(i.endDate);
        if (!s || !e) return null;
        const start = s;
        const end = e.getTime() >= s.getTime() ? e : s;
        return { start, end, item: i };
      })
      .filter(Boolean) as { start: Date; end: Date; item: TimelineItem }[];

    clean.sort((a, b) => a.start.getTime() - b.start.getTime());

    if (clean.length === 0) return null;

    const minStart = clean.reduce((m, x) => (x.start.getTime() < m.getTime() ? x.start : m), clean[0].start);
    const maxEnd = clean.reduce((m, x) => (x.end.getTime() > m.getTime() ? x.end : m), clean[0].end);

    const spanDays = Math.max(1, daysBetween(minStart, maxEnd) + 1);
    const { lanesCount, placed } = assignLanes(clean);

    return { minStart, maxEnd, spanDays, lanesCount, placed };
  }, [items]);

  if (!parsed) {
    return (
      <div style={shell()}>
        <div style={title()}>Master Timeline</div>
        <div style={subtle()}>No timeline nodes found. Connect a Timeline node to a Project and set dates.</div>
      </div>
    );
  }

  const { minStart, maxEnd, spanDays, lanesCount, placed } = parsed;

  return (
    <div style={shell()}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16 }}>
        <div>
          <div style={title()}>Master Timeline</div>
          <div style={subtle()}>
            {minStart.toISOString().slice(0, 10)} → {maxEnd.toISOString().slice(0, 10)} • {placed.length} project(s)
          </div>
        </div>
        <div style={{ ...pill(), opacity: 0.8 }}>Lanes: {lanesCount}</div>
      </div>

      <div
        style={{
          marginTop: 14,
          borderRadius: 14,
          border: '1px solid rgba(0,0,0,0.08)',
          background: 'rgba(0,0,0,0.02)',
          padding: 14,
        }}
      >
        <div style={{ position: 'relative', height: Math.max(220, lanesCount * 52) }}>
          <div style={{ position: 'absolute', left: 0, right: 0, top: 12, height: 1, background: 'rgba(0,0,0,0.12)' }} />

          {placed.map((p) => {
            const offset = daysBetween(minStart, p.start) / spanDays;
            const width = (daysBetween(p.start, p.end) + 1) / spanDays;

            return (
              <div
                key={p.item.id}
                style={{
                  position: 'absolute',
                  left: `${Math.round(offset * 10000) / 100}%`,
                  width: `${Math.max(1.5, Math.round(width * 10000) / 100)}%`,
                  top: 28 + p.lane * 52,
                  height: 38,
                  borderRadius: 12,
                  border: '1px solid rgba(0,0,0,0.10)',
                  background: 'white',
                  boxShadow: '0 6px 16px rgba(0,0,0,0.06)',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0 12px',
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                }}
                title={`${p.item.title}\n${p.item.startDate} → ${p.item.endDate}`}
              >
                <span style={{ fontWeight: 650, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {p.item.title}
                </span>
                <span style={{ marginLeft: 'auto', fontSize: 12, opacity: 0.6 }}>
                  {p.item.startDate} → {p.item.endDate}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ marginTop: 12, ...subtle() }}>
        Tip: MVP timeline view. Next we’ll add filters + click-to-jump back to nodes.
      </div>
    </div>
  );
}

function shell(): React.CSSProperties {
  return {
    position: 'absolute',
    inset: 12,
    borderRadius: 18,
    background: 'rgba(255,255,255,0.92)',
    border: '1px solid rgba(0,0,0,0.08)',
    boxShadow: '0 18px 40px rgba(0,0,0,0.08)',
    padding: 16,
    overflow: 'auto',
  };
}

function title(): React.CSSProperties {
  return { fontWeight: 700, fontSize: 16, letterSpacing: -0.2 };
}

function subtle(): React.CSSProperties {
  return { fontSize: 12, opacity: 0.65, lineHeight: 1.4 };
}

function pill(): React.CSSProperties {
  return {
    fontSize: 12,
    padding: '6px 10px',
    borderRadius: 999,
    border: '1px solid rgba(0,0,0,0.10)',
    background: 'rgba(0,0,0,0.02)',
    fontWeight: 600,
  };
}