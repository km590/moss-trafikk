# Moss Trafikk

Trafikkstatus og prediksjoner for hele Moss-korridoren. Kanalbrua, Rv19, E6/Mosseporten.

**Er det smart å kjøre nå, eller lønner det seg å vente?**

[mosstrafikk.no](https://mosstrafikk.no)

Et samarbeidsprosjekt mellom [Synaro](https://synaro.no/) og [Krescado](https://www.krescado.no/).

## Hvem står bak?

Bak prosjektet står Jørgen Simensen i Synaro og Kenneth Madsø i Krescado. Vi er to tidligere kollegaer med felles interesse for teknologi, data og produktutvikling, og begge har en nær relasjon til Moss og Jeløya.

Jørgen er oppvokst på Jeløya, har familie der og bor i dag på Ekholt. Kenneth bor på Verket og har venner og turområder på øya. Vi pendler begge til Oslo og kjenner godt på spørsmålet mange i Moss stiller seg: er det smart å kjøre nå, eller lønner det seg å vente litt?

Moss Trafikk er bygget med åpne data, åpne API-er og prediksjonsmodeller for å gi et smart anslag på trafikken akkurat nå og de neste timene.

## Hva

Avviksbasert trengselsanalyse og prediksjoner for 10 tellepunkter langs korridoren fra Valer/E6 til Kanalbrua/Jeloya. To-lags prediksjonsmodell med 2 ars historikk (89 000 timer), fergekontekst fra Entur, og estimert korridorstatus nar Vegvesen-data er forsinket. Alle eksterne API-kall har 5s timeout for a sikre at siden alltid laster.

## Prediksjonsmodell

### V1: Baseline (multiplikativ dekomponering)

Median per (stasjon, ukedag, time) justert med sesong- og helligdagsfaktorer. Robust og enkel. Treffer typisk 5-10% MAPE på hverdager.

### V2: Residualkorreksjon (LightGBM)

Quantile regression (p10/p50/p90) trent på residualer fra baseline. 26 features inkludert sanntidsvolum, korridorsignaler fra 6 eksterne stasjoner, og temporale features. Custom tree-walker i TypeScript for edge-inference (0 avhengigheter, ~200 KB modell).

V2 forbedrer kveld/natt, men har en kjent positiv bias i dagtimer (mars 2026). Bias-analyse (Fase A, 543 eval-rader) viser at midt-dag og ettermiddag har sterkest overpredikering. Volumkorreksjon er validert offline (-9pp MAPE) og planlegges som shadow i eval-systemet (Fase B).

Gating-policy styrer når residualen brukes:

| Policy        | Beskrivelse                                 |
| ------------- | ------------------------------------------- |
| `off`         | Kun baseline                                |
| `time_window` | Baseline 07-17, v2 18-06 **(aktiv i prod)** |
| `full`        | V2 residual alltid pa                       |

### Congestion-klassifisering

Tre uavhengige signaler (absolutt volum, relativ posisjon, friksjonsbasert) bestemmer om en stasjon vises som gronn, gul eller rod. Predicted congestion bruker samme terskler som measured (2-av-3 for rod, 3-av-3 i dempede timer, 1-av-3 for gul med lean-green guard).

Validert mot 272 holdout-rader: accuracy 79%, rod recall 97%, rod precision 83%.

### Treffsikkerhet

Modellen evalueres fortlopende mot faktiske malinger fra Statens vegvesen.

| Metode         | MAPE | Bias | Merknad                          |
| -------------- | ---- | ---- | -------------------------------- |
| Baseline (v1)  | ~10% | -7%  | Underpredikerer litt             |
| V2 full        | ~16% | +13% | Overpredikerer dagtimer          |
| V2 time_window | ~12% | -    | Deployet 2026-03-24              |
| Bias-korrigert | ~15% | -    | Midt-dag/ettermiddag -9pp (eval) |

Eval-data samles automatisk via GitHub Actions (snapshot + backfill, daglig).

## Arkitektur

```
src/
  lib/
    prediction-engine.ts     # V1: multiplikativ dekomponering
    prediction-engine-v2.ts  # V2: baseline + LightGBM residual + gating policy
    tree-walker.ts           # LightGBM JSON tree inference (0 avhengigheter)
    feature-builder.ts       # 26 features for residualmodell
    decision-engine.ts       # "Kjøre nå eller vente?" beslutningslogikk
    ferry-signal.ts          # Ferjesignal fra Entur (avgangstider Moss-Horten)
    traffic-logic.ts         # Congestion-klassifisering og beste-tid
    data-fetcher.ts          # Orkestrerer Vegvesen + prediksjon + ferje
    norwegian-calendar.ts    # Helligdager, skoleferie, 17. mai
    vegvesen-client.ts       # Statens vegvesen Trafikkdata (GraphQL)
    entur-client.ts          # Entur Journey Planner (fergeavganger)
    stations.ts              # Stasjonskonfig, vulnerability-thresholds
  data/
    model-weights.json       # Baseline-profiler (generert av scripts/)
    residual-model.json      # LightGBM quantile modell (eksportert fra Python)
    averages.json            # Legacy fallback
scripts/
    fetch-history.ts         # Hent 2 år rådata fra Vegvesen (104 uker)
    compute-model.ts         # Beregn baseline-profiler fra rådata
    validate-model.ts        # Segmentert MAPE-validering
    golden-test.ts           # Snapshot-tester for kjente scenarier
    compute-bias-corrections.ts  # Offline bias-analyse med tidsmessig holdout
    eval-congestion-hitrate.ts   # Congestion confusion matrix + rad-inspeksjon
    training/                # V2 treningspipeline (Python/LightGBM)
      train.py               # Tren 3 quantile-modeller (p10/p50/p90)
      features.py            # Feature engineering + datasett
      config.py              # Hyperparams, stasjoner, feature-lister
      export_model.py        # Eksporter til JSON for tree-walker
      ablation.py            # Feature ablation-tester
```

## Eval-system

Prediksjoner evalueres automatisk mot Vegvesen-actuals:

1. **Snapshot** (hver time via GitHub Actions): lagrer predicted, baseline, residual og policy-valg
2. **Backfill** (daglig via Vercel cron): matcher snapshots med faktisk trafikk fra Vegvesen
3. **Dashboard** (`/admin/eval`): WAPE, MAPE, bias per periode, MAE per stasjon

GitHub Actions ([`eval-collect.yml`](.github/workflows/eval-collect.yml)) kjører begge steg automatisk.

## Datakilder

- [Statens vegvesen Trafikkdata API](https://trafikkdata.atlas.vegvesen.no/) (åpent GraphQL API, ingen auth)
- [Entur Journey Planner API](https://developer.entur.org/) (fergeavganger Moss-Horten)
- [Plausible Analytics](https://plausible.io/) (personvernvennlig web analytics)

## Tech

- Next.js 16 (App Router, ISR 5 min)
- TypeScript
- Tailwind CSS + shadcn/ui + Recharts
- Supabase (eval-data og kalibrering)
- Vercel (hosting, auto-deploy fra main)
- Plausible Analytics
- Python + LightGBM (treningspipeline, offline)

## Kjør lokalt

```bash
npm install
cp .env.example .env.local  # Valgfritt: Supabase for eval
npm run dev
```

Generer baseline-profiler fra historikk (tar ca 15 min første gang):

```bash
npx tsx scripts/fetch-history.ts
npx tsx scripts/compute-model.ts
npx tsx scripts/validate-model.ts
npx tsx scripts/golden-test.ts
```

Tren V2 residualmodell (krever Python 3.11+):

```bash
cd scripts/training
pip install -r requirements.txt
python train.py
```

## Env-variabler

Se [.env.example](.env.example). Alle er valgfrie - appen fungerer uten Supabase og Plausible.

| Variabel                       | Beskrivelse                          |
| ------------------------------ | ------------------------------------ |
| `SUPABASE_URL`                 | Supabase-prosjekt URL                |
| `SUPABASE_SERVICE_ROLE_KEY`    | Service role key for eval            |
| `ADMIN_API_KEY`                | Bearer token for `/api/admin/eval/*` |
| `PREDICTION_MODEL`             | `v2` for å aktivere residualmodell   |
| `PREDICTION_RESIDUAL_POLICY`   | `off` / `time_window` / `full`       |
| `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` | Plausible-domene                     |

## Lisens

Kode: [MIT](LICENSE)

Datakilder følger egne vilkår:

- Trafikkdata: Statens vegvesen, [NLOD](https://data.norge.no/nlod)
- Fergeavganger: Entur, [NLOD](https://developer.entur.org/pages-intro-setup-and-access)
