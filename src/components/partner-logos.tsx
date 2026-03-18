"use client";
import { trackEvent } from "@/lib/plausible";

export default function PartnerLogos() {
  return (
    <div className="flex items-center justify-center gap-2 text-xs text-slate-400 py-1">
      <span>Et prosjekt av</span>
      <a
        href="https://synaro.no/"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Synaro"
        onClick={() => trackEvent("source_logo_clicked", { source: "synaro" })}
        className="text-slate-700 font-bold tracking-[0.15em] text-xs uppercase hover:text-slate-900 transition-colors"
      >
        SYNARO
      </a>
      <span className="text-slate-300">·</span>
      <a
        href="https://www.krescado.no/"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Krescado"
        onClick={() => trackEvent("source_logo_clicked", { source: "krescado" })}
        className="hover:opacity-80 transition-opacity"
      >
        <img src="/krescado-logo.webp" alt="Krescado" className="h-5 w-auto" />
      </a>
    </div>
  );
}
