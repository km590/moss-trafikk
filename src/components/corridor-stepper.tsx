import { CongestionLevel, StationStatus } from "@/lib/types";
import { CORRIDOR_NODES } from "@/lib/stations";
import { getCongestionLabel } from "@/lib/traffic-logic";

interface CorridorStepperProps {
  statuses: StationStatus[];
}

const CONGESTION_ORDER: CongestionLevel[] = ["unknown", "green", "yellow", "orange", "red"];

function worstCongestion(levels: CongestionLevel[]): CongestionLevel {
  if (levels.length === 0) return "green";
  return levels.reduce((worst, current) =>
    CONGESTION_ORDER.indexOf(current) > CONGESTION_ORDER.indexOf(worst) ? current : worst
  );
}

function circleClass(level: CongestionLevel | null): string {
  switch (level) {
    case "green":
      return "bg-emerald-500";
    case "yellow":
      return "bg-amber-400";
    case "orange":
      return "bg-orange-500";
    case "red":
      return "bg-red-500";
    case "unknown":
      return "bg-slate-300";
    default:
      return "bg-slate-300";
  }
}

function lineClass(level: CongestionLevel | null): string {
  switch (level) {
    case "green":
      return "bg-emerald-500";
    case "yellow":
      return "bg-amber-400";
    case "orange":
      return "bg-orange-500";
    case "red":
      return "bg-red-500";
    case "unknown":
      return "bg-slate-300";
    default:
      return "bg-slate-300";
  }
}

function getLabelForLevel(level: CongestionLevel | null): string {
  if (level === null) return "Ukjent status";
  if (level === "unknown") return "Ukjent status";
  return getCongestionLabel(level);
}

export default function CorridorStepper({ statuses }: CorridorStepperProps) {
  const nodeData = CORRIDOR_NODES.map((node) => {
    const matchingStatuses = statuses.filter((s) =>
      (node.stationIds as readonly string[]).includes(s.station.id)
    );
    const levels = matchingStatuses.map((s) => s.congestion);
    const level: CongestionLevel | null = levels.length > 0 ? worstCongestion(levels) : null;
    return { label: node.label, level };
  });

  return (
    <>
      {/* Mobile: vertical list */}
      <div className="flex flex-col gap-0 sm:hidden px-2 py-4">
        {nodeData.map((node, index) => {
          const isLast = index === nodeData.length - 1;
          const statusLabel = getLabelForLevel(node.level);

          return (
            <div key={node.label}>
              <div className="flex items-center gap-3">
                <div
                  className={`h-6 w-6 rounded-full shrink-0 ${circleClass(node.level)}`}
                  aria-label={statusLabel}
                />
                <span className="text-sm font-medium text-slate-800 flex-1">{node.label}</span>
                <span className="text-xs text-muted-foreground">{statusLabel}</span>
              </div>
              {!isLast && (
                <div className="ml-3 w-px h-4 bg-slate-200 my-0.5" />
              )}
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
          const statusLabel = getLabelForLevel(node.level);

          return (
            <div key={node.label} className={`flex items-start ${isLast ? "" : "flex-1"}`}>
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className={`h-8 w-8 rounded-full shrink-0 ${circleClass(node.level)}`}
                  aria-label={statusLabel}
                />
                <span className="text-xs text-center text-muted-foreground leading-tight max-w-[64px]">
                  {node.label}
                </span>
              </div>
              {!isLast && (
                <div
                  className={`mt-3.5 h-1 flex-1 min-w-2 mx-1 ${lineClass(connectorLevel)}`}
                />
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
