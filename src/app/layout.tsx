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
  description: "Trafikkstatus for Kanalbrua, Rv19 og E6 i Moss. Historisk avviksbasert analyse for pendlere.",
  openGraph: {
    title: "Moss Trafikk",
    description: "Bør du kjøre nå eller vente?",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nb" className={poppins.variable}>
      <head>
        <meta httpEquiv="refresh" content="300" />
      </head>
      <body className={`${poppins.className} bg-slate-50 text-slate-900 antialiased`}>
        <Nav />
        <main className="min-h-screen">
          {children}
        </main>
        <footer className="border-t border-slate-200 py-6 text-center text-xs text-slate-400">
          Data: Statens vegvesen Trafikkdata API · Inspirert av <a href="https://synaro.no/jeloytrafikk" className="underline" target="_blank" rel="noopener">Jeløy Trafikk</a> av Synaro · <a href="/om" className="underline">Om tjenesten</a>
        </footer>
      </body>
    </html>
  );
}
