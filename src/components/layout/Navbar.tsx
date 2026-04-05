"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, useRef } from "react";

const NAV_ITEMS = [
  { label: "QUERY", href: "/stock-query" },
  { label: "INDICATORS", href: "/indicators" },
  { label: "SCREENERS", href: "/screeners" },
] as const;

export default function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Close on route change
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div ref={menuRef} className="sticky top-0 z-50">
      <nav
        className="h-14"
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

          {/* ── Desktop nav links ── */}
          <div className="hidden md:flex items-center gap-0.5">
            {NAV_ITEMS.map(({ label, href }) => {
              const isActive = pathname === href || pathname.startsWith(href + "/");
              return (
                <Link
                  key={href}
                  href={href}
                  className={[
                    "relative px-3 py-1 text-xs tracking-[0.14em] transition-colors duration-200 rounded",
                    isActive ? "text-txt" : "text-muted hover:text-txt",
                  ].join(" ")}
                >
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

          {/* ── Live market status (desktop) ── */}
          <div className="hidden md:flex items-center gap-2 text-xs text-muted select-none">
            <span
              className="w-1.5 h-1.5 rounded-full bg-up"
              style={{
                boxShadow: "0 0 5px #26a69a80",
                animation: "pulse-dot 2.4s ease-in-out infinite",
              }}
            />
            <span className="tracking-[0.18em]">NYSE · NASDAQ</span>
          </div>

          {/* ── Hamburger button (mobile only) ── */}
          <button
            className="md:hidden flex flex-col justify-center items-center w-10 h-10 gap-1.5 rounded text-muted hover:text-txt transition-colors -mr-1"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "关闭菜单" : "打开菜单"}
            aria-expanded={open}
          >
            <span
              className="block w-5 h-px bg-current transition-all duration-200 origin-center"
              style={open ? { transform: "translateY(4px) rotate(45deg)" } : {}}
            />
            <span
              className="block w-5 h-px bg-current transition-all duration-200"
              style={open ? { opacity: 0 } : {}}
            />
            <span
              className="block w-5 h-px bg-current transition-all duration-200 origin-center"
              style={open ? { transform: "translateY(-4px) rotate(-45deg)" } : {}}
            />
          </button>
        </div>
      </nav>

      {/* ── Mobile dropdown ── */}
      {open && (
        <div
          className="md:hidden absolute inset-x-0"
          style={{
            background: "#0f1826",
            borderBottom: "1px solid #2e3a50",
          }}
        >
          <div className="max-w-7xl mx-auto px-6 py-2">
            {NAV_ITEMS.map(({ label, href }) => {
              const isActive = pathname === href || pathname.startsWith(href + "/");
              return (
                <Link
                  key={href}
                  href={href}
                  className={[
                    "flex items-center gap-3 py-3 text-xs tracking-[0.18em] border-b border-border/30 last:border-0",
                    isActive ? "text-txt" : "text-muted",
                  ].join(" ")}
                >
                  <span
                    className="w-1 h-3 rounded-full shrink-0"
                    style={{ background: isActive ? "#26a69a" : "transparent" }}
                  />
                  {label}
                </Link>
              );
            })}
            <div className="flex items-center gap-2 py-3 text-xs text-muted/40 select-none">
              <span
                className="w-1.5 h-1.5 rounded-full bg-up shrink-0"
                style={{
                  boxShadow: "0 0 5px #26a69a80",
                  animation: "pulse-dot 2.4s ease-in-out infinite",
                }}
              />
              <span className="tracking-[0.14em]">NYSE · NASDAQ</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
