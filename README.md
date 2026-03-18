# Moss Trafikk

Trafikkstatus og prediksjoner for hele Moss-korridoren. Kanalbrua, Rv19, E6/Mosseporten.

**Bor du kjore na, eller vente?**

Inspirert av [Jeloy Trafikk](https://synaro.no/jeloytrafikk) av Synaro.

## Hva

Avviksbasert trengselsanalyse og prediksjoner for 10 tellepunkter langs korridoren fra Valer/E6 til Kanalbrua/Jeloya. Baseline-modell med 2 ar historikk (89 000 timer), sanntids ferjesignal fra Entur, og estimert korridorstatus nar Vegvesen-data er forsinket.

## Arkitektur

```
src/
  lib/
    prediction-engine.ts  # Multiplikativ dekomponering: base * maaned * helligdag
    ferry-signal.ts       # Sanntids ferje-boost for RV19/Kanalbrua (Entur API)
    traffic-logic.ts      # Congestion-klassifisering og beste-tid
    data-fetcher.ts       # Orkestrerer Vegvesen + prediksjon + ferje
    norwegian-calendar.ts # Helligdager, skoleferie, 17. mai
    vegvesen-client.ts    # Statens vegvesen GraphQL
    entur-client.ts       # Entur fergeavganger
  data/
    model-weights.json    # Modellvekter (generert av scripts/)
    averages.json         # Legacy fallback (beholdes midlertidig)
scripts/
    fetch-history.ts      # Hent 2 ar raadata fra Vegvesen (104 uker)
    compute-model.ts      # Beregn modellvekter fra raadata
    validate-model.ts     # Segmentert MAPE-validering
    golden-test.ts        # Snapshot-tester for kjente scenarier
```

## Datakilder

- [Statens vegvesen Trafikkdata API](https://trafikkdata.atlas.vegvesen.no/) (apent GraphQL API, ingen auth)
- [Entur Journey Planner API](https://developer.entur.org/) (fergeavganger Moss-Horten)
- Prediksjonsmodell: median per (stasjon, ukedag, time) med sesong- og helligdagsfaktorer

## Tech

- Next.js 16 (App Router, ISR 5 min)
- TypeScript
- Tailwind CSS + shadcn/ui + Recharts
- Supabase (eval/kalibrering)
- Vercel

## Kjor lokalt

```bash
npm install
cp .env.example .env.local  # Valgfritt: Supabase for eval
npm run dev
```

Generer modellvekter fra historikk (tar ca 15 min forste gang):

```bash
npx tsx scripts/fetch-history.ts
npx tsx scripts/compute-model.ts
npx tsx scripts/validate-model.ts
npx tsx scripts/golden-test.ts
```

## Env-variabler

Se [.env.example](.env.example). Alle er valgfrie - appen fungerer uten Supabase.

## Lisens

Kode: [MIT](LICENSE)

Datakilder folger egne vilkar:
- Trafikkdata: Statens vegvesen, [NLOD](https://data.norge.no/nlod)
- Fergeavganger: Entur, [NLOD](https://developer.entur.org/pages-intro-setup-and-access)
