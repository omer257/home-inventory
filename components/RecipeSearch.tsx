"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Item } from "@/lib/logic";
import { googleRecipeSearch } from "@/lib/recipes";
import type { Store } from "@/lib/useStore";

const CX = process.env.NEXT_PUBLIC_GCSE_CX ?? "";
const NON_FOOD = ["ניקיון", "היגיינה"];

type Gcse = {
  search: { cse: { element: {
    render: (c: { div: string | HTMLElement; tag: string; gname?: string; attributes?: Record<string, unknown> }) => void;
    getElement: (g: string) => { execute: (q: string) => void } | null;
  } } };
};
type W = Window & { __gcse?: Record<string, unknown>; google?: Gcse };

let loader: Promise<void> | null = null;
let onRendered: ((els: HTMLElement[]) => void) | null = null;

function loadGcse(): Promise<void> {
  if (loader) return loader;
  loader = new Promise((resolve, reject) => {
    const w = window as W;
    w.__gcse = {
      parsetags: "explicit",
      initializationCallback: () => resolve(),
      searchCallbacks: {
        web: { rendered: (_g: string, _q: string, _p: HTMLElement[], results: HTMLElement[]) => onRendered?.(results) },
      },
    };
    const s = document.createElement("script");
    s.src = `https://cse.google.com/cse.js?cx=${encodeURIComponent(CX)}`;
    s.async = true;
    s.onerror = () => { loader = null; reject(new Error("load")); };
    document.head.appendChild(s);
  });
  return loader;
}

function resultUrl(el: HTMLElement): string | null {
  const a = el.querySelector<HTMLAnchorElement>("a.gs-title");
  const u = a?.getAttribute("data-ctorig") || a?.href || null;
  return u && /^https?:\/\//.test(u) ? u : null;
}

export default function RecipeSearch({
  store, priority, initial, onClose, onImport, imported,
}: {
  store: Store;
  priority: Item[];
  initial: Item | null;
  onClose: () => void;
  onImport: (url: string) => Promise<boolean>;
  imported: Set<string>;
}) {
  const nonFood = useMemo(
    () => new Set(store.categories.filter((c) => NON_FOOD.includes(c.name)).map((c) => c.id)),
    [store.categories]
  );
  const [picked, setPicked] = useState<Set<number>>(
    () => new Set(initial ? [initial.id] : priority.slice(0, 3).map((i) => i.id))
  );
  const [filter, setFilter] = useState("");
  const [query, setQuery] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const box = useRef<HTMLDivElement>(null);
  const importRef = useRef(onImport);
  importRef.current = onImport;
  const importedRef = useRef(imported);
  importedRef.current = imported;

  const priorityIds = new Set(priority.map((i) => i.id));
  const others = store.items
    .filter((i) => !priorityIds.has(i.id) && Number(i.quantity) > 0 && !(i.category_id != null && nonFood.has(i.category_id)))
    .filter((i) => !filter.trim() || i.name.includes(filter.trim()))
    .sort((a, b) => a.name.localeCompare(b.name, "he"));

  const names = store.items.filter((i) => picked.has(i.id)).map((i) => i.name);
  const q = names.length ? `${names.join(" ")} מתכון` : "";

  function toggle(id: number) {
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  useEffect(() => {
    onRendered = (els) => {
      for (const el of els) {
        if (el.querySelector(".import-btn")) continue;
        const url = resultUrl(el);
        if (!url) continue;
        const b = document.createElement("button");
        b.type = "button";
        b.className = "import-btn";
        const done = importedRef.current.has(url);
        b.textContent = done ? "✓ יובא" : "ייבא";
        b.disabled = done;
        b.onclick = async (e) => {
          e.preventDefault();
          e.stopPropagation();
          b.disabled = true;
          b.textContent = "מייבא…";
          const ok = await importRef.current(url);
          b.textContent = ok ? "✓ יובא" : "לא הצליח";
          if (!ok) b.disabled = false;
        };
        el.appendChild(b);
      }
    };
    return () => { onRendered = null; };
  }, []);

  async function run() {
    if (!q) return;
    setQuery(q);
    if (!CX) return;
    setState("loading");
    try {
      await loadGcse();
      const g = (window as W).google!.search.cse.element;
      if (!g.getElement("recipes")) {
        g.render({ div: box.current!, tag: "searchresults-only", gname: "recipes", attributes: { linkTarget: "_blank" } });
      }
      g.getElement("recipes")!.execute(q);
      setState("ready");
    } catch {
      setState("error");
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet stack search-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>חיפוש מתכון לפי מה שיש</h2>
          <button className="ghost" onClick={onClose}>סגור</button>
        </div>

        {priority.length > 0 && (
          <>
            <small className="hint">לבשל קודם</small>
            <div className="pick-chips">
              {priority.map((i) => (
                <button key={i.id} className={picked.has(i.id) ? "on" : ""} onClick={() => toggle(i.id)}>
                  {picked.has(i.id) ? "✓ " : ""}{i.name}
                </button>
              ))}
            </div>
          </>
        )}

        <small className="hint">עוד מהמלאי</small>
        <input className="search" placeholder="סינון מוצרים" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <div className="pick-chips scroll">
          {others.map((i) => (
            <button key={i.id} className={picked.has(i.id) ? "on" : ""} onClick={() => toggle(i.id)}>
              {picked.has(i.id) ? "✓ " : ""}{i.name}
            </button>
          ))}
        </div>

        <button className="primary" disabled={!q || state === "loading"} onClick={run}>
          {q ? `חפש: ${q}` : "בחרו מוצר אחד או יותר"}
        </button>

        {query && (
          <a className="google-link" href={googleRecipeSearch(query)} target="_blank" rel="noopener noreferrer">
            פתח בגוגל המלא
          </a>
        )}
        {!CX && query && <small className="hint">החיפוש בתוך האפליקציה עוד לא הוגדר. אפשר לחפש בגוגל ולהדביק קישור ב"+ מתכון".</small>}
        {state === "error" && <small className="error">החיפוש של גוגל לא נטען. אפשר להשתמש בקישור לגוגל המלא.</small>}
        <div ref={box} className="gcse-box" />
      </div>
    </div>
  );
}
