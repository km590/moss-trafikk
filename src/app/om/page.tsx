import type { Metadata } from "next";
import { STATIONS } from "@/lib/stations";

export const metadata: Metadata = {
  title: "Om Moss Trafikk",
};

export default function OmPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
      <h1 className="text-2xl font-bold">Slik fungerer Moss Trafikk</h1>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Hva er dette?</h2>
        <p className="text-slate-600">
          Moss Trafikk gir deg et smart anslag på trafikken i Moss-korridoren akkurat nå. Fra E6 ved Patterød i øst til Kanalbrua og Jeløya i vest. Laget for pendlere som lurer på: er det smart å kjøre nå, eller lønner det seg å vente?
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Estimert, ikke live</h2>
        <p className="text-slate-600">
          Trafikkdata fra Statens vegvesen er ofte 2-4 timer forsinket. Derfor er Moss Trafikk bygget som et anslagsprodukt, ikke et sanntidsprodukt. Når ferske målinger finnes, bruker vi dem. Når de er forsinket, viser vi et estimat basert på hvordan trafikken vanligvis er på dette tidspunktet.
        </p>
        <p className="text-slate-600">
          Estimatene bygger på historiske målinger fra samme ukedag og time, justert for sesong og høytider. Modellen er trent på omtrent 89 000 timer med trafikkdata over 2 år.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Trafikknivå</h2>
        <p className="text-slate-600">
          Fargene uttrykker hvor travel en time typisk er for den aktuelle stasjonen, basert på historisk mønster.
        </p>
        <div className="rounded-lg border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Farge</th>
                <th className="text-left px-4 py-2 font-medium">Betydning</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-slate-100">
                <td className="px-4 py-2 flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" />Rolig</td>
                <td className="px-4 py-2">Blant de roligste timene for denne stasjonen</td>
              </tr>
              <tr className="border-t border-slate-100">
                <td className="px-4 py-2 flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-amber-400 inline-block" />Noe trafikk</td>
                <td className="px-4 py-2">Moderat travelhet, omtrent som vanlig</td>
              </tr>
              <tr className="border-t border-slate-100">
                <td className="px-4 py-2 flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-orange-500 inline-block" />Travel</td>
                <td className="px-4 py-2">Travlere enn vanlig for denne stasjonen</td>
              </tr>
              <tr className="border-t border-slate-100">
                <td className="px-4 py-2 flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-red-500 inline-block" />Svært travel</td>
                <td className="px-4 py-2">Blant de travleste timene i døgnet</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-sm text-slate-500">
          Når vi har ferske målinger fra Vegvesen, brukes avvik fra normalen i stedet for percentiler.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Ferge</h2>
        <p className="text-slate-600">
          Vi viser neste fergeavganger fra Moss ferjekai (Moss-Horten) som kontekstsignal. Fergeavgangene kan påvirke trafikken rundt sentrum og Rv19. Fergetidene hentes i sanntid fra Entur.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Datakilder</h2>
        <p className="text-slate-600">
          Vi bruker {STATIONS.length} tellepunkter langs korridoren:
        </p>
        <ul className="list-disc list-inside space-y-1">
          {STATIONS.map(s => (
            <li key={s.id} className="text-sm text-slate-600">
              <span className="font-medium">{s.name}</span> ({s.road}) - {s.role}
            </li>
          ))}
        </ul>
        <p className="text-sm text-slate-500 mt-2">
          Trafikkdata: <a href="https://trafikkdata.atlas.vegvesen.no" className="underline text-blue-600" target="_blank" rel="noopener noreferrer">Statens vegvesen Trafikkdata API</a>.
          Fergeavganger: <a href="https://developer.entur.org" className="underline text-blue-600" target="_blank" rel="noopener noreferrer">Entur Journey Planner API</a>.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Begrensninger</h2>
        <p className="text-slate-600">
          Moss Trafikk er et anslagsverktøy, ikke en fasit. Estimatene treffer vanligvis godt på vanlige hverdager, men er mindre presise på helligdager og i skoleferier. Uventede hendelser som ulykker, veiarbeid eller spesielle arrangementer fanges ikke opp.
        </p>
      </section>

      <section className="space-y-2 text-sm text-slate-400">
        <p>Laget av en Moss-pendler. Inspirert av <a href="https://synaro.no/jeloytrafikk" className="underline" target="_blank" rel="noopener">Jeløy Trafikk</a> av Synaro.</p>
        <p>Data: Statens vegvesen (NLOD) og Entur (NLOD). <a href="https://github.com/km590/moss-trafikk" className="underline" target="_blank" rel="noopener">Kildekode på GitHub</a> (MIT).</p>
      </section>
    </div>
  );
}
