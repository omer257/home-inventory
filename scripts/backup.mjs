// Exports every table to JSON plus items to CSV. Usage: node backup.mjs <outDir>
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const out = process.argv[2] || "backup";
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_KEY;
if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_KEY are required");

async function fetchAll(table) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const res = await fetch(`${url}/rest/v1/${table}?select=*&order=${table === "allowed_users" ? "email" : "id"}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Range: `${from}-${from + 999}` },
    });
    if (!res.ok) throw new Error(`${table}: HTTP ${res.status} ${await res.text()}`);
    const page = await res.json();
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

const tables = ["locations", "categories", "items", "shopping_extras", "stock_log", "allowed_users"];
mkdirSync(out, { recursive: true });
const data = {};
for (const t of tables) {
  data[t] = await fetchAll(t);
  writeFileSync(join(out, `${t}.json`), JSON.stringify(data[t], null, 2));
}

const loc = new Map(data.locations.map((r) => [r.id, r.name]));
const cat = new Map(data.categories.map((r) => [r.id, r.name]));
const cols = ["name", "category", "location", "quantity", "target_quantity", "package_size", "expiry_date", "notes"];
const cell = (v) => {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const lines = data.items.map((i) =>
  cols.map((c) => cell(c === "category" ? cat.get(i.category_id) : c === "location" ? loc.get(i.location_id) : i[c])).join(",")
);
writeFileSync(join(out, "items.csv"), "﻿" + [cols.join(","), ...lines].join("\n"));
console.log(Object.entries(data).map(([t, r]) => `${t}: ${r.length}`).join(", "));
