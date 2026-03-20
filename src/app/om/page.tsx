import type { Metadata } from "next";
import { STATIONS } from "@/lib/stations";
import TrackPageView from "@/components/track-page-view";

export const metadata: Metadata = {
  title: "Om Moss Trafikk",
};

export default function OmPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
      <TrackPageView event="om_page_viewed" />

      <h1 className="text-2xl font-bold">Om Moss Trafikk</h1>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Hva er dette?</h2>
        <p className="text-slate-600">
          Moss Trafikk gir deg et smart anslag på trafikken i Moss-korridoren akkurat nå. Fra E6 ved
          Patterød i øst til Kanalbrua og Jeløya i vest. Laget for pendlere som lurer på: er det
          smart å kjøre nå, eller lønner det seg å vente?
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Hvem står bak?</h2>
        <p className="text-slate-600">
          Moss Trafikk er et samarbeidsprosjekt mellom{" "}
          <a
            href="https://synaro.no/"
            className="underline text-blue-600"
            target="_blank"
            rel="noopener noreferrer"
          >
            Synaro
          </a>{" "}
          og{" "}
          <a
            href="https://www.krescado.no/"
            className="underline text-blue-600"
            target="_blank"
            rel="noopener noreferrer"
          >
            Krescado
          </a>
          .
        </p>
        <p className="text-slate-600">
          Bak prosjektet står Jørgen Simensen i Synaro og Kenneth Madsø i Krescado. Vi er to
          tidligere kollegaer med felles interesse for teknologi, data og produktutvikling, og begge
          har en nær relasjon til Moss og Jeløya. Jørgen er oppvokst på Jeløya, har familie der og
          bor i dag på Ekholt. Kenneth bor på Verket og har venner og turområder på øya.
        </p>
        <p className="text-slate-600">
          Vi pendler begge til Oslo og kjenner godt på spørsmålet mange i Moss stiller seg: Er det
          smart å kjøre nå, eller lønner det seg å vente litt? Slik startet prosjektet.
        </p>
        <p className="text-slate-600">
          Moss Trafikk er bygget med åpne data, åpne API-er og prediksjonsmodeller for å gi et smart
          anslag på trafikken akkurat nå og de neste timene. Prosjektet publiseres som open source,
          slik at andre også kan lære av det eller bygge videre på ideen.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Hvordan fungerer det?</h2>
        <p className="text-slate-600">
          Trafikkdata fra Statens vegvesen er ofte 2-4 timer forsinket. Derfor er Moss Trafikk
          bygget som et anslagsprodukt, ikke et sanntidsprodukt. Når ferske målinger finnes, bruker
          vi dem. Når de er forsinket, viser vi et estimat basert på hvordan trafikken vanligvis er
          på dette tidspunktet.
        </p>
        <p className="text-slate-600">
          Estimatene bygger på historiske målinger fra samme ukedag og time, justert for sesong og
          høytider. Modellen er trent på omtrent 89 000 timer med trafikkdata over 2 år.
        </p>
        <p className="text-slate-600">
          Anslaget bygger på historiske mønstre og tilgjengelige målinger. Når ferske målinger
          finnes, brukes de. Når datagrunnlaget er svakere, er modellen mer forsiktig.
        </p>
        <p className="text-slate-600">
          Usikkerheten i anslaget vises som et konfidensanslag. Ved høy usikkerhet (gammel data,
          uvanlig trafikkmønster) gir vi mildere anbefalinger.
        </p>
        <p className="text-slate-600">
          Moss Trafikk bygger hovedsakelig på telledata fra Statens vegvesen. Det betyr at vi
          estimerer trafikkbelastning og sannsynlig framkommelighet, ikke direkte hastighet eller
          reisetid.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Framkommelighet</h2>
        <p className="text-slate-600">
          Fargene viser hvor lett det sannsynligvis er å komme fram, ikke bare hvor mye trafikk det
          er. Framkommelighetsfargene bygger på flere signaler, blant annet trafikkmengde, avvik fra
          normalen og stasjonens kjente sårbarhet.
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
                <td className="px-4 py-2 flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" />
                  Grønn
                </td>
                <td className="px-4 py-2">Går fint</td>
                <td className="px-4 py-2">Ser rolig ut</td>
              </tr>
              <tr className="border-t border-slate-100">
                <td className="px-4 py-2 flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-amber-400 inline-block" />
                  Gul
                </td>
                <td className="px-4 py-2">Travelt</td>
                <td className="px-4 py-2">Ser travelt ut</td>
              </tr>
              <tr className="border-t border-slate-100">
                <td className="px-4 py-2 flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-red-500 inline-block" />
                  Rød
                </td>
                <td className="px-4 py-2">Kø sannsynlig</td>
                <td className="px-4 py-2">Kø sannsynlig</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-sm text-slate-500">
          Rødt er konservativt: for målte data kreves minst 2 av 3 signaler, for estimater alle 3.
          Tvil mellom grønn og gul heller mot grønn. Kveldstrafikk overvarsles ikke.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Ferge</h2>
        <p className="text-slate-600">
          Vi viser neste fergeavganger fra Moss ferjekai (Moss-Horten) som kontekstsignal.
          Fergeavgangene kan påvirke trafikken rundt sentrum og Rv19. Fergetidene hentes i sanntid
          fra Entur.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Datakilder</h2>
        <p className="text-slate-600">
          Moss Trafikk bygger på {STATIONS.length} sentrale tellepunkter gjennom korridoren fra E6 og
          Mosseporten til Kanalbrua og Jeløya:
        </p>
        <ul className="list-disc list-inside space-y-1">
          {STATIONS.map((s) => (
            <li key={s.id} className="text-sm text-slate-600">
              <span className="font-medium">{s.name}</span> - {s.role}
            </li>
          ))}
        </ul>
        <p className="text-slate-600 mt-3">
          For å gjøre anslagene bedre bruker modellen også ekstra signalstasjoner utenfor disse{" "}
          {STATIONS.length} punktene. De vises ikke i grensesnittet, men hjelper oss å fange trafikk
          som er på vei inn mot Moss fra blant annet E6, Horten-siden og Larkollen.
        </p>
        <p className="text-sm text-slate-500 mt-2">
          Trafikkdata:{" "}
          <a
            href="https://trafikkdata.atlas.vegvesen.no"
            className="underline text-blue-600"
            target="_blank"
            rel="noopener noreferrer"
          >
            Statens vegvesen Trafikkdata API
          </a>
          . Fergeinfo:{" "}
          <a
            href="https://developer.entur.org"
            className="underline text-blue-600"
            target="_blank"
            rel="noopener noreferrer"
          >
            Entur Journey Planner API
          </a>
          .
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Begrensninger</h2>
        <p className="text-slate-600">
          Moss Trafikk er et anslagsverktøy, ikke en fasit. Estimatene treffer vanligvis godt på
          vanlige hverdager, men er mindre presise på helligdager og i skoleferier. Uventede
          hendelser som ulykker, veiarbeid eller spesielle arrangementer fanges ikke opp.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Åpent prosjekt</h2>
        <p className="text-slate-600">
          Moss Trafikk er åpen kildekode. All kode er tilgjengelig på{" "}
          <a
            href="https://github.com/km590/moss-trafikk"
            className="underline text-blue-600"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
          </a>
          , og trafikkdataene vi bruker er åpne data fra Statens vegvesen (NLOD) og Entur (NLOD).
        </p>
        <p className="text-slate-600">
          Har du tilbakemeldinger eller ideer? Opprett gjerne et issue på{" "}
          <a
            href="https://github.com/km590/moss-trafikk"
            className="underline text-blue-600"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
          </a>
          .
        </p>
      </section>

      <section className="space-y-2 text-sm text-slate-400">
        <p>
          Data: Statens vegvesen (NLOD) og Entur (NLOD). Kildekode på{" "}
          <a
            href="https://github.com/km590/moss-trafikk"
            className="underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
          </a>{" "}
          (MIT).
        </p>
      </section>
    </div>
  );
}
