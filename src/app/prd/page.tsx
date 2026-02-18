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

export default function InvestorOnePager() {
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
              aria-label="Home"
              title="Return to home"
            >
              Request access →
            </a>
          </div>
        </div>

        {/* Subnav */}
        <Subnav active="investor" />

        {/* Hero */}
        <h1 className="mt-14 text-4xl font-medium leading-tight tracking-tight">Product Requirements Document.</h1>

        <div className="mt-6 space-y-3">
          <p className="text-lg leading-relaxed opacity-80">People. Projects. Budgets. Time — Connected.</p>

          <p className="text-base leading-relaxed opacity-80">
            The Bureau is a visual operating layer for creative and technology studios. It connects resourcing, timelines, and commercial reality
            into one living map so leaders can make critical decisions without app switching or hunting for data.
          </p>

          <p className="text-sm leading-relaxed opacity-70">
            Not task tracking. Not Accounting. Instead, a real-time, high-level view of critical studio ops - in live convesation with project organisms. 
            It surfaces risk and opportunity, and forces clarity on tradeoffs. 
          </p>

          <p className="text-sm leading-relaxed opacity-70">
            The Bureau sees in months, quaters, years - not days. 
          </p>
        </div>

        {/* The Problem */}
        <section className="mt-12">
          <div className="text-xs uppercase tracking-wide opacity-50">The problem</div>

          <div className="mt-4 rounded-2xl border border-black/10 p-4">
            <div className="space-y-2 text-sm opacity-80">
              <div>Studio operations live in fragments: Bloated PM tools (granular task managers), permissioned finance tools (sensitive accounting), mind-numbing spreadsheets (poor UX), and complex studio databases (noisy).</div>
              <div>Decisions slow down. Constraints are misinterpreted. Overload warning arrives too late. Margin becomes guesswork. 
                Critical reporting must be reconstructed from fragmented data across a suite of laborious operational apps and software. </div>
                <div> Underneath it all sits a growing tax: stacked monthly subscriptions that quietly compound into overhead.
                This pricing model is out of step with how modern studio teams actually build and run.</div>
            </div>
          </div>
        </section>

        {/* The Solution */}
        <section className="mt-12">
          <div className="text-xs uppercase tracking-wide opacity-50">The solution</div>

          <div className="mt-4 rounded-2xl border border-black/10 p-4">
            <div className="space-y-2 text-sm opacity-80">
              <div>
                A flexible canvas, and node-based operating map - where instances of resources, projects, budgets, and timelines are visually wired together.
                Prototype mutiple scenarios across the financial year by simply moving and connecting objects on a familiar canvas while the derived forecast views update in real-time.
              </div>
              
            </div>
          </div>
        </section>

        <section className="mt-12">
  <div className="text-xs uppercase tracking-wide opacity-50">System flow</div>

  <div className="mt-4 rounded-2xl border border-black/10 p-4 overflow-visible">
    <div className="w-full overflow-visible min-h-0">
      <svg
        viewBox="0 0 960 520"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="Truth Model to Derived Views to Integrations"
        className="block w-full h-auto overflow-visible"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Light bureau-green strokes */}
        {/* No outer frame, no title, minimal effects */}
        <defs />

        {/* Card 1 */}
        <rect x="64" y="44" rx="18" ry="18" width="832" height="110" fill="#FFFFFF" stroke="rgba(0,114,49,0.22)" />
        <text
          x="96"
          y="86"
          fontFamily="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial"
          fontSize="18"
          fill="rgba(0,0,0,0.86)"
          fontWeight="600"
        >
          Truth Model
        </text>
        <text
          x="96"
          y="112"
          fontFamily="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial"
          fontSize="15"
          fill="rgba(0,0,0,0.70)"
        >
          Canonical graph state
        </text>
        <text
          x="96"
          y="136"
          fontFamily="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial"
          fontSize="15"
          fill="rgba(0,0,0,0.70)"
        >
          Versioned • Typed • Deterministic
        </text>

        <text
          x="548"
          y="112"
          fontFamily="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial"
          fontSize="13"
          fill="rgba(0,0,0,0.55)"
          letterSpacing="0.08em"
        >
          ENTITIES
        </text>
        <text
          x="548"
          y="136"
          fontFamily="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial"
          fontSize="15"
          fill="rgba(0,0,0,0.70)"
        >
          Resources • Projects • Budgets • Timelines
        </text>

        {/* Arrow 1 */}
        <path d="M480 170V206" stroke="rgba(0,114,49,0.28)" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M480 206L470 192" stroke="rgba(0,114,49,0.28)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M480 206L490 192" stroke="rgba(0,114,49,0.28)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

        {/* Card 2 */}
        <rect x="64" y="222" rx="18" ry="18" width="832" height="128" fill="#FFFFFF" stroke="rgba(0,114,49,0.22)" />
        <text
          x="96"
          y="266"
          fontFamily="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial"
          fontSize="18"
          fill="rgba(0,0,0,0.86)"
          fontWeight="600"
        >
          Derived Views
        </text>
        <text
          x="96"
          y="292"
          fontFamily="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial"
          fontSize="15"
          fill="rgba(0,0,0,0.70)"
        >
          Projections
        </text>
        <text
          x="96"
          y="316"
          fontFamily="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial"
          fontSize="15"
          fill="rgba(0,0,0,0.70)"
        >
          Resource Load • Ledger • Best Team
        </text>

        <text
          x="548"
          y="292"
          fontFamily="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial"
          fontSize="13"
          fill="rgba(0,0,0,0.55)"
          letterSpacing="0.08em"
        >
          OUTPUTS
        </text>
        <text
          x="548"
          y="316"
          fontFamily="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial"
          fontSize="15"
          fill="rgba(0,0,0,0.70)"
        >
          Risk • Capacity • Margin signals
        </text>

        {/* Arrow 2 */}
        <path d="M480 368V388" stroke="rgba(0,114,49,0.28)" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M480 388L470 374" stroke="rgba(0,114,49,0.28)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M480 388L490 374" stroke="rgba(0,114,49,0.28)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

        {/* Card 3 */}
        <rect x="64" y="402" rx="18" ry="18" width="832" height="54" fill="#FFFFFF" stroke="rgba(0,114,49,0.22)" />
        <text
          x="96"
          y="437"
          fontFamily="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial"
          fontSize="16"
          fill="rgba(0,0,0,0.86)"
          fontWeight="600"
        >
          Integrations
        </text>
        <text
          x="260"
          y="437"
          fontFamily="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial"
          fontSize="15"
          fill="rgba(0,0,0,0.70)"
        >
          Optional inputs + exports. Never canonical.
        </text>

        
      </svg>
    </div>
  </div>
