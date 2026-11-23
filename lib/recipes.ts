import { Item, expiryStatus } from "./logic";

export type Recipe = {
  id: number;
  title: string;
  source_url: string | null;
  image_url: string | null;
  rating: number | null;
  rating_count: number | null;
  servings: string | null;
  total_time: string | null;
  ingredients: string[];
  instructions: string | null;
  notes: string | null;
  cooked_count: number;
  last_cooked_at: string | null;
  created_at: string;
};

export type LineMatch = {
  line: string;
  item: Item | null;
  /** have: matched and in stock; out: matched but quantity 0; none: no inventory item */
  state: "have" | "out" | "none";
  partial: boolean;
};

export type RecipeMatch = {
  lines: LineMatch[];
  total: number;
  have: number;
  pct: number;
  /** Items in stock that this recipe uses and that should go first: expiring soon or marked "want to cook". */
  expiring: Item[];
  score: number;
};

export function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[֑-ׇ]/g, "") // niqqud
    .replace(/[ךםןףץ]/g, (c) => ({ ך: "כ", ם: "מ", ן: "נ", ף: "פ", ץ: "צ" })[c] as string)
    .replace(/יי/g, "י")
    .replace(/וו/g, "ו")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isHeading(line: string): boolean {
  return /[:：]\s*$/.test(line.trim()) && line.trim().length < 40;
}

function terms(it: Item): string[] {
  return [it.name, ...(it.aliases ?? [])].map(norm).filter((t) => t.length >= 2);
}

const PREFIX = /^[והבלמכש]{1,2}$/;

/** Word-aware match that allows Hebrew one-letter prefixes (ו, ה, ב, ל, מ, כ, ש): "והקינואה" matches "קינואה". */
function contains(hay: string, term: string): boolean {
  const h = ` ${hay} `;
  let from = 0;
  for (;;) {
    const i = h.indexOf(term, from);
    if (i < 0) return false;
    const after = h[i + term.length];
    if (after === " ") {
      const start = h.lastIndexOf(" ", i - 1) + 1;
      const pre = h.slice(start, i);
      if (pre === "" || PREFIX.test(pre)) return true;
    }
    from = i + 1;
  }
}

/** Singular/plural forms of one Hebrew word: לימון ↔ לימונים, עגבניה ↔ עגבניות, שקית ↔ שקיות. */
function wordForms(w: string): string[] {
  if (w.length < 3) return [];
  const out: string[] = [];
  if (w.endsWith("ימ")) { const st = w.slice(0, -2); out.push(st, st + "ה"); }
  else if (w.endsWith("ות")) { const st = w.slice(0, -2); out.push(st + "ה", st + "ת", st); }
  else if (w.endsWith("ה")) { const st = w.slice(0, -1); out.push(st + "ות", st + "ימ"); }
  else if (w.endsWith("ת")) { const st = w.slice(0, -1); out.push(st + "ות"); }
  else if (w.endsWith("י") && w.length >= 4) { const st = w.slice(0, -1); out.push(st, st + "ימ"); }
  else out.push(w + "ימ", w + "ות", w + "י");
  return out.filter((x) => x.length >= 2 && x !== w);
}

function termForms(term: string): string[] {
  const words = term.split(" ");
  const forms: string[] = [];
  if (words.length > 1 && words.length <= 3) {
    // Every word changed together: "עגבניות מרוסקות" ↔ "עגבניה מרוסקת".
    let combos: string[][] = [[]];
    for (const w of words) {
      const opts = wordForms(w);
      combos = combos.flatMap((c) => (opts.length ? opts : [w]).map((o) => [...c, o]));
    }
    for (const c of combos) forms.push(c.join(" "));
  }
  words.forEach((w, i) => {
    for (const f of wordForms(w)) {
      const copy = [...words];
      copy[i] = f;
      forms.push(copy.join(" "));
    }
  });
  return forms;
}

export function matchLine(line: string, items: Item[]): LineMatch {
  const n = norm(line);
  let best: Item | null = null;
  let bestLen = 0;
  let partial = false;
  // Longest match wins; on a tie an exact name beats a singular/plural form.
  for (const it of items) {
    for (const t of terms(it)) {
      if (contains(n, t) && (t.length > bestLen || (t.length === bestLen && partial))) {
        best = it; bestLen = t.length; partial = false;
      }
      for (const f of termForms(t)) {
        if (f.length > bestLen && contains(n, f)) {
          best = it; bestLen = f.length; partial = true;
        }
      }
    }
  }
  if (!best) {
    // Fall back to the first word of an item's name: "אורז" in a recipe matches "אורז בסמטי".
    const cands = items.filter((it) => {
      const first = norm(it.name).split(" ")[0];
      return first.length >= 3 && contains(n, first);
    });
    if (cands.length) {
      best = cands.sort((a, b) => Number(b.quantity) - Number(a.quantity))[0];
      partial = true;
    }
  }
  const state = !best ? "none" : Number(best.quantity) > 0 ? "have" : "out";
  return { line, item: best, state, partial };
}

