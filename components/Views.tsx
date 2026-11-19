"use client";
import { useMemo, useState } from "react";
import {
  Item, Named, daysLeft, effectiveExpiry, expiryLabel, expiryStatus, fmtQty, isLow, toBuy, todayStr,
} from "@/lib/logic";
import type { Store } from "@/lib/useStore";
import ItemRow from "./ItemRow";
import { googleRecipeSearch } from "@/lib/recipes";

function groupBy(items: Item[], groups: Named[], key: "location_id" | "category_id") {
  const out: { title: string; items: Item[] }[] = groups.map((g) => ({
    title: g.name,
    items: items.filter((i) => i[key] === g.id),
  }));
  const rest = items.filter((i) => !groups.some((g) => g.id === i[key]));
  if (rest.length) out.push({ title: "ללא", items: rest });
  return out.filter((g) => g.items.length);
}

/* ---------- Inventory ---------- */

export function InventoryView({ store, onOpen, onCount }: { store: Store; onOpen: (i: Item | null) => void; onCount: () => void }) {
  const [q, setQ] = useState("");
  const [by, setBy] = useState<"location_id" | "category_id">("location_id");
  const [filter, setFilter] = useState<"all" | "low" | "exp" | "cook">("all");

  const filtered = useMemo(() => {
    const s = q.trim();
    return store.items.filter((i) => {
      if (s && !i.name.includes(s) && !i.aliases.some((a) => a.includes(s))) return false;
      if (filter === "low") return isLow(i);
      if (filter === "exp") return ["expired", "soon", "week"].includes(expiryStatus(i));
      if (filter === "cook") return Boolean(i.cook_soon);
      return true;
    });
  }, [store.items, q, filter]);

  const groups = groupBy(filtered, by === "location_id" ? store.locations : store.categories, by);

  return (
    <section>
      <div className="toolbar">
        <input className="search" placeholder="חיפוש" value={q} onChange={(e) => setQ(e.target.value)} />
        <button onClick={onCount}>ספירה</button>
        <button className="primary" onClick={() => onOpen(null)}>+ פריט</button>
      </div>
      <div className="chips">
        <button className={by === "location_id" ? "on" : ""} onClick={() => setBy("location_id")}>לפי מיקום</button>
        <button className={by === "category_id" ? "on" : ""} onClick={() => setBy("category_id")}>לפי קטגוריה</button>
        <span className="sep" />
        <button className={filter === "all" ? "on" : ""} onClick={() => setFilter("all")}>הכול</button>
        <button className={filter === "low" ? "on" : ""} onClick={() => setFilter("low")}>חסר</button>
        <button className={filter === "exp" ? "on" : ""} onClick={() => setFilter("exp")}>פג בקרוב</button>
        <button className={filter === "cook" ? "on" : ""} onClick={() => setFilter("cook")}>לבשל</button>
      </div>
      {groups.length === 0 && (
        <p className="empty-state">{store.items.length ? "אין תוצאות" : "אין עדיין פריטים. אפשר להוסיף ידנית או לייבא CSV בהגדרות."}</p>
      )}
      {groups.map((g) => (
        <div key={g.title} className="group">
          <h3>{g.title} <small>{g.items.length}</small></h3>
          <ul className="list">
            {g.items.map((i) => <ItemRow key={i.id} item={i} store={store} onOpen={onOpen} />)}
          </ul>
        </div>
      ))}
    </section>
  );
}

/* ---------- Expiring ---------- */

