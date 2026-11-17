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
  expiring: Item[];
  score: number;
};

export function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[֑-ׇ]/g, "") // niqqud
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

export function matchLine(line: string, items: Item[]): LineMatch {
  const n = norm(line);
  let best: Item | null = null;
  let bestLen = 0;
  for (const it of items) {
    for (const t of terms(it)) {
      if (t.length > bestLen && contains(n, t)) {
        best = it;
        bestLen = t.length;
      }
    }
  }
  let partial = false;
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

export function matchRecipe(r: Recipe, items: Item[]): RecipeMatch {
  const lines = r.ingredients.filter((l) => l.trim() && !isHeading(l)).map((l) => matchLine(l, items));
  const total = lines.length;
  const have = lines.filter((l) => l.state === "have").length;
  const pct = total ? Math.round((have / total) * 100) : 0;
  const seen = new Set<number>();
  const expiring: Item[] = [];
  for (const l of lines) {
    if (l.state !== "have" || !l.item || seen.has(l.item.id)) continue;
    if (["expired", "soon", "week"].includes(expiryStatus(l.item))) {
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

const ING_HEAD = /^(מצרכים|המצרכים|רכיבים|הרכיבים|חומרים|ingredients)(\s|$)/i;
const INS_HEAD = /^(אופן ההכנה|אופן הכנה|הוראות הכנה|ההכנה|הכנה|הוראות|instructions|method|directions|preparation)(\s|$)/i;

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

export function googleRecipeSearch(names: string[]): string {
  const q = `מתכון ${names.slice(0, 3).join(" ")}`;
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}
