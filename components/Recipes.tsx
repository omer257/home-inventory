"use client";
import { useMemo, useState } from "react";
import { Item, expiryLabel, expiryStatus } from "@/lib/logic";
import { LineMatch, Recipe, RecipeMatch, ingredientName, isIngredientHeading, matchRecipe, norm, parseRecipeText } from "@/lib/recipes";
import { supabase } from "@/lib/supabase";
import RecipeSearch from "./RecipeSearch";
import type { Store } from "@/lib/useStore";

type Sort = "cook" | "pct" | "rating" | "new";

function priorityItems(items: Item[]) {
  return items
    .filter((i) => Number(i.quantity) > 0 && (i.cook_soon || ["expired", "soon", "week"].includes(expiryStatus(i))))
    .sort((a, b) => (a.expiry_date ?? "9999").localeCompare(b.expiry_date ?? "9999"));
}

function Stars({ r }: { r: Recipe }) {
  if (!r.rating) return null;
  return (
    <span className="stars">
      ★ {Number(r.rating).toFixed(1)}
      {r.rating_count ? <small> ({r.rating_count})</small> : null}
    </span>
  );
}

/* ---------- Import from a URL ---------- */

type Fetched = { found: boolean; draft: Partial<Recipe> } | null;

async function fetchRecipe(url: string): Promise<Fetched> {
  const { data, error } = await supabase.functions.invoke("import-recipe", { body: { url } });
  if (error || !data) return null;
  if (!data.found) return { found: false, draft: { title: data.title ?? "", source_url: data.source_url, image_url: data.image_url, ingredients: [] } };
  return {
    found: true,
    draft: {
      title: data.title ?? "",
      source_url: data.source_url,
      image_url: data.image_url,
      rating: data.rating,
      rating_count: data.rating_count,
      servings: data.servings,
      total_time: data.total_time,
      ingredients: data.ingredients ?? [],
      instructions: data.instructions ?? "",
    },
  };
}

/* ---------- List ---------- */

