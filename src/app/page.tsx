'use client';

import { useState } from 'react';

const BUREAU_GREEN = '#007231';

export default function Home() {
  const [email, setEmail] = useState('');
  const [studio, setStudio] = useState('');
  const [sent, setSent] = useState(false);

  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto max-w-2xl px-6 py-24">
        <div className="flex items-center justify-between">
          <div className="text-lg font-semibold tracking-tight">The Bureau •</div>

        
            app opening soon →
          
        </div>

        <h1 className="mt-14 text-4xl font-medium leading-tight tracking-tight">
          Navigate Business Reality •
        </h1>

        <p className="mt-6 text-lg leading-relaxed opacity-80">
          An executive visual operating layer for modern studios • People, projects, budgets, and time — Connected.
        </p>

        <div className="mt-10 rounded-2xl border border-black/10 p-4">
          {sent ? (
            <div className="text-sm">
              <div className="font-medium">Request received.</div>
              <div className="mt-1 opacity-70">We’ll be in touch.</div>
            </div>
          ) : (
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                setSent(true);
              }}
            >
              <input
                className="w-full rounded-xl border border-black/10 px-4 py-3 text-sm outline-none focus:border-black/30"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />

              <input
                className="w-full rounded-xl border border-black/10 px-4 py-3 text-sm outline-none focus:border-black/30 focus:ring-2 focus:ring-[#007231]/20"
                placeholder="Studio name (optional)"
                value={studio}
                onChange={(e) => setStudio(e.target.value)}
              />

              <button
                type="submit"
                className="rounded-xl px-4 py-3 text-sm font-medium text-white transition hover:opacity-95"
                style={{ background: '#007231' }}
              >
                Request access
              </button>

              <div className="text-xs opacity-50">No spam. No noise.</div>
            </form>
          )}
        </div>

        <div className="mt-16 text-xs opacity-50">
          © {new Date().getFullYear()} The Bureau
        </div>
      </div>
    </main>
  );
}