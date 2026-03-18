# Moss Trafikk

Trafikkstatus og prediksjoner for hele Moss-korridoren. Kanalbrua, Rv19, E6/Mosseporten.

**Bor du kjore na, eller vente?**

Inspirert av [Jeloy Trafikk](https://synaro.no/jeloytrafikk) av Synaro.

## Hva

Avviksbasert trengselsanalyse og prediksjoner for 10 tellepunkter langs korridoren fra Valer/E6 til Kanalbrua/Jeloya. Baseline-modell med 2 ar historikk (89 000 timer), sanntids ferjesignal fra Entur, og estimert korridorstatus nar Vegvesen-data er forsinket.

## Datakilder

- [Statens vegvesen Trafikkdata API](https://trafikkdata.atlas.vegvesen.no/) (apent GraphQL API, ingen auth)
- [Entur Journey Planner API](https://developer.entur.org/) (fergeavganger Moss-Horten)
- Prediksjonsmodell: median per (stasjon, ukedag, time) med sesong- og helligdagsfaktorer

## Tech

- Next.js 16 (App Router, ISR 5 min)
- Tailwind CSS + shadcn/ui + Recharts
- Supabase (eval/kalibrering)
- Vercel

## Kjor lokalt

```bash
npm install
npm run dev
```

Generer modellvekter fra historikk (tar ca 15 min forste gang):

```bash
npx tsx scripts/fetch-history.ts
npx tsx scripts/compute-model.ts
npx tsx scripts/validate-model.ts
npx tsx scripts/golden-test.ts
```

## Lisens

Data: Statens vegvesen, NLOD-lisens. Fergeavganger: Entur, NLOD-lisens.
