import { CongestionLevel, StationStatus } from "@/lib/types";
import { CORRIDOR_NODES } from "@/lib/stations";
import { getCongestionLabel } from "@/lib/traffic-logic";

interface CorridorStepperProps {
  statuses: StationStatus[];
}

const CONGESTION_ORDER: CongestionLevel[] = ["unknown", "green", "yellow", "red"];

function worstCongestion(levels: CongestionLevel[]): CongestionLevel {
  if (levels.length === 0) return "green";
  return levels.reduce((worst, current) =>
    CONGESTION_ORDER.indexOf(current) > CONGESTION_ORDER.indexOf(worst) ? current : worst
  );
}

function circleColor(level: CongestionLevel | null): string {
  switch (level) {
    case "green":
      return "bg-emerald-500";
    case "yellow":
      return "bg-amber-400";
    case "red":
      return "bg-red-500";
    case "unknown":
      return "bg-slate-300";
    default:
      return "bg-slate-300";
  }
}

function lineColor(level: CongestionLevel | null): string {
  switch (level) {
    case "green":
      return "bg-emerald-500";
    case "yellow":
      return "bg-amber-400";
    case "red":
      return "bg-red-500";
    case "unknown":
      return "bg-slate-300";
    default:
      return "bg-slate-300";
  }
}

function getLabelForLevel(level: CongestionLevel | null, isEstimate: boolean): string {
  if (level === null || level === "unknown") return "Ukjent status";
  if (!isEstimate) return getCongestionLabel(level);
  // Estimate mode: passability labels
  switch (level) {
    case "green":
      return "Ser rolig ut";
    case "yellow":
      return "Ser travelt ut";
    case "red":
      return "Kø sannsynlig";
    default:
      return "Ukjent";
  }
}

export default function CorridorStepper({ statuses }: CorridorStepperProps) {
  const nodeData = CORRIDOR_NODES.map((node) => {
    const matchingStatuses = statuses.filter((s) =>
      (node.stationIds as readonly string[]).includes(s.station.id)
    );
    const levels = matchingStatuses.map((s) => s.congestion);
    const level: CongestionLevel | null = levels.length > 0 ? worstCongestion(levels) : null;
    const isEstimate = matchingStatuses.length > 0 && matchingStatuses.every((s) => s.isEstimate);
    return { label: node.label, level, isEstimate };
  });

  return (
    <>
      {/* Mobile: vertical list */}
      <div className="flex flex-col gap-0 sm:hidden px-2 py-4">
        {nodeData.map((node, index) => {
          const isLast = index === nodeData.length - 1;
          const statusLabel = getLabelForLevel(node.level, node.isEstimate);

          return (
            <div key={node.label}>
              <div className="flex items-center gap-3">
                <div
                  className={`h-6 w-6 rounded-full shrink-0 ${circleColor(node.level)} ${
                    node.isEstimate ? "opacity-50 ring-1 ring-dashed ring-slate-400" : ""
                  }`}
                  aria-label={statusLabel}
                />
                <span className="text-sm font-medium text-slate-800 flex-1">{node.label}</span>
                <span
                  className={`text-xs ${node.isEstimate ? "text-slate-400 italic" : "text-muted-foreground"}`}
                >
                  {statusLabel}
                </span>
              </div>
              {!isLast && <div className="ml-3 w-px h-4 bg-slate-200 my-0.5" />}
            </div>
          );
        })}
      </div>

      {/* Desktop: horizontal layout */}
      <div className="hidden sm:flex items-start justify-between w-full px-2 py-4">
        {nodeData.map((node, index) => {
          const isLast = index === nodeData.length - 1;
          const nextNode = nodeData[index + 1] ?? null;
          const connectorLevel =
            node.level !== null && nextNode !== null && nextNode.level !== null
              ? worstCongestion([node.level, nextNode.level])
              : null;
          const statusLabel = getLabelForLevel(node.level, node.isEstimate);
          const connectorEstimate = node.isEstimate || (nextNode?.isEstimate ?? false);

          return (
            <div key={node.label} className={`flex items-start ${isLast ? "" : "flex-1"}`}>
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className={`h-8 w-8 rounded-full shrink-0 ${circleColor(node.level)} ${
                    node.isEstimate ? "opacity-50 ring-2 ring-offset-1 ring-slate-300" : ""
                  }`}
                  aria-label={statusLabel}
                />
                <span className="text-xs text-center text-muted-foreground leading-tight max-w-[64px]">
                  {node.label}
                </span>
              </div>
              {!isLast && (
                <div
                  className={`mt-3.5 h-1 flex-1 min-w-2 mx-1 ${lineColor(connectorLevel)} ${
                    connectorEstimate ? "opacity-40" : ""
                  }`}
                  style={
                    connectorEstimate
                      ? {
                          backgroundImage:
                            "repeating-linear-gradient(90deg, transparent, transparent 4px, white 4px, white 8px)",
                        }
                      : undefined
                  }
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Estimate notice */}
      {nodeData.some((n) => n.isEstimate) && (
        <p className="text-[11px] text-slate-400 text-center -mt-2 mb-1">
          Estimert ut fra hvordan trafikken vanligvis er på dette tidspunktet
        </p>
      )}
    </>
  );
}
