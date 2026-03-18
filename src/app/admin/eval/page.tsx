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

interface EvalRow {
  id: string;
  station_id: string;
  target_hour: string;
  predicted_volume: number;
  baseline_volume: number;
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
    .limit(200);

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

  // Summary stats
  const mape =
    withActuals.length > 0
      ? (
          withActuals.reduce((s, r) => s + Math.abs(r.error_pct ?? 0), 0) / withActuals.length
        ).toFixed(1)
      : "n/a";
  const ferryRows = withActuals.filter((r) => r.ferry_boost_active);
  const baselineRows = withActuals.filter((r) => !r.ferry_boost_active);
  const ferryMape =
    ferryRows.length > 0
      ? (ferryRows.reduce((s, r) => s + Math.abs(r.error_pct ?? 0), 0) / ferryRows.length).toFixed(
          1
        )
      : "n/a";
  const baselineMape =
    baselineRows.length > 0
      ? (
          baselineRows.reduce((s, r) => s + Math.abs(r.error_pct ?? 0), 0) / baselineRows.length
        ).toFixed(1)
      : "n/a";

  return (
    <div className="max-w-6xl mx-auto p-6 font-mono text-sm">
      <h1 className="text-xl font-bold mb-1">Prediction Eval</h1>
      <p className="text-xs text-slate-400 mb-6">
        Intern kalibrering. Predicted vs actual for Kanalbrua + RV19.
      </p>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-slate-50 rounded-lg p-3">
          <p className="text-xs text-slate-400">Total MAPE</p>
          <p className="text-lg font-bold">{mape}%</p>
          <p className="text-xs text-slate-400">{withActuals.length} matched</p>
        </div>
        <div className="bg-slate-50 rounded-lg p-3">
          <p className="text-xs text-slate-400">Baseline MAPE</p>
          <p className="text-lg font-bold">{baselineMape}%</p>
          <p className="text-xs text-slate-400">{baselineRows.length} rows</p>
        </div>
        <div className="bg-blue-50 rounded-lg p-3">
          <p className="text-xs text-blue-400">Ferry boost MAPE</p>
          <p className="text-lg font-bold">{ferryMape}%</p>
          <p className="text-xs text-blue-400">{ferryRows.length} rows</p>
        </div>
        <div className="bg-slate-50 rounded-lg p-3">
          <p className="text-xs text-slate-400">Pending actuals</p>
          <p className="text-lg font-bold">{pending.length}</p>
        </div>
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
              <th className="py-2">Type</th>
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
                  <td className="py-1.5 text-slate-400">{row.day_type}</td>
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
