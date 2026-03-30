"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { label: "QUERY", href: "/stock-query" },
  { label: "INDICATORS", href: "/indicators" },
  { label: "SCREENERS", href: "/screeners" },
] as const;

export default function Navbar() {
  const pathname = usePathname();

  return (
    <nav
      className="sticky top-0 z-50 h-14"
      style={{
        background: "linear-gradient(180deg, #0f1826 0%, #0c1018 100%)",
        borderBottom: "1px solid #2e3a50",
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-full flex items-center gap-6">
        {/* ── Logo ── */}
        <Link
          href="/"
          className="shrink-0 text-sm tracking-[0.28em] text-gold font-normal select-none"
        >
          SIGNAL
          <span className="text-border mx-1.5">·</span>
          MATRIX
        </Link>

        {/* ── Divider ── */}
        <div className="h-4 w-px bg-border shrink-0" />

        {/* ── Nav links ── */}
        <div className="flex items-center gap-0.5">
          {NAV_ITEMS.map(({ label, href }) => {
            const isActive = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                className={[
                  "relative px-3 py-1 text-xs tracking-[0.14em] transition-colors duration-200 rounded",
                  isActive
                    ? "text-txt"
                    : "text-muted hover:text-txt",
                ].join(" ")}
              >
                {/* Active underline */}
                {isActive && (
                  <span
                    className="absolute bottom-0 inset-x-3 h-px bg-up"
                    style={{ bottom: "-1px" }}
                  />
                )}
                {label}
              </Link>
            );
          })}
        </div>

        {/* ── Spacer ── */}
        <div className="flex-1" />

        {/* ── Live market status ── */}
        <div className="flex items-center gap-2 text-xs text-muted select-none">
          <span
            className="w-1.5 h-1.5 rounded-full bg-up"
            style={{
              boxShadow: "0 0 5px #26a69a80",
              animation: "pulse-dot 2.4s ease-in-out infinite",
            }}
          />
          <span className="tracking-[0.18em] hidden sm:inline">NYSE · NASDAQ</span>
        </div>
      </div>
    </nav>
  );
}
