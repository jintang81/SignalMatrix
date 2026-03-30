/** Number and date formatting utilities */

export function formatPrice(n: number | null | undefined, decimals = 2): string {
  if (n == null || isNaN(n)) return "—";
  return "$" + n.toFixed(decimals);
}

export function formatLargeNum(n: number | null | undefined, decimals = 2): string {
  if (n == null || isNaN(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e12) return "$" + (n / 1e12).toFixed(decimals) + "T";
  if (abs >= 1e9) return "$" + (n / 1e9).toFixed(decimals) + "B";
  if (abs >= 1e6) return "$" + (n / 1e6).toFixed(decimals) + "M";
  if (abs >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
  return "$" + n.toFixed(decimals);
}

export function formatPct(
  n: number | null | undefined,
  decimals = 2,
  alreadyPercent = false
): string {
  if (n == null || isNaN(n)) return "—";
  const val = alreadyPercent ? n : n * 100;
  const sign = val >= 0 ? "+" : "";
  return `${sign}${val.toFixed(decimals)}%`;
}

export function formatNum(n: number | null | undefined, decimals = 2): string {
  if (n == null || isNaN(n)) return "—";
  return n.toFixed(decimals);
}

export function formatVol(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "—";
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return String(n);
}

export function timeAgo(unixTs: number): string {
  const diff = Date.now() / 1000 - unixTs;
  if (diff < 3600) return Math.floor(diff / 60) + "m ago";
  if (diff < 86400) return Math.floor(diff / 3600) + "h ago";
  return new Date(unixTs * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/** Extract raw number from Yahoo Finance {raw, fmt} wrapper */
export function raw(v: { raw: number } | undefined | null): number | null {
  if (v == null) return null;
  const n = v.raw;
  return isFinite(n) ? n : null;
}
