import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";
import Nav from "@/components/nav";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-poppins",
});

export const metadata: Metadata = {
  title: "Moss Trafikk – Kanalbrua og korridoren",
  description:
    "Smart trafikkanslag for Moss-korridoren. Er det smart å kjøre nå, eller lønner det seg å vente?",
  openGraph: {
    title: "Moss Trafikk",
    description: "Er det smart å kjøre nå?",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nb" className={poppins.variable}>
      <head>
        {process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN && (
          <script
            defer
            data-domain={process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN}
            src="https://plausible.io/js/script.js"
          />
        )}
      </head>
      <body className={`${poppins.className} bg-slate-50 text-slate-900 antialiased`}>
        <Nav />
        <main className="min-h-screen">{children}</main>
        <footer className="border-t border-slate-200 py-6 text-center text-xs text-slate-400">
          Data: Statens vegvesen og Entur ·{" "}
          <a href="/om" className="underline">
            Slik fungerer det
          </a>
        </footer>
      </body>
    </html>
  );
}