</section>

        {/* Strategic Audit */}
        <section className="mt-12">
          <div className="text-xs uppercase tracking-wide opacity-50">Strategic Audit</div>

          <div className="mt-4 rounded-2xl border border-black/10 p-4">
            <div className="space-y-2 text-sm opacity-80">
              <div>
                The Bureau isn’t trying to out-feature existing productivity tools like Asana, Monday, Linear, Notion, Jira, Float, or Celoxis - it’s solving a different problem. 
                Those platforms are powerful ops + analytic systems, but they get that power from a structure riddled with dependencies: 
                daily assigned tasks, fields + statuses, permissions, due dates, and general ongoing Project Manager maintenance. 
                </div>
                 <div>
                The Bureau is an operating map, not a work tracker: It's a lightweight canvas where the core realities of running a studio: people, projects, budgets, debits, and time - can be arranged, connected, and reshaped in minutes to test out a plan. </div>
                <div>The point is immediacy and legibility: Founders, Directors, and Executives can open the canvas, intuitively prototype a new project mix or resourcing change, and see the implications without breaking task workflows inside existing core logistics tools, or translating their mental business model into someone else’s taxonomy.
              </div>
              
            </div>
          </div>
        </section>

        {/* Why Now */}
        <section className="mt-12">
          <div className="text-xs uppercase tracking-wide opacity-50">Why now</div>

          <div className="mt-4 rounded-2xl border border-black/10 p-4">
            <div className="space-y-2 text-sm opacity-80">
              <div>Studios are smaller, faster, globally distributed, and run closer to the edge. Capacity errors compound into delivery risk and margin loss. 
                The tolerance for error and misallocation is collapsing quickly.</div>
              
            </div>
          </div>
        </section>

          {/* Moat */}
        <section className="mt-12">
          <div className="text-xs uppercase tracking-wide opacity-50">Moat</div>

          <div className="mt-4 rounded-2xl border border-black/10 p-4">
            <div className="space-y-2 text-sm opacity-80">
              <div>
                The graph becomes the studio’s proprietary living operating model: customised node inputs connected to project organisms, surfaced constraints, decision path comparisions, and historical
                achival-grade context. Over time, this enables derived views, and restrained AI reporting, without losing the underlying map of prototypes.
              </div>
              
            </div>
          </div>
        </section>

                  {/* Use Case 1 */}
        <section className="mt-12">
          <div className="text-xs uppercase tracking-wide opacity-50">Case Record Excerpt</div>

          <div className="mt-4 rounded-2xl border border-black/10 p-4">
            <div className="space-y-2 text-sm opacity-80">
              <div>
                When a project needs outside help, one question might be: what external figure can this budget actually accommodate without impacting our financial goals down the line? 
                The Bureau turns that into a fast, controlled check.</div>
                <div>
                The product answers immediately, translating the plan into a clear affordability number: what you can pay, for how long, and what it does to totals. 
                Iterate scenarios in seconds until the desired budget narrative holds, rather than risking vendor rate cards dictating a dangerous reality.
                The output is a simple answer with a defensible rationale: yes, we can afford this, not at that rate, or only if we change X. </div>
                <div>This turns contractor hiring from an anxious judgement call into an auditable, repeatable workflow. Prototype the hire, test the impact, commit with authority.

              </div>
              
            </div>
          </div>
        </section>

        {/* Pricing Model */}
        <section className="mt-12">
          <div className="text-xs uppercase tracking-wide opacity-50">Pricing model + releases</div>

          <div className="mt-4 rounded-2xl border border-black/10 p-4">
            <div className="space-y-2 text-sm opacity-80">
              <div>
                Perpetual workspace access pricing, with leadership seats and an employee contributor tier.
                Opt-in annual version upgrades with benefits.
              </div>
              
              <div>Private beta (Q2, 2026) → Paid pilots (Q3, 2026) → Broader market release (Q4, 2026)</div>
            </div>
          </div>
        </section>

          {/* AI */}
        <section className="mt-12">
          <div className="text-xs uppercase tracking-wide opacity-50">Use of AI</div>

          <div className="mt-4 rounded-2xl border border-black/10 p-4">
            <div className="space-y-2 text-sm opacity-80">
              <div>
                AI inside The Bureau is deliberate, not theatrical. 
                We’ll use LLMs only where they meaningfully reduce friction - under the hood, where the system benefits from interpretation, synthesis, and automation. 
                There will be no personified 'assistant' parked on the canvas, no forced chat layer, and no attempt to replace your judgment and intimate knowledge of your own operation. 
                The Bureau stays quiet: AI supports the mapping where it matters: cleaning inputs, surfacing inconsistencies, suggesting structure, and accelerating planning - without secretly manipulating core data, or becoming the interface.
              </div>
              
            </div>
          </div>
        </section>

        {/* Ask */}
        <section className="mt-12">
          <div className="rounded-2xl border p-4" style={{ borderColor: 'rgba(0,114,49,0.25)' }}>
            <div className="text-xs uppercase tracking-wide opacity-50">Ask</div>
            <div className="mt-3 space-y-2 text-sm opacity-80">
              <div>
                Fundraising to reach paid pilots milestone, and harden the product for repeatable adoption post market launch in Q4, 2026. 
                We are seeking investors who understand operational software and creative/tech service business models.
              </div>
             
            </div>
          </div>
        </section>

        <div className="mt-16 text-xs opacity-50">© {new Date().getFullYear()} The Bureau</div>
      </div>
    </main>
  );
}