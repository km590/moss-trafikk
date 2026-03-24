import { supabase } from "@/lib/supabase";
import { STATIONS } from "@/lib/stations";

export const revalidate = 0; // Always fresh
export const dynamic = "force-dynamic";

function stationName(id: string): string {
  return STATIONS.find((s) => s.id === id)?.name ?? id.slice(0, 12);
}

function errorColor(pct: number | null): string {
  if (pct === null) return "";
  if (Math.abs(pct) < 10) return "text-emerald-600";
  if (Math.abs(pct) < 20) return "text-amber-600";
  return "text-red-600";
}

function biasColor(pct: number): string {
  if (Math.abs(pct) < 5) return "text-emerald-600";
  if (Math.abs(pct) < 15) return "text-amber-600";
  return "text-red-600";
}

function classifyPeriod(hour: number): string {
  if (hour >= 7 && hour <= 9) return "morgen-rush";
  if (hour >= 10 && hour <= 14) return "midt-dag";
  if (hour >= 15 && hour <= 17) return "ettermiddag-rush";
  if (hour >= 18 && hour <= 22) return "kveld";
  return "natt";
}

interface EvalRow {
  id: string;
  station_id: string;
  target_hour: string;
  predicted_volume: number;
  baseline_volume: number;
  residual_raw_p50: number | null;
  final_policy: string | null;
  ferry_boost_factor: number;
  ferry_boost_active: boolean;
  confidence: string;
  day_type: string;
  actual_volume: number | null;
  error_abs: number | null;
  error_pct: number | null;
  signed_error_pct: number | null;
}

