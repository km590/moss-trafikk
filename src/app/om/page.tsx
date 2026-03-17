import type { Metadata } from "next";
import { STATIONS } from "@/lib/stations";

export const metadata: Metadata = {
  title: "Om Moss Trafikk",
};

export default function OmPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
      <h1 className="text-2xl font-bold">Om Moss Trafikk</h1>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Hva er dette?</h2>
        <p className="text-slate-600">
          Moss Trafikk gir deg trafiktstatus for hele Moss-korridoren – fra E6/Patterød i øst til Kanalbrua og Jeløya i vest. Verktøyet er laget for pendlere som trenger å vite: bør jeg kjøre nå, eller vente?
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Datakilde</h2>
        <p className="text-slate-600">
          All trafikkdata hentes fra <a href="https://trafikkdata.atlas.vegvesen.no" className="underline text-blue-600" target="_blank" rel="noopener noreferrer">Statens vegvesen Trafikkdata API</a> (åpent, gratis GraphQL-API). Data oppdateres hvert 5. minutt.
        </p>
        <p className="text-slate-600">
          Vi bruker {STATIONS.length} verifiserte tellepunkter langs korridoren:
        </p>
        <ul className="space-y-1">
          {STATIONS.map(s => (
            <li key={s.id} className="text-sm text-slate-600">
              <span className="font-medium">{s.name}</span> ({s.road}) – {s.role}
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Trengselslogikk</h2>
        <p className="text-slate-600">
          Vi bruker <strong>avviksbasert klassifisering</strong>, ikke faste terskler. Normal trafikk er gjennomsnittlig volum for denne ukedagen og timen, basert på historiske data.
        </p>
        <div className="rounded-lg border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Status</th>
                <th className="text-left px-4 py-2 font-medium">Avvik fra normalt</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-slate-100">
                <td className="px-4 py-2 flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" />Normal</td>
                <td className="px-4 py-2">Under 110%</td>
              </tr>
              <tr className="border-t border-slate-100">
                <td className="px-4 py-2 flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-amber-400 inline-block" />Noe kø</td>
                <td className="px-4 py-2">110–125%</td>
              </tr>
              <tr className="border-t border-slate-100">
                <td className="px-4 py-2 flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-orange-500 inline-block" />Mye kø</td>
                <td className="px-4 py-2">125–145%</td>
              </tr>
              <tr className="border-t border-slate-100">
                <td className="px-4 py-2 flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-red-500 inline-block" />Svært mye kø</td>
                <td className="px-4 py-2">Over 145% (Kanalbrua: alltid rød over 1 100 kjt/t)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Ærlig om begrensninger</h2>
        <ul className="space-y-2 text-slate-600">
          <li>• Vi viser <strong>siste time</strong>, ikke sanntid. Data kan være opptil 5 minutter gammel.</li>
          <li>• «Beste kryssing» baseres på historisk snitt – ikke spådommer. Uventede hendelser fanges ikke opp.</li>
          <li>• Ferge-effekt (Rv19/Horten) er <strong>ikke inkludert i 1A</strong> – kommer i neste versjon.</li>
          <li>• Stasjoner med under 80% dekning markeres med «Mangler data».</li>
        </ul>
      </section>

      <section className="space-y-2 text-sm text-slate-400">
        <p>Laget av en Moss-pendler med for mye fritid og for lite flyt på Kanalbrua.</p>
        <p>Data: © Statens vegvesen, NLOD-lisens.</p>
      </section>
    </div>
  );
}
