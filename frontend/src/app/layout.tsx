import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hydrant Halo",
  description: "Real-time smart fire hydrant monitoring",
};

const nav = [
  { href: "/", label: "Map" },
  { href: "/incidents", label: "Incidents" },
  { href: "/tasks", label: "Tasks" },
  { href: "/verify", label: "Verify" },
  { href: "/rewards", label: "Rewards" },
  { href: "/analytics", label: "Analytics" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="flex h-full flex-col">
        <header className="flex items-center gap-6 border-b border-halo-border bg-halo-panel px-4 py-2">
          <span className="font-semibold tracking-wide text-halo-accent">HYDRANT HALO</span>
          <nav className="flex gap-4 text-sm">
            {nav.map((n) => (
              <Link key={n.href} href={n.href} className="text-slate-400 hover:text-white">
                {n.label}
              </Link>
            ))}
          </nav>
        </header>
        <main className="flex-1 overflow-hidden">{children}</main>
      </body>
    </html>
  );
}