export default function RecipesView({ store, focus, clearFocus }: { store: Store; focus: Item | null; clearFocus: () => void }) {
  const [sort, setSort] = useState<Sort>("cook");
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const [editing, setEditing] = useState<Partial<Recipe> | null>(null);
  const [searching, setSearching] = useState(false);

  const matched = useMemo(
    () => store.recipes.map((r) => ({ r, m: matchRecipe(r, store.items) })),
    [store.recipes, store.items]
  );

  const list = useMemo(() => {
    const s = q.trim();
    let xs = matched.filter(({ r }) => !s || r.title.includes(s) || r.ingredients.some((l) => l.includes(s)));
    if (focus) xs = xs.filter(({ m }) => m.lines.some((l) => l.item?.id === focus.id));
    const by: Record<Sort, (a: (typeof xs)[0], b: (typeof xs)[0]) => number> = {
      cook: (a, b) => b.m.score - a.m.score,
      pct: (a, b) => b.m.pct - a.m.pct || b.m.have - a.m.have,
      rating: (a, b) => Number(b.r.rating ?? 0) - Number(a.r.rating ?? 0) || Number(b.r.rating_count ?? 0) - Number(a.r.rating_count ?? 0),
      new: (a, b) => b.r.created_at.localeCompare(a.r.created_at),
    };
    return [...xs].sort(by[sort]);
  }, [matched, q, sort, focus]);

  const expiring = priorityItems(store.items);
  const searchNames = focus ? [focus.name] : expiring.map((i) => i.name);
  const open = openId != null ? matched.find(({ r }) => r.id === openId) : null;
  const importedUrls = useMemo(() => new Set(store.recipes.map((r) => r.source_url).filter(Boolean) as string[]), [store.recipes]);

  async function importFromSearch(url: string): Promise<boolean> {
    if (importedUrls.has(url)) return true;
    const res = await fetchRecipe(url);
    if (!res || !res.found || !res.draft.ingredients?.length) return false;
    const id = await store.saveRecipe(res.draft);
    if (!id) { store.setError(null); return false; }
    store.showToast({ text: `יובא: ${res.draft.title}` });
    return true;
  }

  return (
    <section>
      <div className="toolbar">
        <input className="search" placeholder="חיפוש מתכון או מצרך" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="primary" onClick={() => setAdding(true)}>+ מתכון</button>
      </div>

      {focus && (
        <div className="focus-bar">
          <span>מתכונים עם <strong>{focus.name}</strong></span>
          <button className="ghost small" onClick={clearFocus}>הצג הכול</button>
        </div>
      )}

      <button className="google-link" onClick={() => setSearching(true)}>
        {searchNames.length ? `חיפוש מתכון ברשת: ${searchNames.slice(0, 3).join(", ")}` : "חיפוש מתכון ברשת לפי מה שיש בבית"}
      </button>

      <div className="chips">
        <button className={sort === "cook" ? "on" : ""} onClick={() => setSort("cook")}>מה לבשל קודם</button>
        <button className={sort === "pct" ? "on" : ""} onClick={() => setSort("pct")}>הכי הרבה מצרכים</button>
        <button className={sort === "rating" ? "on" : ""} onClick={() => setSort("rating")}>דירוג</button>
        <button className={sort === "new" ? "on" : ""} onClick={() => setSort("new")}>אחרונים</button>
      </div>

      {list.length === 0 && (
        <p className="empty-state">
          {store.recipes.length
            ? "אין מתכונים שמתאימים"
            : "אין עדיין מתכונים. מוסיפים ב\"+ מתכון\": קישור לאתר מתכונים או טקסט מודבק."}
        </p>
      )}

      <ul className="recipe-list">
        {list.map(({ r, m }) => (
          <li key={r.id}>
            <button className="recipe-card" onClick={() => setOpenId(r.id)}>
              {r.image_url && <img src={r.image_url} alt="" loading="lazy" referrerPolicy="no-referrer" />}
              <span className="recipe-body">
                <span className="recipe-title">{r.title}</span>
                <span className="recipe-meta">
                  <span className={m.pct === 100 ? "pct full" : "pct"}>{m.have}/{m.total} מצרכים</span>
                  <Stars r={r} />
                  {r.total_time && <small>{r.total_time}</small>}
                </span>
                {m.expiring.length > 0 && (
                  <span className="uses">מנצל: {m.expiring.map((i) => i.name).join(", ")}</span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {searching && (
        <RecipeSearch
          store={store}
          priority={expiring}
          initial={focus}
          imported={importedUrls}
          onImport={importFromSearch}
          onClose={() => setSearching(false)}
        />
      )}
      {adding && (
        <AddRecipe
          onClose={() => setAdding(false)}
          onReady={(draft) => { setAdding(false); setEditing(draft); }}
        />
      )}
      {editing && (
        <RecipeEditor
          store={store}
          draft={editing}
          onClose={() => setEditing(null)}
          onSaved={(id) => { setEditing(null); setOpenId(id); }}
        />
      )}
      {open && !editing && (
        <RecipeDetail
          store={store}
          recipe={open.r}
          match={open.m}
          onClose={() => setOpenId(null)}
          onEdit={() => setEditing(open.r)}
        />
      )}
    </section>
  );
}

/* ---------- Add: link or text ---------- */

function AddRecipe({ onClose, onReady }: { onClose: () => void; onReady: (d: Partial<Recipe>) => void }) {
  const [mode, setMode] = useState<"link" | "text">("link");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function fromLink(e: React.FormEvent) {
    e.preventDefault();
    const u = url.trim();
    if (!/^https?:\/\//i.test(u)) return setErr("צריך קישור שמתחיל ב-https://");
    setBusy(true);
    setErr(null);
    const res = await fetchRecipe(u);
    setBusy(false);
    if (!res) return setErr("לא הצלחתי לקרוא את הדף. אפשר להעתיק את המתכון ולהדביק כטקסט.");
    if (!res.found) {
      setErr("בדף הזה אין נתוני מתכון מובנים. מילאתי את הכותרת, ואת המצרכים אפשר להדביק כטקסט.");
      setTimeout(() => onReady(res.draft), 1500);
      return;
    }
    onReady(res.draft);
  }

  function fromText(e: React.FormEvent) {
    e.preventDefault();
    const p = parseRecipeText(text);
    if (!p.title && !p.ingredients.length) return setErr("לא מצאתי מתכון בטקסט");
    onReady({ title: p.title, ingredients: p.ingredients, instructions: p.instructions });
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet stack" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>מתכון חדש</h2>
          <button className="ghost" onClick={onClose}>סגור</button>
        </div>
        <div className="chips">
          <button className={mode === "link" ? "on" : ""} onClick={() => { setMode("link"); setErr(null); }}>מקישור</button>
          <button className={mode === "text" ? "on" : ""} onClick={() => { setMode("text"); setErr(null); }}>מטקסט</button>
          <button onClick={() => onReady({ title: "", ingredients: [], instructions: "" })}>ידני</button>
        </div>
        {mode === "link" ? (
          <form className="stack" onSubmit={fromLink}>
            <label>קישור למתכון
              <input type="url" dir="ltr" inputMode="url" placeholder="https://" value={url} onChange={(e) => setUrl(e.target.value)} autoFocus />
            </label>
            <button className="primary" disabled={busy}>{busy ? "קורא את הדף…" : "ייבוא"}</button>
          </form>
        ) : (
          <form className="stack" onSubmit={fromText}>
            <label>הדבקת מתכון
              <textarea rows={10} value={text} onChange={(e) => setText(e.target.value)}
                placeholder={"שם המתכון\nמצרכים:\n2 ביצים\nכוס חלב\nאופן ההכנה:\nמערבבים ואופים"} />
            </label>
            <button className="primary">המשך</button>
          </form>
        )}
        {err && <p className="error">{err}</p>}
      </div>
    </div>
  );
}

/* ---------- Edit ---------- */

function RecipeEditor({ store, draft, onClose, onSaved }: {
  store: Store; draft: Partial<Recipe>; onClose: () => void; onSaved: (id: number) => void;
}) {
  const [title, setTitle] = useState(draft.title ?? "");
  const [ings, setIngs] = useState((draft.ingredients ?? []).join("\n"));
  const [steps, setSteps] = useState(draft.instructions ?? "");
  const [url, setUrl] = useState(draft.source_url ?? "");
  const [rating, setRating] = useState(draft.rating ? String(draft.rating) : "");
  const [notes, setNotes] = useState(draft.notes ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setErr("חסר שם");
    const r = rating.trim() ? Number(rating) : null;
    if (r !== null && !(r >= 0 && r <= 5)) return setErr("דירוג בין 0 ל-5");
    setBusy(true);
    const data: Partial<Recipe> = {
      title: title.trim(),
      ingredients: ings.split("\n").map((l) => l.trim()).filter(Boolean),
      instructions: steps.trim() || null,
      source_url: url.trim() || null,
      rating: r,
      rating_count: r !== null && r === draft.rating ? draft.rating_count ?? null : null,
      notes: notes.trim() || null,
    };
    if (!draft.id) {
      Object.assign(data, {
        image_url: draft.image_url ?? null,
        servings: draft.servings ?? null,
        total_time: draft.total_time ?? null,
      });
    }
    const id = await store.saveRecipe(data, draft.id);
    setBusy(false);
    if (id) onSaved(id);
    else setErr(store.error);
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <form className="sheet stack" onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <div className="sheet-head">
          <h2>{draft.id ? "עריכת מתכון" : "מתכון חדש"}</h2>
          <button type="button" className="ghost" onClick={onClose}>סגור</button>
        </div>
        <label>שם<input value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <label>מצרכים (שורה לכל מצרך)<textarea rows={8} value={ings} onChange={(e) => setIngs(e.target.value)} /></label>
        <label>אופן הכנה<textarea rows={8} value={steps} onChange={(e) => setSteps(e.target.value)} /></label>
        <div className="grid2">
          <label>קישור<input dir="ltr" value={url} onChange={(e) => setUrl(e.target.value)} /></label>
          <label>דירוג (0 עד 5)<input inputMode="decimal" value={rating} onChange={(e) => setRating(e.target.value)} /></label>
        </div>
        <label>הערות<input value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
        {err && <p className="error">{err}</p>}
        <button className="primary" disabled={busy}>שמור</button>
      </form>
    </div>
  );
}

/* ---------- Detail ---------- */

function RecipeDetail({ store, recipe, match, onClose, onEdit }: {
  store: Store; recipe: Recipe; match: RecipeMatch; onClose: () => void; onEdit: () => void;
}) {
  const [cooking, setCooking] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [linking, setLinking] = useState<LineMatch | null>(null);

  const lineState = new Map(match.lines.map((l) => [l.line, l]));
  const missing = match.lines.filter((l) => l.state !== "have");
  const extrasNames = new Set(store.extras.filter((e) => !e.checked).map((e) => e.name));

  function addMissing() {
    const names: string[] = [];
    for (const l of missing) {
      // A tracked item that is out and below target is already on the list.
      if (l.item && Number(l.item.target_quantity) > Number(l.item.quantity)) continue;
      const name = l.item ? l.item.name : l.line;
      if (!extrasNames.has(name) && !names.includes(name)) names.push(name);
    }
    store.addExtras(names);
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet stack recipe-detail" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>{recipe.title}</h2>
          <button className="ghost" onClick={onClose}>סגור</button>
        </div>
        {recipe.image_url && <img className="recipe-hero" src={recipe.image_url} alt="" referrerPolicy="no-referrer" />}
        <div className="recipe-meta">
          <span className={match.pct === 100 ? "pct full" : "pct"}>{match.have}/{match.total} מצרכים בבית</span>
          <Stars r={recipe} />
          {recipe.total_time && <small>{recipe.total_time}</small>}
          {recipe.servings && <small>{recipe.servings} מנות</small>}
          {recipe.cooked_count > 0 && <small>בושל {recipe.cooked_count} פעמים</small>}
        </div>

        <h3>מצרכים</h3>
        <ul className="ing-list">
          {recipe.ingredients.map((l, k) => {
            if (isIngredientHeading(l)) return <li key={k} className="ing-head">{l}</li>;
            const m = lineState.get(l);
            const st = m?.state ?? "none";
            const exp = m?.item && st === "have" ? expiryStatus(m.item) : "none";
            return (
              <li key={k} className={`ing ${st}`}>
                <span className="mark">{st === "have" ? "✓" : "✗"}</span>
                <span className="ing-text">
                  {l}
                  {m?.item && <small> · {m.item.name}{m.partial ? "?" : ""}{st === "out" ? " (נגמר)" : ""}</small>}
                </span>
                {m?.item && ["expired", "soon", "week"].includes(exp) && <span className={`badge ${exp}`}>{expiryLabel(m.item)}</span>}
                {m?.item?.cook_soon && st === "have" && <span className="badge cook">לבשל</span>}
                {m && (st === "none" || m.partial) && (
                  <button className="ghost small" onClick={() => setLinking(m)}>{st === "none" ? "קשר" : "תקן"}</button>
                )}
              </li>
            );
          })}
        </ul>
        {missing.length > 0 && (
          <button onClick={addMissing}>הוסף {missing.length} חסרים לרשימת הקניות</button>
        )}

        {recipe.instructions && (
          <>
            <h3>אופן הכנה</h3>
            <ol className="steps">
              {recipe.instructions.split("\n").filter(Boolean).map((s, k) => <li key={k}>{s}</li>)}
            </ol>
          </>
        )}
        {recipe.notes && <p className="hint">{recipe.notes}</p>}
        {recipe.source_url && (
          <a className="google-link" href={recipe.source_url} target="_blank" rel="noopener noreferrer">למתכון המקורי</a>
        )}

        <div className="actions">
          <button className="primary" onClick={() => setCooking(true)}>בישלתי</button>
          <button onClick={onEdit}>עריכה</button>
          <button className="danger" onClick={async () => {
            if (!confirmDelete) return setConfirmDelete(true);
            await store.deleteRecipe(recipe.id);
            onClose();
          }}>{confirmDelete ? "ללחוץ שוב למחיקה" : "מחק"}</button>
        </div>

        {cooking && (
          <Cooked store={store} recipe={recipe} match={match} onDone={() => setCooking(false)} />
        )}
        {linking && <LinkIngredient store={store} match={linking} onDone={() => setLinking(null)} />}
      </div>
    </div>
  );
}

function Cooked({ store, recipe, match, onDone }: { store: Store; recipe: Recipe; match: RecipeMatch; onDone: () => void }) {
  const used = useMemo(() => {
    const seen = new Map<number, Item>();
    for (const l of match.lines) if (l.item && l.state === "have") seen.set(l.item.id, l.item);
    return [...seen.values()];
  }, [match]);
  const [picked, setPicked] = useState<Set<number>>(new Set(used.map((i) => i.id)));
  const [busy, setBusy] = useState(false);

  return (
    <div className="card stack">
      <h3>מה נגמר או ירד מהמלאי?</h3>
      {used.length === 0 && <p className="hint">אין מצרכים מהמלאי במתכון הזה.</p>}
      {used.map((i) => (
        <label key={i.id} className="check-row">
          <input type="checkbox" checked={picked.has(i.id)} onChange={() => {
            const n = new Set(picked);
            if (n.has(i.id)) n.delete(i.id); else n.add(i.id);
            setPicked(n);
          }} />
          <span>{i.name} <small>(יש {Number(i.quantity)}, יורד ל-{Math.max(0, Number(i.quantity) - 1)})</small></span>
        </label>
      ))}
      <div className="actions">
        <button className="primary" disabled={busy} onClick={async () => {
          setBusy(true);
          await store.markCooked(recipe, used.filter((i) => picked.has(i.id)));
          setBusy(false);
          onDone();
        }}>עדכן מלאי</button>
        <button className="ghost" onClick={onDone}>ביטול</button>
      </div>
    </div>
  );
}

/* ---------- Link an ingredient to an inventory item ---------- */

function LinkIngredient({ store, match, onDone }: { store: Store; match: LineMatch; onDone: () => void }) {
  const [alias, setAlias] = useState(ingredientName(match.line));
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Item | null>(match.partial ? match.item : null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const options = useMemo(() => {
    const s = q.trim();
    const xs = s ? store.items.filter((i) => i.name.includes(s) || i.aliases.some((a) => a.includes(s))) : store.items;
    return xs.slice(0, 40);
  }, [q, store.items]);

  async function save() {
    if (!picked) return setErr("צריך לבחור פריט");
    const a = alias.trim();
    if (!a) return setErr("חסר שם");
    setBusy(true);
    const exists = [picked.name, ...picked.aliases].some((x) => norm(x) === norm(a));
    const ok = exists ? true : await store.saveItem({ aliases: [...picked.aliases, a] }, picked.id);
    setBusy(false);
    if (ok) onDone();
  }

  return (
    <div className="card stack">
      <h3>לקשר את "{match.line}" לפריט במלאי</h3>
      <label>השם שיזוהה מעכשיו
        <input value={alias} onChange={(e) => setAlias(e.target.value)} />
      </label>
      <input placeholder="חיפוש פריט" value={q} onChange={(e) => setQ(e.target.value)} />
      <ul className="list pick-list">
        {options.map((i) => (
          <li key={i.id} className={`row ${picked?.id === i.id ? "picked" : ""}`}>
            <button className="row-main" onClick={() => setPicked(i)}>
              <span className="row-name">{i.name}</span>
              {picked?.id === i.id && <span className="qty">✓</span>}
            </button>
          </li>
        ))}
      </ul>
      <p className="hint">השם יישמר כשם נרדף של הפריט, ויזוהה בכל המתכונים.</p>
      {(err || store.error) && <p className="error">{err || store.error}</p>}
      <div className="actions">
        <button className="primary" disabled={busy} onClick={save}>שמור קישור</button>
        <button className="ghost" onClick={onDone}>ביטול</button>
      </div>
    </div>
  );
}
