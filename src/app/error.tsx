"use client";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="max-w-4xl mx-auto px-4 py-12 text-center">
      <h1 className="text-xl font-bold text-slate-900 mb-2">Noe gikk galt</h1>
      <p className="text-sm text-slate-500 mb-4">
        Vi klarte ikke hente trafikkdata akkurat nå. Prøv igjen om litt.
      </p>
      <button onClick={() => reset()} className="text-sm text-blue-600 underline">
        Prøv igjen
      </button>
    </div>
  );
}
