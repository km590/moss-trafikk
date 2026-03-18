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
        <h2 className="text-lg font-semibold">Framkommelighet</h2>
        <p className="text-slate-600">
          Fargene viser hvor lett det sannsynligvis er å komme fram, ikke bare hvor mye trafikk det er. Vurderingen bygger på tre uavhengige signaler: absolutt trafikkmengde, avvik fra normalen, og stasjonens kjente sårbarhet.
        </p>
        <div className="rounded-lg border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Farge</th>
                <th className="text-left px-4 py-2 font-medium">Målt</th>
                <th className="text-left px-4 py-2 font-medium">Estimert</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-slate-100">
                <td className="px-4 py-2 flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" />Grønn</td>
                <td className="px-4 py-2">Går fint</td>
                <td className="px-4 py-2">Ser rolig ut</td>
              </tr>
              <tr className="border-t border-slate-100">
                <td className="px-4 py-2 flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-amber-400 inline-block" />Gul</td>
                <td className="px-4 py-2">Travelt</td>
                <td className="px-4 py-2">Ser travelt ut</td>
              </tr>
              <tr className="border-t border-slate-100">
                <td className="px-4 py-2 flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-red-500 inline-block" />Rød</td>
                <td className="px-4 py-2">Kø</td>
                <td className="px-4 py-2">Kø sannsynlig</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-sm text-slate-500">
          Rødt er konservativt: for målte data kreves minst 2 av 3 signaler, for estimater alle 3. Tvil mellom grønn og gul heller mot grønn. Kveldstrafikk overvarsles ikke.
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
        <h2 className="text-lg font-semibold">Modellen</h2>
        <p className="text-slate-600">
          Modellen kombinerer historiske mønstre med ferske målinger fra alle tellepunkter. Når målinger er ferske, vektes de tungt. Når data er gammelt, faller modellen tilbake til historiske mønstre.
        </p>
        <p className="text-slate-600">
          Usikkerheten i anslaget vises som en tillitsvurdering. Ved høy usikkerhet (gammel data, uvanlig trafikkmønster) er modellen mer forsiktig med å gi sterke anbefalinger om å vente.
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
