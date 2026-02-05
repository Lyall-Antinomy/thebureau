'use client';

import { useState } from 'react';

const BUREAU_GREEN = '#007231';

export default function LandingV2() {
  const [email, setEmail] = useState('');
  const [studio, setStudio] = useState('');
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (sending) return;

    setError(null);
    setSending(true);

    try {
      const payload = {
        email: email.trim().toLowerCase(),
        name: studio.trim() || undefined,
        source: 'landing-v2',
      };

      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.ok) {
        setError(json?.error ?? 'Something went wrong. Please try again.');
        setSending(false);
        return;
      }

      setSent(true);
    } catch {
      setError('Network error. Please try again.');
      setSending(false);
      return;
    }

    setSending(false);
  }

  return (
    <main
      className="h-screen overflow-y-auto bg-white text-black"
      style={{ WebkitOverflowScrolling: 'touch' }}
    >
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
              Memo
            </span>
          </div>

          {/* Right: open app */}
          <div className="text-sm">
            <span
              className="opacity-60 hover:opacity-100 transition cursor-default select-none"
              style={{ color: BUREAU_GREEN }}
              aria-label="Open app (coming soon)"
              title="Coming soon"
            >
              Open app →
            </span>
          </div>
        </div>

        {/* Hero */}
        <h1 className="mt-14 text-4xl font-medium leading-tight tracking-tight">
          Prototype Business Reality.
        </h1>

        <div className="mt-6 space-y-3">
          <p className="text-lg leading-relaxed opacity-80">
            People. Projects. Budgets. Time. — Connected.
          </p>

          <p className="text-base leading-relaxed opacity-80">
            The Bureau is where you prototype operations visually. Iterate on staffing, budget shape, 
            timelines, and change-scenarios by simply connecting the dots across the financial year.
          </p>

          <p className="text-sm leading-relaxed opacity-70">
            No tasks. No comments. No replies. Just a sharp, executive view of what’s on, what’s next, 
            and the commercial reality behind it.
          </p>
        </div>

        {/* CTA */}
        <div className="mt-10 rounded-2xl border border-black/10 p-4">
          {sent ? (
            <div className="text-sm">
              <div className="font-medium">Request received.</div>
              <div className="mt-1 opacity-70">We’ll be in touch.</div>
            </div>
          ) : (
            <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
              <input
                className="w-full rounded-xl border border-black/10 px-4 py-3 text-sm outline-none focus:border-black/30 focus:ring-2 focus:ring-[#007231]/20"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={sending}
                inputMode="email"
                autoComplete="email"
              />

              <input
                className="w-full rounded-xl border border-black/10 px-4 py-3 text-sm outline-none focus:border-black/30 focus:ring-2 focus:ring-[#007231]/20"
                placeholder="Studio name (optional)"
                value={studio}
                onChange={(e) => setStudio(e.target.value)}
                disabled={sending}
                autoComplete="organization"
              />

              <button
                type="submit"
                className="rounded-xl px-4 py-3 text-sm font-medium text-white transition hover:opacity-95 disabled:opacity-60 disabled:cursor-not-allowed"
                style={{ background: BUREAU_GREEN }}
                disabled={sending}
              >
                {sending ? 'Sending…' : 'Request access'}
              </button>

              {error ? (
                <div className="text-xs" style={{ color: '#b00020' }}>
                  {error}
                </div>
              ) : (
                <div className="text-xs opacity-50">No spam. No noise.</div>
              )}
            </form>
          )}
        </div>

        {/* Pricing */}
<section className="mt-16">
  <div className="text-xs uppercase tracking-wide opacity-50">Pricing</div>

  <div className="mt-4 grid gap-3">
    {/* Unified container (Founding + Contributors) */}
    <div
      className="rounded-2xl border p-4"
      style={{ borderColor: 'rgba(0,114,49,0.25)' }}
    >
      {/* Founding */}
      <div>
        <div className="text-sm font-medium">Founding Workspace</div>
        <div className="mt-1 text-2xl font-medium tracking-tight">€799</div>
        <div className="mt-1 text-xs opacity-60">One-time</div>

        <div className="mt-4 space-y-2 text-sm opacity-80">
          {/* Treat this like "Contributors 25" */}
          <div className="text-sm font-medium">Core seats</div>
          <div className="mt-1 text-2xl font-medium tracking-tight">10</div>
          <div className="mt-1 text-xs opacity-60">Included</div>

          <div className="mt-4 space-y-2 text-sm opacity-80">
            <div>Desktop access</div>
            <div>Executive View on mobile (read-only for Core)</div>
            <div>All current features</div>
            <div>12 months of updates</div>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="my-6 border-t border-black/10" />

      {/* Contributors (stacked under Founding) */}
      <div>
        <div className="text-sm font-medium">Contributors</div>
        <div className="mt-1 text-2xl font-medium tracking-tight">25</div>
        <div className="mt-1 text-xs opacity-60">Included</div>

        <div className="mt-4 space-y-2 text-sm opacity-80">
          <div>Mobile-only</div>
          <div>Assigned projects</div>
          <div>Work session timer</div>
          <div>Feeds actuals back into the system</div>
        </div>

        <div className="mt-4 text-sm">
          <span className="opacity-60">Scale:</span>{' '}
          <span className="font-medium">€10 / month</span>{' '}
          <span className="opacity-60">per additional 10 contributors</span>
        </div>
      </div>
    </div>


            <div className="rounded-2xl border border-black/10 p-4">
              <div className="text-sm font-medium">Annual Version Upgrade</div>
              <div className="mt-1 text-2xl font-medium tracking-tight">€299</div>
              <div className="mt-1 text-xs opacity-60">Per year</div>

              <div className="mt-4 space-y-2 text-sm opacity-80">
                <div>Unlock the latest version of app</div>
                <div>New features, & trust & security upgrades</div>
                
              </div>

              <div className="mt-4 text-xs opacity-60">
                Renew only when you want to upgrade to the next major build.
              </div>
            </div>
          </div>
        </section>

        {/* Seats & Access */}
        <section className="mt-12">
          <div className="text-xs uppercase tracking-wide opacity-50">Seats &amp; access</div>

          <div className="mt-4 rounded-2xl border border-black/10 p-4">
            <div className="text-sm opacity-70">
              Two roles. Clear boundaries. Designed for studios.
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs opacity-60">
                  <tr>
                    <th className="py-2 pr-4 font-medium">Capability</th>
                    <th className="py-2 pr-4 font-medium">Core</th>
                    <th className="py-2 font-medium">Contributor</th>
                  </tr>
                </thead>
                <tbody className="align-top">
                  {[
                    ['Workflow operating map', '✅', '❌'],
                    ['Key data visualisations', '✅', '❌'],
                    ['Assign people to projects', '✅', '❌'],
                    ['Budgets & financial rollups', '✅', '❌'],
                    [
                      'Resourcing & capacity',
                      '✅',
                      '❌',
                    ],
                    ['Mobile Executive View', '✅', '❌'],
                    ['Mobile project list', '✅', '✅'],
                    ['Mobile session timer', '✅', '✅'],
                    ['Audit trail for sensitive changes', '✅', '❌'],
                  ].map(([cap, core, contrib]) => (
                    <tr key={cap} className="border-t border-black/5">
                      <td className="py-3 pr-4 opacity-80">{cap}</td>
                      <td className="py-3 pr-4">{core}</td>
                      <td className="py-3">{contrib}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 text-xs opacity-60">
              Planning inputs only. No bank statements. Compensation fields are permissioned and
              never exposed to Contributors.
            </div>
          </div>
        </section>

        {/* Prototype → Test → Commit */}
        <section className="mt-12">
          <div className="rounded-2xl border border-black/10 p-4">
            <div className="text-xs uppercase tracking-wide opacity-50">Prototype → Test → Commit</div>

            <div className="mt-3 space-y-2 text-sm opacity-80">
              <div>
                <span className="font-medium">Prototype →</span> your full operation.
              </div>
              <div>
                <span className="font-medium">Test →</span> iterative models against reality.
              </div>
              <div>
                <span className="font-medium">Commit →</span> move
                forward with clarity.
              </div>
            </div>
          </div>
        </section>

        <div className="mt-16 text-xs opacity-50">© {new Date().getFullYear()} The Bureau</div>
      </div>
    </main>
  );
}