export function ExpiringView({ store, onOpen, onRecipes }: { store: Store; onOpen: (i: Item) => void; onRecipes: (i: Item) => void }) {
  const list = store.items
    .filter((i) => ["expired", "soon", "week"].includes(expiryStatus(i)) || (i.cook_soon && Number(i.quantity) > 0))
    .sort((a, b) => (effectiveExpiry(a) ?? "9999").localeCompare(effectiveExpiry(b) ?? "9999"));

  if (!list.length) return <p className="empty-state">אין פריטים שפגים בשבוע הקרוב או שסומנו "לבשל".</p>;

  return (
    <>
    <a className="google-link" href={googleRecipeSearch(list.map((i) => i.name))} target="_blank" rel="noopener noreferrer">
      חיפוש בגוגל: מתכון עם {list.slice(0, 3).map((i) => i.name).join(", ")}
    </a>
    <ul className="list">
      {list.map((i) => {
        const q = Number(i.quantity);
        return (
          <li key={i.id} className="row column">
            <button className="row-main" onClick={() => onOpen(i)}>
              <span className="row-name">{i.name} <small>· {fmtQty(q)}</small></span>
              <span className="row-meta">
                {i.cook_soon && <span className="badge cook">לבשל</span>}
                {expiryStatus(i) !== "none" && expiryStatus(i) !== "ok" && <span className={`badge ${expiryStatus(i)}`}>{expiryLabel(i)}</span>}
              </span>
            </button>
            <div className="actions small">
              <button onClick={() => store.setQuantity(i, q - 1, "use", {}, `${i.name}: השתמשתי`)}>השתמשתי</button>
              <button onClick={() => store.setQuantity(i, 0, "discard", {}, `${i.name}: נזרק`)}>זרקתי</button>
              {!i.opened_at && (
                <button onClick={() => store.setQuantity(i, q, "edit", { opened_at: todayStr() }, `${i.name}: נפתח`)}>פתחתי</button>
              )}
              <button onClick={() => store.setQuantity(i, q, "edit", { cook_soon: !i.cook_soon }, i.cook_soon ? `${i.name}: הוסר מ"לבשל"` : `${i.name}: סומן "לבשל"`)}>
                {i.cook_soon ? "בטל לבשל" : "לבשל"}
              </button>
              <button onClick={() => onRecipes(i)}>מתכונים</button>
            </div>
          </li>
        );
      })}
    </ul>
    </>
  );
}

/* ---------- Shopping ---------- */

