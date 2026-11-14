"use client";
import { useEffect, useState } from "react";
import { CSV_COLUMNS, isValidDate, parseCsv, toCsv, todayStr } from "@/lib/logic";
import { supabase } from "@/lib/supabase";
import type { Store } from "@/lib/useStore";

function NamedEditor({ store, table, title }: { store: Store; table: "locations" | "categories"; title: string }) {
  const list = table === "locations" ? store.locations : store.categories;
  const [name, setName] = useState("");
  return (
    <div className="card stack">
      <h3>{title}</h3>
      <ul className="list">
        {list.map((n) => (
          <li key={n.id} className="row">
            <input defaultValue={n.name} onBlur={(e) => e.target.value.trim() && e.target.value !== n.name && store.saveNamed(table, e.target.value.trim(), n.id)} />
            <button className="ghost small" onClick={() => store.deleteNamed(table, n.id)}>מחק</button>
          </li>
        ))}
      </ul>
      <form className="toolbar" onSubmit={(e) => { e.preventDefault(); if (name.trim()) { store.saveNamed(table, name.trim()); setName(""); } }}>
        <input placeholder="חדש" value={name} onChange={(e) => setName(e.target.value)} />
        <button>הוסף</button>
      </form>
      <p className="hint">מחיקה לא מוחקת פריטים, רק משאירה אותם בלי {table === "locations" ? "מיקום" : "קטגוריה"}.</p>
    </div>
  );
}

function Members() {
  const [list, setList] = useState<string[] | null>(null);
  const [me, setMe] = useState("");
  const [email, setEmail] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);

  async function load() {
    const [{ data, error }, u] = await Promise.all([
      supabase.from("allowed_users").select("email").order("email"),
      supabase.auth.getUser(),
    ]);
    if (error) setErr(error.message);
    setList((data ?? []).map((r) => r.email as string));
    setMe((u.data.user?.email ?? "").toLowerCase());
  }
  useEffect(() => { load(); }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const v = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return setErr("כתובת אימייל לא תקינה");
    setErr(null);
    const { error } = await supabase.from("allowed_users").insert({ email: v });
    if (error) return setErr(error.code === "23505" ? "הכתובת כבר ברשימה" : error.message);
    setEmail("");
    load();
  }

  async function remove(v: string) {
    if (confirm !== v) return setConfirm(v);
    setConfirm(null);
    const { error } = await supabase.from("allowed_users").delete().eq("email", v);
    if (error) return setErr(error.message);
    load();
  }

  return (
    <div className="card stack">
      <h3>חברי הבית</h3>
      <p className="hint">מי שברשימה נכנס עם חשבון Google שלו ורואה את אותו מלאי. מי שלא ברשימה לא רואה כלום.</p>
      <ul className="list">
        {(list ?? []).map((m) => (
          <li key={m} className="row">
            <span className="row-main"><bdi dir="ltr">{m}</bdi>{m === me && <small> (אני)</small>}</span>
            {m !== me && (
              <button className="ghost small" onClick={() => remove(m)}>
                {confirm === m ? "ללחוץ שוב להסרה" : "הסר"}
              </button>
            )}
          </li>
        ))}
      </ul>
      <form className="toolbar" onSubmit={add}>
        <input type="email" dir="ltr" placeholder="name@gmail.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <button>הזמן</button>
      </form>
      {err && <p className="error">{err}</p>}
    </div>
  );
}

type Preview ={ rows: Record<string, string>[]; errors: string[]; creates: number; updates: number };

export default function Settings({ store }: { store: Store }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function exportCsv() {
    const loc = new Map(store.locations.map((l) => [l.id, l.name]));
    const cat = new Map(store.categories.map((c) => [c.id, c.name]));
    const rows = store.items.map((i) => ({
      ...i,
      location: i.location_id ? loc.get(i.location_id) : "",
      category: i.category_id ? cat.get(i.category_id) : "",
    }));
    const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `inventory-${todayStr()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function onFile(f: File) {
    const rows = parseCsv(await f.text());
    const errors: string[] = [];
    const names = new Set<string>();
    rows.forEach((r, k) => {
      const line = k + 2;
      if (!r.name) errors.push(`שורה ${line}: חסר שם`);
      const key = (r.name || "").toLowerCase();
      if (names.has(key)) errors.push(`שורה ${line}: "${r.name}" מופיע פעמיים`);
      names.add(key);
      for (const f of ["quantity", "target_quantity"]) {
        if (r[f] && !(Number(r[f]) >= 0)) errors.push(`שורה ${line}: ${f} לא מספר`);
      }
      if (r.expiry_date && !isValidDate(r.expiry_date)) errors.push(`שורה ${line}: תאריך לא בפורמט YYYY-MM-DD`);
    });
    const existing = new Set(store.items.map((i) => i.name.toLowerCase()));
    const updates = rows.filter((r) => existing.has((r.name || "").toLowerCase())).length;
    setPreview({ rows, errors, updates, creates: rows.length - updates });
  }

  async function runImport() {
    if (!preview || preview.errors.length) return;
    setBusy(true);
    let done = 0;
    for (const r of preview.rows) {
      const location_id = r.location ? await store.ensureNamed("locations", r.location) : null;
      const category_id = r.category ? await store.ensureNamed("categories", r.category) : null;
      const data: Record<string, unknown> = { name: r.name.trim() };
      if (r.location !== undefined && r.location !== "") data.location_id = location_id;
      if (r.category !== undefined && r.category !== "") data.category_id = category_id;
      if (r.quantity) data.quantity = Number(r.quantity);
      if (r.target_quantity) data.target_quantity = Number(r.target_quantity);
      if (r.package_size) data.package_size = r.package_size;
      if (r.expiry_date) data.expiry_date = r.expiry_date;
      if (r.notes) data.notes = r.notes;
      const ex = store.items.find((i) => i.name.toLowerCase() === r.name.trim().toLowerCase());
      const res = ex
        ? await supabase.from("items").update(data).eq("id", ex.id)
        : await supabase.from("items").insert(data);
      if (res.error) { setMsg(`נעצר בשורה של "${r.name}": ${res.error.message}`); break; }
      done++;
    }
    await store.reload();
    setBusy(false);
    setPreview(null);
    setMsg((m) => m ?? `יובאו ${done} פריטים`);
  }

  return (
    <section className="stack">
      <div className="card stack">
        <h3>ייבוא וייצוא</h3>
        <button onClick={exportCsv}>ייצוא CSV</button>
        <label className="file">ייבוא CSV
          <input type="file" accept=".csv,text/csv" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        </label>
        <p className="hint">עמודות: {CSV_COLUMNS.join(", ")}. שורה עם שם קיים מעדכנת את הפריט הקיים.</p>
        {preview && (
          <div className="stack">
            <p>{preview.creates} חדשים, {preview.updates} עדכונים.</p>
            {preview.errors.length > 0 && <ul className="error">{preview.errors.slice(0, 10).map((e) => <li key={e}>{e}</li>)}</ul>}
            <div className="actions">
              <button className="primary" disabled={busy || preview.errors.length > 0} onClick={runImport}>{busy ? "מייבא…" : "ייבוא"}</button>
              <button className="ghost" onClick={() => setPreview(null)}>ביטול</button>
            </div>
          </div>
        )}
        {msg && <p className="hint">{msg}</p>}
      </div>
      <Members />
      <NamedEditor store={store} table="locations" title="מיקומים" />
      <NamedEditor store={store} table="categories" title="קטגוריות" />
      <button className="ghost" onClick={() => supabase.auth.signOut()}>יציאה מהחשבון</button>
    </section>
  );
}
