'use client';

import { useState } from 'react';

const BUREAU_GREEN = '#007231';

export default function Home() {
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
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto max-w-2xl px-6 py-24">
        <div className="flex items-center justify-between">
          <div className="text-lg font-semibold tracking-tight">The Bureau •</div>

          <span
  className="text-sm opacity-60 hover:opacity-100 transition cursor-default select-none"
  style={{ color: BUREAU_GREEN }}
  aria-label="Open app (coming soon)"
  title="Coming soon"
>
  Open app →
</span>
        </div>

        <h1 className="mt-14 text-4xl font-medium leading-tight tracking-tight">
          Prototype Business Reality.
        </h1>

      <div className="mt-6 space-y-3">
  <p className="text-lg leading-relaxed opacity-80">
    People. Projects. Budgets. Time — Connected.
  </p>
 <div className="mt-6 space-y-3">
  <p className="text-base leading-relaxed opacity-80">
    The Bureau is where you prototype operations visually. Iterate on staffing, budget shape, timelines,
    and change-scenarios by simply connecting the dots across the financial year.
  </p>

  <p className="text-sm leading-relaxed opacity-70">
    No tasks. No comments. No replies. Just a sharp, executive view of what’s on, what’s next, and the
    commercial reality behind it.
  </p>
</div>
</div>

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

        <div className="mt-16 text-xs opacity-50">© {new Date().getFullYear()} The Bureau</div>
      </div>
    </main>
  );
}