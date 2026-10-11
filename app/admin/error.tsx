'use client';

export default function AdminError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section role="alert" className="rounded-2xl border border-rose-200 bg-white p-6">
      <h2 className="text-lg font-semibold">This page could not be loaded.</h2>
      <p className="mt-2 text-sm text-slate-600">Try again. If the problem continues, refresh the page or sign in again.</p>
      <button type="button" onClick={reset} className="mt-4 rounded-xl bg-slate-950 px-4 py-2 text-white">Try again</button>
    </section>
  );
}
