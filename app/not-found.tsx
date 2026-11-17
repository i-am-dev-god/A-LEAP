import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="grid h-[100dvh] place-items-center bg-ink p-6">
      <div className="max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center">
        <p className="ou-eyebrow text-cyan/70">OU Spatial Engine</p>
        <h1 className="mt-3 text-2xl font-semibold text-white">Off the survey grid</h1>
        <p className="mt-2 text-sm leading-relaxed text-white/50">
          This coordinate is outside the campus twin. Return to the map to continue navigating.
        </p>
        <Link
          href="/"
          className="mt-5 inline-flex h-9 items-center rounded-lg border border-mint/40 bg-mint/10 px-4 text-xs text-mint"
        >
          Back to campus
        </Link>
      </div>
    </main>
  );
}
