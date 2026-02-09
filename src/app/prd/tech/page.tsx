'use client';

const BUREAU_GREEN = '#007231';

function Subnav({ active }: { active: 'investor' | 'tech' }) {
  const Item = ({
    href,
    label,
    isActive,
  }: {
    href: string;
    label: string;
    isActive: boolean;
  }) => (
    <a
      href={href}
      className="rounded-full px-3 py-1 text-[12px] transition select-none"
      style={{
        border: '1px solid rgba(0,0,0,0.10)',
        background: isActive ? 'rgba(0,114,49,0.08)' : 'transparent',
        color: isActive ? 'rgba(0,114,49,0.90)' : 'rgba(0,0,0,0.65)',
      }}
      aria-current={isActive ? 'page' : undefined}
    >
      {label}
    </a>
  );

  return (
    <div className="mt-8 flex flex-wrap gap-2">
      <Item href="/prd" label="Investor" isActive={active === 'investor'} />
      <Item href="/prd/tech" label="Tech Stack" isActive={active === 'tech'} />
      {/* Future: <Item href="/prd/flows" label="User flows" isActive={active === 'flows'} /> */}
    </div>
  );
}

export default function TechStackPRDPage() {
  return (
    <main className="h-screen overflow-y-auto bg-white text-black" style={{ WebkitOverflowScrolling: 'touch' }}>
      <div className="mx-auto max-w-2xl px-6 py-24">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="text-lg font-semibold tracking-tight">The Bureau •</div>

            <span
              className="rounded-full border px-2 py-1 text-[11px] font-medium uppercase tracking-wide"
              style={{
                borderColor: 'rgba(0,114,49,0.25)',
                color: 'rgba(0,114,49,0.85)',
              }}
            >
              prd
            </span>
          </div>

          <div className="text-sm">
            <a
              href="/"
              className="opacity-60 hover:opacity-100 transition select-none"
              style={{ color: BUREAU_GREEN }}
              aria-label="Back to PRD"
              title="PRD"
            >
              Request Access →
            </a>
          </div>
        </div>

        {/* Subnav */}
        <Subnav active="tech" />

        {/* Title */}
        <h1 className="mt-14 text-4xl font-medium leading-tight tracking-tight">Tech Stack.</h1>

        <div className="mt-6 space-y-3">
          <p className="text-lg leading-relaxed opacity-80">People. Projects. Budgets. Time — Connected.</p></div>


        <p className="mt-4 text-base leading-relaxed opacity-75">
          Built for interactive graph editing, deterministic computation, and a clean path from private beta to paid pilots.
        </p>

        {/* Sections */}
        <section className="mt-10">
          <div className="text-xs uppercase tracking-wide opacity-50">Client</div>
          <div className="mt-4 rounded-2xl border border-black/10 p-4">
            <div className="space-y-2 text-sm opacity-80">
              <div><span className="font-bold">Next.js + React</span> for routing, server capabilities, and deployment maturity.</div>
              <div><span className="font-bold">React Flow</span> for graph editing primitives and custom node UIs.</div>
              <div><span className="font-bold">TypeScript</span> for typed domain objects, calculations, and migrations.</div>
              <div><span className="font-bold">HUD UI</span>  rendered as fixed panels to remain stable at any zoom level.</div>
            </div>
          </div>
        </section>

        <section className="mt-10">
          <div className="text-xs uppercase tracking-wide opacity-50">Server and data</div>
          <div className="mt-4 rounded-2xl border border-black/10 p-4">
            <div className="space-y-2 text-sm opacity-80">
              The Bureau uses Supabase as the core backend: Postgres for persistence, Auth for identity, Storage for files, and Row Level Security to keep each workspace private by default. The graph is stored as a versioned schema (nodes, edges, registries, saved graphs) so every map remains deterministic, migratable, and audit-ready as the product hardens.

            </div>
          </div>
        </section>

        <section className="mt-10">
          <div className="text-xs uppercase tracking-wide opacity-50">Authentication and onboarding</div>
          <div className="mt-4 rounded-2xl border border-black/10 p-4">
            <div className="space-y-2 text-sm opacity-80">
            Identity is handled through Supabase Auth (email + password or magic link), with email verification enforced for production accounts. The public “Request access” flow remains separate from product access, allowing controlled rollout and staged onboarding. As we move into pilots, we can introduce roles and workspace membership (owner / admin / contributor) using Supabase policies without rewriting the app.

            </div>
          </div>
        </section>

        <section className="mt-10">
          <div className="text-xs uppercase tracking-wide opacity-50">Security baseline</div>
          <div className="mt-4 rounded-2xl border border-black/10 p-4">
            <div className="space-y-2 text-sm opacity-80"> 
                Supabase Row Level Security for per-user / per-workspace data isolation.
                Server-side validation for graph writes (prevent malformed or hostile payloads).
                Minimal audit fields on all core entities (createdBy, updatedBy, timestamps).
                Rate limiting and abuse protection on public endpoints.

            </div>
          </div>
        </section>

          <section className="mt-10">
          <div className="text-xs uppercase tracking-wide opacity-50">Third-party product shell</div>
          <div className="mt-4 rounded-2xl border border-black/10 p-4">
            <div className="space-y-2 text-sm opacity-80">
            <div><span className="font-bold">Email deliverability</span></div>
            Resend (preferred for clean DX + reliable transactional delivery).
            Used for: verification emails, access approvals, product notifications.
            <p></p>
            <div><span className="font-bold">Runtime monitoring + error tracking</span></div>
            Sentry for exception tracking, performance traces, and release health.
            Used for: catching issues before users report them, diagnosing graph edge cases.
            <p></p>
            <div><span className="font-bold">Product analytics</span></div>
            Posthog for analytics.
            Used for: activation funnels (first map created), retention, feature adoption, staged rollouts.
            <p></p>
           <div><span className="font-bold">Payments</span></div>
            Stripe for subscriptions, seat-based pricing, invoicing, and tax-ready receipts.
            Used for: leadership seats, contributor tier, annual upgrades.
            <p></p>
            <div><span className="font-bold">File/asset storage</span></div>
            Supabase Storage for user-provided attachments and exports; optional Cloudflare R2 later if storage economics demand it.
            Used for: exports, snapshots, attachments, branded PDFs.
            <p></p>
            <div><span className="font-bold">Deployment</span></div>
            Vercel for web deployment, preview environments, and fast iteration.
            Used for: shipping weekly, clean staging, predictable rollback.
            <p></p>
            </div>
          </div>
        </section>

         <section className="mt-10">
          <div className="text-xs uppercase tracking-wide opacity-50">Computation model</div>
          <div className="mt-4 rounded-2xl border border-black/10 p-4">
            <div className="space-y-2 text-sm opacity-80">
              <div><span className="font-bold">Deterministic rollups</span> computed from graph state with stable rules.</div>
              <div><span className="font-bold">Incremental recalculation</span> to avoid blocking interaction (memoized selectors).</div>
             
            </div>
          </div>
        </section>

        <section className="mt-10">
          <div className="text-xs uppercase tracking-wide opacity-50">Performance targets</div>
          <div className="mt-4 rounded-2xl border border-black/10 p-4">
            <div className="space-y-2 text-sm opacity-80">
              <div>Smooth interaction at real studio scale (target: ~200 nodes).</div>
              <div>UI never waits on totals: compute stays off the critical interaction path.</div>
              <div>HUD panels remain stable regardless of zoom and canvas density.</div>
            </div>
          </div>
        </section>

        <section className="mt-10">
          <div className="text-xs uppercase tracking-wide opacity-50">AI</div>
          <div className="mt-4 rounded-2xl border border-black/10 p-4">
            <div className="space-y-2 text-sm opacity-80">              
              <div><span className="font-bold">Under-the-hood tasks:</span> normalize inputs, detect inconsistencies, summarize diffs, propose structure, render custom derived views.</div>
              <div className="opacity-70">Any graph changes suggested by AI require explicit confirmation.</div>
            </div>
          </div>
        </section>

        <section className="mt-10">
          <div className="text-xs uppercase tracking-wide opacity-50">Technical hardening</div>
          <div className="mt-4 rounded-2xl border border-black/10 p-4">
            <div className="space-y-2 text-sm opacity-80">
              <div><span className="font-bold">Workspace model:</span> team membership + roles enforced through Supabase RLS policies.</div>
              <div><span className="font-bold">Scenario snapshots:</span> named graph versions, diffing, restore points.</div>
              <div><span className="font-bold">Derived views layer:</span> Resource Load, Work Session Time Allocation, Best Team Suggestions reading from the same truth model.</div>
              <div><span className="font-bold">Multi-user collaboration:</span> roles/permissions, merge-safe updates.</div>
              <div><span className="font-bold">Billing:</span> Stripe subscriptions + seat management once pilots confirm packaging.</div>
              <div><span className="font-bold">Observability:</span> Sentry + structured event logs for audit-grade traceability.</div>
              <div><span className="font-bold">Optional integrations:</span> Python (resource/status/calendar/time/accounting muti-format exports) as downloads and feeds, which are never required for the core map or system function.</div>
            </div>
          </div>
        </section>

        <div className="mt-16 text-xs opacity-50">© {new Date().getFullYear()} The Bureau</div>
      </div>
    </main>
  );
}