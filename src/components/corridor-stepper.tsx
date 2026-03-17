import { CongestionLevel, StationStatus } from "@/lib/types";
import { CORRIDOR_NODES } from "@/lib/stations";

interface CorridorStepperProps {
  statuses: StationStatus[];
}

const CONGESTION_ORDER: CongestionLevel[] = ["green", "yellow", "orange", "red"];

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
    default:
      return "bg-gray-300";
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
    default:
      return "bg-gray-300";
  }
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
    <div className="overflow-x-auto">
      <div className="flex items-start min-w-max px-2 py-4">
        {nodeData.map((node, index) => {
          const isLast = index === nodeData.length - 1;
          const nextNode = nodeData[index + 1] ?? null;
          const connectorLevel =
            node.level !== null && nextNode !== null && nextNode.level !== null
              ? worstCongestion([node.level, nextNode.level])
              : null;

          return (
            <div key={node.label} className="flex items-start">
              <div className="flex flex-col items-center gap-2">
                <div
                  className={`h-8 w-8 rounded-full shrink-0 ${circleClass(node.level)}`}
                />
                <span className="text-xs text-center text-muted-foreground w-16 leading-tight">
                  {node.label}
                </span>
              </div>
              {!isLast && (
                <div
                  className={`mt-3.5 h-1 w-12 shrink-0 ${lineClass(connectorLevel)}`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