export function ShoppingView({ store, onOpen }: { store: Store; onOpen: (i: Item) => void }) {
  const [newName, setNewName] = useState("");
  const [buying, setBuying] = useState<{ item: Item; qty: string; expiry: string } | null>(null);

  const low = store.items.filter(isLow);
  const groups = groupBy(low, store.categories, "category_id");
  const openExtras = store.extras.filter((e) => !e.checked);
  const doneExtras = store.extras.filter((e) => e.checked);

  function shareText() {
    const lines: string[] = ["רשימת קניות"];
    for (const g of groups) {
      lines.push("", `*${g.title}*`);
      for (const i of g.items) lines.push(`- ${i.name} × ${toBuy(i)}${i.package_size ? ` (${i.package_size})` : ""}`);
    }
    if (openExtras.length) {
      lines.push("", "*נוסף*");
      for (const e of openExtras) lines.push(`- ${e.name}${Number(e.quantity) > 1 ? ` × ${fmtQty(e.quantity)}` : ""}`);
    }
    return lines.join("\n");
  }

  async function share() {
    const text = shareText();
    if (navigator.share) {
      try { await navigator.share({ text }); return; } catch { /* cancelled */ }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  }

  async function confirmBuy() {
    if (!buying) return;
    const n = Number(buying.qty);
    if (!Number.isFinite(n) || n <= 0) return;
    const it = buying.item;
    const extra: Partial<Item> = {};
    const had = Number(it.quantity) > 0;
    if (buying.expiry) {
      extra.expiry_date = had && it.expiry_date && it.expiry_date < buying.expiry ? it.expiry_date : buying.expiry;
    } else if (!had) {
      extra.expiry_date = null;
    }
    if (!had) extra.opened_at = null;
    await store.setQuantity(it, Number(it.quantity) + n, "buy", extra, `${it.name}: נקנה ${fmtQty(n)}`);
    setBuying(null);
  }

  async function addExtra(e: React.FormEvent) {
    e.preventDefault();
    const n = newName.trim();
    if (!n) return;
    const existing = store.items.find((i) => i.name === n);
    if (existing && Number(existing.target_quantity) > 0) {
      store.setError(`${n} כבר במעקב. הרשימה תכלול אותו כשהכמות תרד מתחת לרצוי.`);
    }
    await store.addExtra(n);
    setNewName("");
  }

  return (
    <section>
      <div className="toolbar">
        <strong>{low.length + openExtras.length} פריטים</strong>
        <button className="primary" onClick={share} disabled={!low.length && !openExtras.length}>שתף</button>
      </div>

      {groups.map((g) => (
        <div key={g.title} className="group">
          <h3>{g.title}</h3>
          <ul className="list">
            {g.items.map((i) => (
              <li key={i.id} className="row">
                <button className="row-main" onClick={() => onOpen(i)}>
                  <span className="row-name">{i.name}{i.package_size && <small> · {i.package_size}</small>}</span>
                  <span className="qty">לקנות {toBuy(i)} <small>(יש {fmtQty(i.quantity)})</small></span>
                </button>
                <button className="check" aria-label="נקנה"
                  onClick={() => setBuying({ item: i, qty: String(toBuy(i)), expiry: "" })}>✓</button>
              </li>
            ))}
          </ul>
        </div>
      ))}

      <div className="group">
        <h3>תוספות</h3>
        <form className="toolbar" onSubmit={addExtra}>
          <input className="search" placeholder="להוסיף לרשימה" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <button className="primary">הוסף</button>
        </form>
        <ul className="list">
          {[...openExtras, ...doneExtras].map((e) => (
            <li key={e.id} className={`row ${e.checked ? "done" : ""}`}>
              <button className="row-main" onClick={() => store.toggleExtra(e)}>
                <span className="row-name">{e.name}</span>
                {Number(e.quantity) > 1 && <span className="qty">× {fmtQty(e.quantity)}</span>}
              </button>
              <button className="check" onClick={() => store.toggleExtra(e)}>{e.checked ? "↺" : "✓"}</button>
            </li>
          ))}
        </ul>
        {doneExtras.length > 0 && (
          <button className="ghost" onClick={store.clearCheckedExtras}>ניקוי מסומנים</button>
        )}
      </div>

      {buying && (
        <div className="sheet-backdrop" onClick={() => setBuying(null)}>
          <div className="sheet stack" onClick={(e) => e.stopPropagation()}>
            <h2>{buying.item.name}: נקנה</h2>
            <label>כמה נקנה
              <input inputMode="decimal" value={buying.qty} onChange={(e) => setBuying({ ...buying, qty: e.target.value })} />
            </label>
            {(buying.item.expiry_date || buying.item.open_shelf_days) && (
              <label>תוקף של מה שנקנה (לא חובה)
                <input type="date" value={buying.expiry} onChange={(e) => setBuying({ ...buying, expiry: e.target.value })} />
              </label>
            )}
            <p className="hint">אם תוקף החדש מאוחר מהקיים, האפליקציה תשמור את המוקדם מביניהם.</p>
            <div className="actions">
              <button className="primary" onClick={confirmBuy}>עדכן מלאי</button>
              <button className="ghost" onClick={() => setBuying(null)}>ביטול</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/* ---------- Count mode ---------- */

export function CountView({ store }: { store: Store }) {
  const [locId, setLocId] = useState<number | null>(null);
  const [idx, setIdx] = useState(0);
  const [val, setVal] = useState("");
  const [changes, setChanges] = useState<string[]>([]);

  const list = useMemo(
    () => (locId === null ? [] : store.items.filter((i) => i.location_id === locId)),
    // freeze list order for the session
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locId]
  );

  if (locId === null) {
    return (
      <section>
        <p className="hint">בוחרים מיקום ועוברים על הפריטים בו אחד אחד.</p>
        <ul className="list">
          {store.locations.map((l) => (
            <li key={l.id} className="row">
              <button className="row-main" onClick={() => { setLocId(l.id); setIdx(0); setChanges([]); }}>
                <span className="row-name">{l.name}</span>
                <span className="qty">{store.items.filter((i) => i.location_id === l.id).length} פריטים</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  const done = idx >= list.length;
  if (done) {
    return (
      <section className="stack">
        <h2>הספירה הסתיימה</h2>
        {changes.length ? <ul>{changes.map((c, k) => <li key={k}>{c}</li>)}</ul> : <p>לא היו שינויים.</p>}
        <button className="primary" onClick={() => setLocId(null)}>חזרה</button>
      </section>
    );
  }

  const cur = store.items.find((i) => i.id === list[idx].id) ?? list[idx];
  const next = () => { setIdx(idx + 1); setVal(""); };
  const apply = async (n: number) => {
    if (n !== Number(cur.quantity)) {
      await store.setQuantity(cur, n, "count");
      setChanges((c) => [...c, `${cur.name}: ${fmtQty(cur.quantity)} ← ${fmtQty(n)}`]);
    }
    next();
  };

  return (
    <section className="stack count">
      <p className="hint">{idx + 1} מתוך {list.length}</p>
      <h2>{cur.name}</h2>
      <p>במלאי: <strong>{fmtQty(cur.quantity)}</strong>{cur.package_size && ` · ${cur.package_size}`}</p>
      <div className="actions">
        <button className="primary" onClick={() => apply(Number(cur.quantity))}>נכון</button>
        <button className="danger" onClick={() => apply(0)}>אין</button>
      </div>
      <form className="toolbar" onSubmit={(e) => { e.preventDefault(); const n = Number(val); if (val !== "" && Number.isFinite(n) && n >= 0) apply(n); }}>
        <input inputMode="decimal" placeholder="כמות אחרת" value={val} onChange={(e) => setVal(e.target.value)} />
        <button>עדכן</button>
      </form>
      <button className="ghost" onClick={() => setLocId(null)}>יציאה</button>
    </section>
  );
}

export { daysLeft };
