"use client";
import { useState } from "react";
import { Item, isValidDate, todayStr } from "@/lib/logic";
import type { Store } from "@/lib/useStore";

type Props = { store: Store; item?: Item | null; defaults?: Partial<Item>; onClose: () => void };

export default function ItemForm({ store, item, defaults, onClose }: Props) {
  const base = item ?? defaults ?? {};
  const [name, setName] = useState(base.name ?? "");
  const [locationId, setLocationId] = useState<string>(String(base.location_id ?? store.locations[0]?.id ?? ""));
  const [categoryId, setCategoryId] = useState<string>(String(base.category_id ?? ""));
  const [quantity, setQuantity] = useState(String(base.quantity ?? 1));
  const [target, setTarget] = useState(String(base.target_quantity ?? 0));
  const [size, setSize] = useState(base.package_size ?? "");
  const [expiry, setExpiry] = useState(base.expiry_date ?? "");
  const [opened, setOpened] = useState(base.opened_at ?? "");
  const [shelf, setShelf] = useState(base.open_shelf_days ? String(base.open_shelf_days) : "");
  const [aliases, setAliases] = useState((base.aliases ?? []).join(", "));
  const [notes, setNotes] = useState(base.notes ?? "");
  const [cookSoon, setCookSoon] = useState(Boolean(base.cook_soon));
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const q = name.trim();
  const similar = !item && q.length >= 2
    ? store.items.filter((i) => i.name.includes(q) || q.includes(i.name)).slice(0, 4)
    : [];

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!q) return setErr("חסר שם");
    const qty = Number(quantity);
    const tgt = Number(target);
    if (!Number.isFinite(qty) || qty < 0 || !Number.isFinite(tgt) || tgt < 0) return setErr("כמות לא תקינה");
    if (expiry && !isValidDate(expiry)) return setErr("תאריך תוקף לא תקין");
    setBusy(true);
    const data: Partial<Item> = {
      name: q,
      location_id: locationId ? Number(locationId) : null,
      category_id: categoryId ? Number(categoryId) : null,
      quantity: qty,
      target_quantity: tgt,
      package_size: size.trim() || null,
      expiry_date: expiry || null,
      opened_at: opened || null,
      open_shelf_days: shelf ? Number(shelf) : null,
      aliases: aliases.split(",").map((s) => s.trim()).filter(Boolean),
      notes: notes.trim() || null,
      cook_soon: cookSoon,
    };
    const ok = await store.saveItem(data, item?.id);
    setBusy(false);
    if (ok) onClose();
  }

  async function remove() {
    if (!item) return;
    if (!confirmDelete) return setConfirmDelete(true);
    await store.deleteItem(item.id);
    onClose();
  }
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <form className="sheet stack" onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <div className="sheet-head">
          <h2>{item ? "עריכת פריט" : "פריט חדש"}</h2>
          <button type="button" className="ghost" onClick={onClose}>סגור</button>
        </div>
        <label>שם<input value={name} onChange={(e) => setName(e.target.value)} autoFocus={!item} /></label>
        {similar.length > 0 && (
          <p className="hint">כבר קיים: {similar.map((s) => s.name).join(", ")}</p>
        )}
        <div className="grid2">
          <label>מיקום
            <select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              <option value="">ללא</option>
              {store.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </label>
          <label>קטגוריה
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">ללא</option>
              {store.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label>כמות (אריזות)<input inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></label>
          <label>כמות רצויה<input inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} /></label>
          <label>גודל אריזה<input value={size} placeholder="1 ליטר" onChange={(e) => setSize(e.target.value)} /></label>
          <label>תוקף<input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} /></label>
          <label>נפתח בתאריך
            <span className="inline">
              <input type="date" value={opened} onChange={(e) => setOpened(e.target.value)} />
              {!opened && <button type="button" className="ghost small" onClick={() => setOpened(todayStr())}>היום</button>}
            </span>
          </label>
          <label>ימים אחרי פתיחה<input inputMode="numeric" value={shelf} placeholder="5" onChange={(e) => setShelf(e.target.value)} /></label>
        </div>
        <label>שמות נוספים (מופרדים בפסיק)<input value={aliases} onChange={(e) => setAliases(e.target.value)} /></label>
        <label>הערות<input value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
        <label className="check-row">
          <input type="checkbox" checked={cookSoon} onChange={(e) => setCookSoon(e.target.checked)} />
          <span>רוצה לבשל בקרוב <small>(מקדם מתכונים שמשתמשים בו)</small></span>
        </label>
        <p className="hint">כמות רצויה 0 אומרת שהפריט לא ייכנס לרשימת הקניות אוטומטית.</p>
        {(err || store.error) && <p className="error">{err || store.error}</p>}
        <div className="actions">
          <button className="primary" disabled={busy}>שמור</button>
          {item && (
            <button type="button" className="danger" onClick={remove}>
              {confirmDelete ? "ללחוץ שוב למחיקה" : "מחק פריט"}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
