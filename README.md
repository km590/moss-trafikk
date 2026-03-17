# Moss Trafikk

Trafikstatus for hele Moss-korridoren. Kanalbrua, Rv19, E6/Mosseporten.

**Bor du kjore na, eller vente?**

## Hva

Avviksbasert trengselsanalyse for 10 tellepunkter langs korridoren fra Valer/E6 til Kanalbrua/Jeloya. Sammenligner siste times trafikk mot historisk snitt for denne ukedagen og timen.

## Datakilder

- [Statens vegvesen Trafikkdata API](https://trafikkdata.atlas.vegvesen.no/) (apent GraphQL API, ingen auth)
- Historiske gjennomsnitt basert pa 10 uker med timedata

## Tech

- Next.js 15 (App Router, ISR 5 min)
- Tailwind CSS + shadcn/ui
- Vercel (arn1/Stockholm)

## Kjor lokalt

```bash
npm install
npm run dev
```

Generer historiske snitt (tar ca 3 min):

```bash
npx tsx scripts/generate-averages.ts
```

## Lisens

Data: Statens vegvesen, NLOD-lisens.
