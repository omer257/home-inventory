export type Item = {
  id: number;
  name: string;
  aliases: string[];
  category_id: number | null;
  location_id: number | null;
  quantity: number;
  target_quantity: number;
  package_size: string | null;
  expiry_date: string | null;
  opened_at: string | null;
  open_shelf_days: number | null;
  notes: string | null;
  cook_soon?: boolean;
  updated_at: string;
};

export type Named = { id: number; name: string; sort_order: number };

export type Extra = {
  id: number;
  name: string;
  quantity: number;
  item_id: number | null;
  checked: boolean;
};

const DAY = 86400000;

function parseDate(d: string): Date {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day);
}

export function todayStr(): string {
  const d = new Date();
  return toDateStr(d);
}

export function toDateStr(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Earlier of printed expiry and opened_at + open_shelf_days. */
export function effectiveExpiry(it: Item): string | null {
  const candidates: string[] = [];
  if (it.expiry_date) candidates.push(it.expiry_date);
  if (it.opened_at && it.open_shelf_days) {
    const d = parseDate(it.opened_at);
    d.setDate(d.getDate() + it.open_shelf_days);
    candidates.push(toDateStr(d));
  }
  if (!candidates.length) return null;
  return candidates.sort()[0];
}

export function daysLeft(it: Item): number | null {
  const e = effectiveExpiry(it);
  if (!e) return null;
  return Math.round((parseDate(e).getTime() - parseDate(todayStr()).getTime()) / DAY);
}

export type ExpiryStatus = "expired" | "soon" | "week" | "ok" | "none";

export function expiryStatus(it: Item): ExpiryStatus {
  if (Number(it.quantity) <= 0) return "none";
  const d = daysLeft(it);
  if (d === null) return "none";
  if (d < 0) return "expired";
  if (d <= 3) return "soon";
  if (d <= 7) return "week";
  return "ok";
}

export function isLow(it: Item): boolean {
  return Number(it.target_quantity) > 0 && Number(it.quantity) < Number(it.target_quantity);
}

export function toBuy(it: Item): number {
  return Math.max(0, Math.ceil(Number(it.target_quantity) - Number(it.quantity)));
}

export function fmtQty(n: number): string {
  const v = Number(n);
  return Number.isInteger(v) ? String(v) : v.toFixed(1).replace(/\.0$/, "");
}

export function expiryLabel(it: Item): string {
  const d = daysLeft(it);
  if (d === null) return "";
  if (d < 0) return `פג לפני ${-d} ימים`;
  if (d === 0) return "פג היום";
  if (d === 1) return "פג מחר";
  return `עוד ${d} ימים`;
}

/* ---------- CSV ---------- */

export const CSV_COLUMNS = [
  "name",
  "category",
  "location",
  "quantity",
  "target_quantity",
  "package_size",
  "expiry_date",
  "open_shelf_days",
  "notes",
] as const;

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: Record<string, unknown>[]): string {
  const head = CSV_COLUMNS.join(",");
  const body = rows.map((r) => CSV_COLUMNS.map((c) => csvCell(r[c])).join(","));
  return "﻿" + [head, ...body].join("\n");
}

export function parseCsv(text: string): Record<string, string>[] {
  const src = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (q) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  const nonEmpty = rows.filter((r) => r.some((c) => c.trim() !== ""));
  if (!nonEmpty.length) return [];
  const header = nonEmpty[0].map((h) => h.trim().toLowerCase());
  return nonEmpty.slice(1).map((r) => {
    const o: Record<string, string> = {};
    header.forEach((h, i) => (o[h] = (r[i] ?? "").trim()));
    return o;
  });
}

export function isValidDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = parseDate(s);
  return toDateStr(d) === s;
}
