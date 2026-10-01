const numberFormat = new Intl.NumberFormat("en-US");
const currencyFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});
const dateTimeFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/** `1240` → `1,240 pts` */
export function formatPoints(points: number): string {
  return `${numberFormat.format(Math.abs(points))} pts`;
}

export function formatNumber(value: number): string {
  return numberFormat.format(value);
}

export function formatPercent(fraction: number, digits = 0): string {
  return `${(fraction * 100).toFixed(digits)}%`;
}

/** `9` → `$9.00` */
export function formatMoney(amount: number, currency = "USD"): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(amount);
  } catch {
    return currencyFormat.format(amount);
  }
}

/** `2026-09-14` → `Sep 14, 2026` */
export function formatDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : dateFormat.format(date);
}

/**
 * A stored timestamp as the local calendar day (`2026-10-01`) — the shape
 * `formatDate` takes. Slicing an ISO string instead would print UTC's day,
 * which is the previous evening for anyone east of Greenwich.
 */
export function localDay(value: Date): string {
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

/** `2026-09-28T09:14:00` → `Sep 28, 9:14 AM` */
export function formatDateTime(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime())
    ? String(value)
    : dateTimeFormat.format(date);
}

/** Signed display for ledger-style values: `+45 pts`, `-300 pts`. */
export function formatSignedPoints(points: number): string {
  const sign = points < 0 ? "-" : "+";
  return `${sign}${numberFormat.format(Math.abs(points))} pts`;
}
