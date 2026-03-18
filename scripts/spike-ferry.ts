/**
 * Spike: Compare predictions with and without ferry signal.
 * Fetches real ferry departures and shows the difference.
 *
 * Usage: npx tsx scripts/spike-ferry.ts
 */
import { fetchFerryDepartures } from "../src/lib/entur-client";
import { computeFerryFactor, isFerryAffectedStation } from "../src/lib/ferry-signal";
import { KANALBRUA_ID, RV19_STATION_IDS, STATIONS } from "../src/lib/stations";

// Inline prediction (avoid import issues with tsx)
import modelWeights from "../src/data/model-weights.json";

function getNorwayTime(): { hour: number; dayOfWeek: number } {
  const now = new Date();
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Oslo",
    hour: "numeric",
    hour12: false,
    weekday: "short",
  });
  const parts = f.formatToParts(now);
  const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dayOfWeek = dayMap[parts.find((p) => p.type === "weekday")?.value ?? "Wed"] ?? 3;
  return { hour, dayOfWeek };
}

function getBaselineVolume(stationId: string, dow: number, hour: number): number {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = modelWeights as any;
  return w.basePatterns[stationId]?.[dow]?.[hour]?.median ?? 0;
}

async function main() {
  console.log("=== Ferry Signal Spike ===\n");

  const departures = await fetchFerryDepartures(8);
  const now = Date.now();

  console.log("Neste avganger fra Moss fergeleie:");
  for (const d of departures) {
    const t = new Date(d.time);
    const min = Math.round((t.getTime() - now) / 60000);
    console.log(
      `  ${t.toLocaleTimeString("no-NO", { timeZone: "Europe/Oslo" })} -> ${d.destination} (${min} min)`
    );
  }

  const { hour, dayOfWeek } = getNorwayTime();
  const dayNames = ["søndag", "mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag"];
  console.log(`\nNå: ${dayNames[dayOfWeek]} kl ${hour}:00\n`);

  // Test ferry factor for key stations
  const testStations = [KANALBRUA_ID, ...RV19_STATION_IDS.slice(0, 2)];

  console.log(
    "Station".padEnd(22),
    "Baseline".padStart(8),
    "  +Ferry".padStart(8),
    "  Delta".padStart(8),
    "Factor".padStart(8),
    "Reason"
  );
  console.log("-".repeat(80));

  for (const sid of testStations) {
    const station = STATIONS.find((s) => s.id === sid);
    const name = station?.name ?? sid.slice(0, 10);
    const baseline = getBaselineVolume(sid, dayOfWeek, hour);
    const { factor, reason } = computeFerryFactor(sid, departures, now);
    const adjusted = Math.round(baseline * factor);
    const delta = adjusted - baseline;

    console.log(
      name.padEnd(22),
      String(baseline).padStart(8),
      String(adjusted).padStart(8),
      (delta > 0 ? `+${delta}` : String(delta)).padStart(8),
      factor.toFixed(2).padStart(8),
      reason
    );
  }

  // Show what happens at different times relative to next departure
  if (departures.length > 0) {
    const nextDep = departures[0];
    const depTime = new Date(nextDep.time).getTime();

    console.log(
      `\n=== Ferjesignal-kurve for ${STATIONS.find((s) => s.id === KANALBRUA_ID)?.name} ===`
    );
    console.log(
      `Neste avgang: ${new Date(nextDep.time).toLocaleTimeString("no-NO", { timeZone: "Europe/Oslo" })}\n`
    );
    console.log(
      "Min før".padStart(8),
      "Faktor".padStart(8),
      "Baseline".padStart(10),
      "Justert".padStart(10)
    );
    console.log("-".repeat(40));

    for (let minBefore = 60; minBefore >= 0; minBefore -= 5) {
      const simTime = depTime - minBefore * 60000;
      const { factor } = computeFerryFactor(KANALBRUA_ID, [nextDep], simTime);
      const baseline = getBaselineVolume(KANALBRUA_ID, dayOfWeek, hour);
      const adjusted = Math.round(baseline * factor);
      const bar = factor > 1.0 ? "█".repeat(Math.round((factor - 1) * 100)) : "";
      console.log(
        String(minBefore).padStart(8),
        factor.toFixed(2).padStart(8),
        String(baseline).padStart(10),
        String(adjusted).padStart(10),
        " " + bar
      );
    }
  }

  // Compare: affected vs unaffected stations
  console.log("\n=== Påvirket vs upåvirket ===\n");
  for (const s of STATIONS) {
    const affected = isFerryAffectedStation(s.id);
    const baseline = getBaselineVolume(s.id, dayOfWeek, hour);
    const { factor } = computeFerryFactor(s.id, departures, now);
    if (baseline > 0) {
      console.log(
        `${affected ? "→" : " "} ${s.name.padEnd(20)} baseline=${String(baseline).padStart(5)} factor=${factor.toFixed(2)} ${affected ? "(ferje-påvirket)" : ""}`
      );
    }
  }
}

main().catch(console.error);