const UNITS = new Set(("כוס כוסות כף כפות כפית כפיות גרם גר ג קג קילו ליטר ליטרים מל מיליליטר חבילה חבילות קופסה קופסת קופסאות "
  + "יחידה יחידות חצי רבע שליש שלושה רבעי קורט חופן צרור צרורות פרוסה פרוסות שן שיני מיכל מיכלים פחית שקית "
  + "לפי הטעם קצוץ קצוצה קצוצים קצוצות טרי טרייה טריים מגורר מגוררת פרוס פרוסים כתוש כתושה גדול גדולה גדולים קטן קטנה בינוני בינונית "
  + "או ועוד לקישוט להגשה כ אחד אחת שתי שני שלוש ארבע חמש").split(" "));

const UNITS_N = new Set([...UNITS].map((u) => norm(u)));

/** The ingredient's name without amounts and units, in its own spelling: "2 כוסות קינואה שטופה" → "קינואה שטופה". */
export function ingredientName(line: string): string {
  const words = line
    .replace(/[^\p{L}\p{N}\s'"]/gu, " ")
    .split(/\s+/)
    .filter((w) => {
      const n = norm(w).replace(/ /g, "");
      return n.length > 1 && !/^\d/.test(n) && !UNITS_N.has(n);
    });
  return words.slice(0, 3).join(" ");
}

export function matchRecipe(r: Recipe, items: Item[]): RecipeMatch {
  const lines = r.ingredients.filter((l) => l.trim() && !isHeading(l)).map((l) => matchLine(l, items));
  const total = lines.length;
  const have = lines.filter((l) => l.state === "have").length;
  const pct = total ? Math.round((have / total) * 100) : 0;
  const seen = new Set<number>();
  const expiring: Item[] = [];
  for (const l of lines) {
    if (l.state !== "have" || !l.item || seen.has(l.item.id)) continue;
    if (l.item.cook_soon || ["expired", "soon", "week"].includes(expiryStatus(l.item))) {
      expiring.push(l.item);
      seen.add(l.item.id);
    }
  }
  return { lines, total, have, pct, expiring, score: expiring.length * 100 + pct };
}

export function isIngredientHeading(line: string) {
  return isHeading(line);
}

/* ---------- Text import ---------- */

const ING_HEAD = /^(מצרכים|המצרכים|רכיבים|הרכיבים|מרכיבים|המרכיבים|חומרים|החומרים|ingredients)(\s|$)/i;
const INS_HEAD = /^(אופן ההכנה|אופן הכנה|הוראות הכנה|הוראות ההכנה|דרך ההכנה|ההכנה|הכנות|הכנה|הוראות|instructions|method|directions|preparation)(\s|$)/i;

function clean(l: string) {
  return l.replace(/^[\s\-–•*·▪◦]+/, "").trim();
}

export function parseRecipeText(text: string): { title: string; ingredients: string[]; instructions: string } {
  const raw = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!raw.length) return { title: "", ingredients: [], instructions: "" };
  const headKey = (l: string) => l.replace(/[:：]\s*$/, "").trim();
  const ingAt = raw.findIndex((l) => ING_HEAD.test(headKey(l)) && headKey(l).length < 30);
  const insAt = raw.findIndex((l, i) => i > ingAt && INS_HEAD.test(headKey(l)) && headKey(l).length < 30);

  let title = "";
  let ingredients: string[] = [];
  let instructions: string[] = [];

  if (ingAt >= 0) {
    title = ingAt > 0 ? raw[0] : "";
    const end = insAt > ingAt ? insAt : raw.length;
    ingredients = raw.slice(ingAt + 1, end);
    instructions = insAt > ingAt ? raw.slice(insAt + 1) : [];
  } else {
    title = raw[0];
    const rest = raw.slice(1);
    const firstLong = rest.findIndex((l) => l.length > 60);
    const cut = firstLong === -1 ? rest.length : firstLong;
    ingredients = rest.slice(0, cut);
    instructions = rest.slice(cut);
  }

  return {
    title: clean(title),
    ingredients: ingredients.map(clean).filter(Boolean),
    instructions: instructions.map((l) => clean(l).replace(/^\d+[.)]\s*/, "")).filter(Boolean).join("\n"),
  };
}

const PAGE_JUNK = /^(סועדים|מנות|לוח המרת מידות|טבלת המרות|בחר הכל|סמנו והוסיפו.*|הקישור הועתק|פרסומת|הדפסה|שתף|שמור)$/;
const BARE_AMOUNT = /^[\d\s/.,½¼¾⅓⅔־–-]+$/;
const BARE_UNIT = /^(כוס|כוסות|כף|כפות|כפית|כפיות|גרם|ג'|ק"ג|קילו|מ"ל|ליטר|יחידה|יחידות|חבילה|חבילות|קופסה|קופסאות|שן|שיני|צרור|קורט)$/;

// Web pages often split "2 / כוסות / קמח" into separate elements; join them back and drop page chrome.
export function tidyPageText(text: string): string {
  const out: string[] = [];
  let carry = "";
  for (const raw of text.split("\n")) {
    const l = raw.trim();
    if (!l || PAGE_JUNK.test(l)) continue;
    if (BARE_AMOUNT.test(l) || BARE_UNIT.test(l)) {
      carry = carry ? `${carry} ${l}` : l;
      continue;
    }
    out.push(carry && !/[:：]$/.test(l) ? `${carry} ${l}` : l);
    carry = "";
  }
  if (carry) out.push(carry);
  return out.join("\n");
}

export function googleRecipeSearch(names: string[] | string): string {
  const q = typeof names === "string" ? names : `מתכון ${names.slice(0, 3).join(" ")}`;
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}
