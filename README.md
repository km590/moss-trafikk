# Moss Trafikk

Trafikkstatus og prediksjoner for hele Moss-korridoren. Kanalbrua, Rv19, E6/Mosseporten.

**Er det smart å kjøre nå, eller lønner det seg å vente?**

Et samarbeidsprosjekt mellom [Synaro](https://synaro.no/) og [Krescado](https://www.krescado.no/).

## Hvem står bak?

Bak prosjektet står Jørgen Simensen i Synaro og Kenneth Madsø i Krescado. Vi er to tidligere kollegaer med felles interesse for teknologi, data og produktutvikling, og begge har en nær relasjon til Moss og Jeløya.

Jørgen er oppvokst på Jeløya, har familie der og bor i dag på Ekholt. Kenneth bor på Verket og har venner og turområder på øya. Vi pendler begge til Oslo og kjenner godt på spørsmålet mange i Moss stiller seg: er det smart å kjøre nå, eller lønner det seg å vente litt?

Moss Trafikk er bygget med åpne data, åpne API-er og prediksjonsmodeller for å gi et smart anslag på trafikken akkurat nå og de neste timene.

## Hva

Avviksbasert trengselsanalyse og prediksjoner for 10 tellepunkter langs korridoren fra Våler/E6 til Kanalbrua/Jeløya. Baseline-modell med 2 års historikk (89 000 timer), sanntids ferjesignal fra Entur, og estimert korridorstatus når Vegvesen-data er forsinket.

## Prediksjonstreffsikkerhet

Modellen evalueres fortløpende mot faktiske målinger fra Statens vegvesen.

| Stasjon | Metode | MAPE (typisk hverdag) |
|---------|--------|-----------------------|
| Kanalbrua | Baseline (v1) | ~5-7% |

MAPE (Mean Absolute Percentage Error) måler gjennomsnittlig avvik mellom predikert og faktisk trafikk. Modellen treffer best på vanlige hverdager og er mindre presis på helligdager, skoleferier og ved uventede hendelser.

## Arkitektur

```
src/
  lib/
    prediction-engine.ts     # Baseline: multiplikativ dekomponering
    prediction-engine-v2.ts  # V2: baseline + LightGBM residualkorreksjon
    decision-engine.ts       # "Kjøre nå eller vente?" beslutningslogikk
    ferry-signal.ts          # Sanntids ferje-boost for RV19/Kanalbrua (Entur API)
    traffic-logic.ts         # Congestion-klassifisering og beste-tid
    data-fetcher.ts          # Orkestrerer Vegvesen + prediksjon + ferje
    norwegian-calendar.ts    # Helligdager, skoleferie, 17. mai
    vegvesen-client.ts       # Statens vegvesen GraphQL
    entur-client.ts          # Entur fergeavganger
    plausible.ts             # Analytics event tracking
  data/
    model-weights.json       # Modellvekter (generert av scripts/)
    residual-model.json      # LightGBM residualmodell (v2)
    averages.json            # Legacy fallback
scripts/
    fetch-history.ts         # Hent 2 år rådata fra Vegvesen (104 uker)
    compute-model.ts         # Beregn modellvekter fra rådata
    validate-model.ts        # Segmentert MAPE-validering
    golden-test.ts           # Snapshot-tester for kjente scenarier
    training/                # V2 treningspipeline (Python/LightGBM)
```

## Datakilder

- [Statens vegvesen Trafikkdata API](https://trafikkdata.atlas.vegvesen.no/) (åpent GraphQL API, ingen auth)
- [Entur Journey Planner API](https://developer.entur.org/) (fergeavganger Moss-Horten)
- Prediksjonsmodell: median per (stasjon, ukedag, time) med sesong- og helligdagsfaktorer

## Tech

- Next.js 16 (App Router, ISR 5 min)
- TypeScript
- Tailwind CSS + shadcn/ui + Recharts
- Supabase (eval/kalibrering)
- Vercel
- Plausible Analytics (implementert, aktiveres når produksjonsdomenet mosstrafikk.no er på plass)

## Kjør lokalt

```bash
npm install
cp .env.example .env.local  # Valgfritt: Supabase for eval
npm run dev
```

Generer modellvekter fra historikk (tar ca 15 min første gang):

```bash
npx tsx scripts/fetch-history.ts
npx tsx scripts/compute-model.ts
npx tsx scripts/validate-model.ts
npx tsx scripts/golden-test.ts
```

## Env-variabler

Se [.env.example](.env.example). Alle er valgfrie - appen fungerer uten Supabase og Plausible.

## Lisens

Kode: [MIT](LICENSE)

Datakilder følger egne vilkår:
- Trafikkdata: Statens vegvesen, [NLOD](https://data.norge.no/nlod)
- Fergeavganger: Entur, [NLOD](https://developer.entur.org/pages-intro-setup-and-access)