export default async function EvalPage() {
  if (!supabase) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <h1 className="text-xl font-bold mb-4">Eval: Supabase ikke konfigurert</h1>
        <p className="text-slate-500">Sett SUPABASE_URL og SUPABASE_SERVICE_ROLE_KEY.</p>
      </div>
    );
  }

  const { data: rows, error } = await supabase
    .from("prediction_eval")
    .select("*")
    .order("target_hour", { ascending: false })
    .limit(500);

  if (error) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <h1 className="text-xl font-bold mb-4">Eval: Feil</h1>
        <p className="text-red-500">{error.message}</p>
      </div>
    );
  }

  const evalRows = (rows ?? []) as EvalRow[];
  const withActuals = evalRows.filter((r) => r.actual_volume !== null);
  const pending = evalRows.filter((r) => r.actual_volume === null);

  // --- Core metrics ---
  const totalPredicted = withActuals.reduce((s, r) => s + r.predicted_volume, 0);
  const totalActual = withActuals.reduce((s, r) => s + (r.actual_volume ?? 0), 0);
  const wape =
    totalActual > 0
      ? (
          (withActuals.reduce(
            (s, r) => s + Math.abs(r.predicted_volume - (r.actual_volume ?? 0)),
            0
          ) /
            totalActual) *
          100
        ).toFixed(1)
      : "n/a";
  const mape =
    withActuals.length > 0
      ? (
          withActuals.reduce((s, r) => s + Math.abs(r.error_pct ?? 0), 0) / withActuals.length
        ).toFixed(1)
      : "n/a";
  const totalBias =
    withActuals.length > 0
      ? (
          withActuals.reduce((s, r) => s + (r.signed_error_pct ?? 0), 0) / withActuals.length
        ).toFixed(1)
      : "n/a";

  // --- Baseline-only MAPE (from baseline_volume vs actual) ---
  const baselineOnlyMape =
    withActuals.length > 0
      ? (
          withActuals.reduce((s, r) => {
            const actual = r.actual_volume ?? 0;
            return actual > 0 ? s + (Math.abs(r.baseline_volume - actual) / actual) * 100 : s;
          }, 0) / withActuals.length
        ).toFixed(1)
      : "n/a";

  // --- Per-period breakdown ---
  const periodMap = new Map<string, EvalRow[]>();
  for (const row of withActuals) {
    const h = new Date(row.target_hour).getUTCHours(); // stored as UTC, target_hour is already Oslo-rounded
    const period = classifyPeriod(h);
    if (!periodMap.has(period)) periodMap.set(period, []);
    periodMap.get(period)!.push(row);
  }
  const periodOrder = ["morgen-rush", "midt-dag", "ettermiddag-rush", "kveld", "natt"];
  const periodStats = periodOrder.map((period) => {
    const pRows = periodMap.get(period) ?? [];
    if (pRows.length === 0)
      return { period, n: 0, mape: "n/a", bias: "n/a", baselineMape: "n/a", baselineBias: "n/a" };
    const mape = (pRows.reduce((s, r) => s + Math.abs(r.error_pct ?? 0), 0) / pRows.length).toFixed(
      1
    );
    const bias = (pRows.reduce((s, r) => s + (r.signed_error_pct ?? 0), 0) / pRows.length).toFixed(
      1
    );
    const blMape = (
      pRows.reduce((s, r) => {
        const a = r.actual_volume ?? 0;
        return a > 0 ? s + (Math.abs(r.baseline_volume - a) / a) * 100 : s;
      }, 0) / pRows.length
    ).toFixed(1);
    const blBias = (
      pRows.reduce((s, r) => {
        const a = r.actual_volume ?? 0;
        return a > 0 ? s + ((r.baseline_volume - a) / a) * 100 : s;
      }, 0) / pRows.length
    ).toFixed(1);
    return { period, n: pRows.length, mape, bias, baselineMape: blMape, baselineBias: blBias };
  });

  // --- Per-station MAE ---
  const stationMap = new Map<string, EvalRow[]>();
  for (const row of withActuals) {
    if (!stationMap.has(row.station_id)) stationMap.set(row.station_id, []);
    stationMap.get(row.station_id)!.push(row);
  }
  const stationStats = [...stationMap.entries()].map(([sid, sRows]) => {
    const mae = (sRows.reduce((s, r) => s + Math.abs(r.error_abs ?? 0), 0) / sRows.length).toFixed(
      0
    );
    const mape = (sRows.reduce((s, r) => s + Math.abs(r.error_pct ?? 0), 0) / sRows.length).toFixed(
      1
    );
    const bias = (sRows.reduce((s, r) => s + (r.signed_error_pct ?? 0), 0) / sRows.length).toFixed(
      1
    );
    return { sid, name: stationName(sid), n: sRows.length, mae, mape, bias };
  });

  return (
    <div className="max-w-6xl mx-auto p-6 font-mono text-sm">
      <h1 className="text-xl font-bold mb-1">Prediction Eval</h1>
      <p className="text-xs text-slate-400 mb-6">
        Intern kalibrering. Predicted vs actual for Kanalbrua + RV19.
      </p>

      {/* Top-level summary */}
      <div className="grid grid-cols-5 gap-3 mb-6">
        <div className="bg-slate-50 rounded-lg p-3">
          <p className="text-xs text-slate-400">WAPE</p>
          <p className="text-lg font-bold">{wape}%</p>
          <p className="text-xs text-slate-400">{withActuals.length} matched</p>
        </div>
        <div className="bg-slate-50 rounded-lg p-3">
          <p className="text-xs text-slate-400">MAPE (v2)</p>
          <p className="text-lg font-bold">{mape}%</p>
        </div>
        <div className="bg-slate-50 rounded-lg p-3">
          <p className="text-xs text-slate-400">MAPE (baseline)</p>
          <p className="text-lg font-bold">{baselineOnlyMape}%</p>
        </div>
        <div className="bg-slate-50 rounded-lg p-3">
          <p className="text-xs text-slate-400">Bias (MPE)</p>
          <p className={`text-lg font-bold ${biasColor(parseFloat(totalBias as string))}`}>
            {totalBias !== "n/a" && parseFloat(totalBias as string) > 0 ? "+" : ""}
            {totalBias}%
          </p>
        </div>
        <div className="bg-slate-50 rounded-lg p-3">
          <p className="text-xs text-slate-400">Pending</p>
          <p className="text-lg font-bold">{pending.length}</p>
        </div>
      </div>

      {/* Period breakdown */}
      <h2 className="text-sm font-bold mb-2 text-slate-600">Per tidsperiode</h2>
      <div className="overflow-x-auto mb-6">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b text-left text-slate-400">
              <th className="py-2 pr-3">Periode</th>
              <th className="py-2 pr-2 text-right">n</th>
              <th className="py-2 pr-2 text-right">V2 MAPE</th>
              <th className="py-2 pr-2 text-right">V2 Bias</th>
              <th className="py-2 pr-2 text-right">Baseline MAPE</th>
              <th className="py-2 pr-2 text-right">Baseline Bias</th>
            </tr>
          </thead>
          <tbody>
            {periodStats.map((p) => (
              <tr key={p.period} className="border-b border-slate-100">
                <td className="py-1.5 pr-3 font-medium">{p.period}</td>
                <td className="py-1.5 pr-2 text-right text-slate-400">{p.n}</td>
                <td className={`py-1.5 pr-2 text-right ${errorColor(parseFloat(p.mape))}`}>
                  {p.mape}%
                </td>
                <td className={`py-1.5 pr-2 text-right ${biasColor(parseFloat(p.bias))}`}>
                  {parseFloat(p.bias) > 0 ? "+" : ""}
                  {p.bias}%
                </td>
                <td className={`py-1.5 pr-2 text-right ${errorColor(parseFloat(p.baselineMape))}`}>
                  {p.baselineMape}%
                </td>
                <td className={`py-1.5 pr-2 text-right ${biasColor(parseFloat(p.baselineBias))}`}>
                  {parseFloat(p.baselineBias) > 0 ? "+" : ""}
                  {p.baselineBias}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Per-station MAE */}
      <h2 className="text-sm font-bold mb-2 text-slate-600">Per stasjon</h2>
      <div className="overflow-x-auto mb-6">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b text-left text-slate-400">
              <th className="py-2 pr-3">Stasjon</th>
              <th className="py-2 pr-2 text-right">n</th>
              <th className="py-2 pr-2 text-right">MAE</th>
              <th className="py-2 pr-2 text-right">MAPE</th>
              <th className="py-2 pr-2 text-right">Bias</th>
            </tr>
          </thead>
          <tbody>
            {stationStats.map((s) => (
              <tr key={s.sid} className="border-b border-slate-100">
                <td className="py-1.5 pr-3">{s.name}</td>
                <td className="py-1.5 pr-2 text-right text-slate-400">{s.n}</td>
                <td className="py-1.5 pr-2 text-right">{s.mae}</td>
                <td className={`py-1.5 pr-2 text-right ${errorColor(parseFloat(s.mape))}`}>
                  {s.mape}%
                </td>
                <td className={`py-1.5 pr-2 text-right ${biasColor(parseFloat(s.bias))}`}>
                  {parseFloat(s.bias) > 0 ? "+" : ""}
                  {s.bias}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b text-left text-slate-400">
              <th className="py-2 pr-3">Tid</th>
              <th className="py-2 pr-3">Stasjon</th>
              <th className="py-2 pr-2 text-right">Predicted</th>
              <th className="py-2 pr-2 text-right">Baseline</th>
              <th className="py-2 pr-2 text-right">Actual</th>
              <th className="py-2 pr-2 text-right">Avvik%</th>
              <th className="py-2 pr-2">Ferje</th>
              <th className="py-2 pr-2">Konf.</th>
              <th className="py-2 pr-2">Type</th>
              <th className="py-2">Policy</th>
            </tr>
          </thead>
          <tbody>
            {evalRows.map((row) => {
              const hour = new Date(row.target_hour).toLocaleString("no-NO", {
                timeZone: "Europe/Oslo",
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              });
              return (
                <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-1.5 pr-3 whitespace-nowrap">{hour}</td>
                  <td className="py-1.5 pr-3">{stationName(row.station_id)}</td>
                  <td className="py-1.5 pr-2 text-right">{row.predicted_volume}</td>
                  <td className="py-1.5 pr-2 text-right text-slate-400">{row.baseline_volume}</td>
                  <td className="py-1.5 pr-2 text-right">
                    {row.actual_volume !== null ? (
                      row.actual_volume
                    ) : (
                      <span className="text-slate-300">venter</span>
                    )}
                  </td>
                  <td
                    className={`py-1.5 pr-2 text-right font-medium ${errorColor(row.signed_error_pct)}`}
                  >
                    {row.signed_error_pct !== null
                      ? `${row.signed_error_pct > 0 ? "+" : ""}${row.signed_error_pct}%`
                      : ""}
                  </td>
                  <td className="py-1.5 pr-2">
                    {row.ferry_boost_active ? (
                      <span className="text-blue-500">
                        +{Math.round((row.ferry_boost_factor - 1) * 100)}%
                      </span>
                    ) : (
                      <span className="text-slate-300">-</span>
                    )}
                  </td>
                  <td className="py-1.5 pr-2 text-slate-400">{row.confidence}</td>
                  <td className="py-1.5 pr-2 text-slate-400">{row.day_type}</td>
                  <td className="py-1.5 text-slate-400">
                    {row.final_policy === "v2_residual" ? (
                      <span className="text-violet-500">v2</span>
                    ) : row.final_policy === "baseline_only" ? (
                      <span className="text-slate-400">base</span>
                    ) : (
                      <span className="text-slate-300">-</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {evalRows.length === 0 && (
        <p className="text-center text-slate-400 py-8">
          Ingen snapshots ennå. Trigger POST /api/admin/eval/snapshot for å starte.
        </p>
      )}
    </div>
  );
}
