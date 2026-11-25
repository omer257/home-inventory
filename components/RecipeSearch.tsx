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

function loadGcse(): Promise<void> {
  if (loader) return loader;
  loader = new Promise((resolve, reject) => {
    const w = window as W;
    w.__gcse = {
      parsetags: "explicit",
      initializationCallback: () => resolve(),
    };
    const s = document.createElement("script");
    s.src = `https://cse.google.com/cse.js?cx=${encodeURIComponent(CX)}`;
    s.async = true;
    s.onerror = () => { loader = null; reject(new Error("load")); };
    document.head.appendChild(s);
  });
  return loader;
}

function clickedResult(target: EventTarget | null): { url: string; title: string } | null {
  const a = (target as HTMLElement | null)?.closest?.("a.gs-title") as HTMLAnchorElement | null;
  if (!a) return null;
  const url = a.getAttribute("data-ctorig") || a.href;
  if (!url || !/^https?:\/\//.test(url) || /google\./.test(new URL(url).hostname)) return null;
  return { url, title: a.textContent?.trim() || url };
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

  const [opened, setOpened] = useState<{ url: string; title: string } | null>(null);
  const [importing, setImporting] = useState<"idle" | "busy" | "done" | "fail">("idle");

  // We only watch which result was opened; Google's results themselves are left untouched.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onClick = (e: MouseEvent) => {
      const r = clickedResult(e.target);
      if (r) { setOpened(r); setImporting(importedRef.current.has(r.url) ? "done" : "idle"); }
    };
    el.addEventListener("click", onClick, true);
    el.addEventListener("auxclick", onClick, true);
    return () => { el.removeEventListener("click", onClick, true); el.removeEventListener("auxclick", onClick, true); };
  }, []);

  async function importOpened() {
    if (!opened) return;
    setImporting("busy");
    const ok = await importRef.current(opened.url);
    setImporting(ok ? "done" : "fail");
  }

  const [pasteUrl, setPasteUrl] = useState("");
  const [pasteState, setPasteState] = useState<"idle" | "busy" | "done" | "fail">("idle");

  async function importUrl(raw: string) {
    const m = raw.match(/https?:\/\/\S+/);
    if (!m) { setPasteState("fail"); return; }
    setPasteUrl(m[0]);
    setPasteState("busy");
    const ok = await importRef.current(m[0]);
    setPasteState(ok ? "done" : "fail");
  }

  async function pasteFromClipboard() {
    try {
      const t = await navigator.clipboard.readText();
      if (t) return importUrl(t);
    } catch { /* clipboard blocked: the field below still works */ }
    setPasteState("fail");
  }

  async function run() {
    if (!q) return;
    setQuery(q);
    setPasteState("idle");
    if (!CX) {
      window.open(googleRecipeSearch(q), "_blank", "noopener");
      return;
    }
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
          {q ? (CX ? `חפש: ${q}` : `חפש בגוגל: ${q}`) : "בחרו מוצר אחד או יותר"}
        </button>

        {query && CX && (
          <a className="google-link" href={googleRecipeSearch(query)} target="_blank" rel="noopener noreferrer">
            פתח בגוגל המלא
          </a>
        )}
        {query && (
          <div className="stack paste-box">
            <small className="hint">מצאת מתכון? העתק את הקישור שלו, חזור לכאן ולחץ:</small>
            <button className="primary" disabled={pasteState === "busy"} onClick={pasteFromClipboard}>
              {pasteState === "busy" ? "מייבא…" : "הדבק וייבא"}
            </button>
            <input
              className="search"
              dir="ltr"
              placeholder="או הדבק כאן קישור"
              value={pasteUrl}
              onChange={(e) => { setPasteUrl(e.target.value); setPasteState("idle"); }}
              onKeyDown={(e) => { if (e.key === "Enter") importUrl(pasteUrl); }}
            />
            {pasteState === "done" && <small className="hint">✓ יובא לספרייה. אפשר לחפש עוד או לסגור.</small>}
            {pasteState === "fail" && (
              <small className="error">
                {pasteUrl ? "לא הצלחתי לקרוא מתכון מהקישור הזה. אפשר לנסות מתכון מאתר אחר, או להדביק את הטקסט ב\"+ מתכון\"." : "לא מצאתי קישור. העתק את הקישור והדבק בשדה."}
              </small>
            )}
          </div>
        )}
        {state === "error" && <small className="error">החיפוש של גוגל לא נטען. אפשר להשתמש בקישור לגוגל המלא.</small>}
        {opened && (
          <div className="import-bar">
            <span>פתחת: <strong>{opened.title}</strong></span>
            {importing === "done" ? (
              <span className="hint">✓ יובא לספרייה</span>
            ) : (
              <button className="primary small" disabled={importing === "busy"} onClick={importOpened}>
                {importing === "busy" ? "מייבא…" : importing === "fail" ? "לא הצליח, לנסות שוב" : "ייבא"}
              </button>
            )}
          </div>
        )}
        <div ref={box} className="gcse-box" />
      </div>
    </div>
  );
}
