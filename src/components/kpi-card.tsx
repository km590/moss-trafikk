import { CongestionLevel } from "@/lib/types";
import { getCongestionColor } from "@/lib/traffic-logic";
import { Card, CardContent } from "@/components/ui/card";

interface KpiCardProps {
  title: string;
  value: string;
  subtitle?: string;
  congestion: CongestionLevel;
  icon?: React.ReactNode;
}

function getBorderColor(level: CongestionLevel): string {
  switch (level) {
    case "green":
      return "border-l-emerald-500";
    case "yellow":
      return "border-l-amber-400";
    case "orange":
      return "border-l-orange-500";
    case "red":
      return "border-l-red-500";
  }
}

export default function KpiCard({ title, value, subtitle, congestion, icon }: KpiCardProps) {
  const borderColor = getBorderColor(congestion);
  const dotColor = getCongestionColor(congestion);

  return (
    <Card className={`border-l-4 ${borderColor}`}>
      <CardContent className="flex items-start gap-3">
        {icon && <div className="mt-0.5 text-muted-foreground">{icon}</div>}
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground mb-1">{title}</p>
          <p className="text-2xl font-bold leading-none">{value}</p>
          {subtitle && (
            <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
          )}
        </div>
        <div className={`mt-1 h-2.5 w-2.5 rounded-full shrink-0 ${dotColor}`} />
      </CardContent>
    </Card>
  );
}
