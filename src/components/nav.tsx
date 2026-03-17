import Link from "next/link";
import { Badge } from "@/components/ui/badge";

export default function Nav() {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-white">
      <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <Link href="/" className="text-base font-bold text-foreground">
            Moss Trafikk
          </Link>
          <Badge variant="secondary">BETA</Badge>
        </div>
        <nav>
          <Link
            href="/om"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Om
          </Link>
        </nav>
      </div>
    </header>
  );
}
