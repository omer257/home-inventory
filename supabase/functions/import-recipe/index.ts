// Supabase Edge Function: import-recipe
// Fetches a recipe page and extracts schema.org/Recipe data (JSON-LD).
// Only signed-in household members can call it.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
  });
}

async function isMember(req: Request): Promise<boolean> {
  const url = Deno.env.get("SUPABASE_URL");
  const auth = req.headers.get("authorization");
  const apikey = req.headers.get("apikey");
  if (!url || !auth || !apikey) return false;
  const res = await fetch(`${url}/rest/v1/rpc/is_member`, {
    method: "POST",
    headers: { authorization: auth, apikey, "content-type": "application/json" },
    body: "{}",
  });
  if (!res.ok) return false;
  return (await res.json()) === true;
}

function blockedHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal") || h.endsWith(".local")) return true;
  if (/^(127|10|0)\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (h === "::1" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80")) return true;
  return false;
}

function decode(s: string): string {
  return s
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function types(o: Record<string, unknown>): string[] {
  const t = o["@type"];
  return (Array.isArray(t) ? t : [t]).map((x) => String(x ?? ""));
}

function findRecipe(node: unknown, depth = 0): Record<string, unknown> | null {
  if (!node || depth > 6) return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const r = findRecipe(n, depth + 1);
      if (r) return r;
    }
    return null;
  }
  if (typeof node !== "object") return null;
  const o = node as Record<string, unknown>;
  if (types(o).some((t) => t.toLowerCase() === "recipe")) return o;
  for (const key of ["@graph", "mainEntity", "mainEntityOfPage", "itemListElement"]) {
    const r = findRecipe(o[key], depth + 1);
    if (r) return r;
  }
  return null;
}

function toText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number") return decode(String(v));
  if (Array.isArray(v)) return v.map(toText).filter(Boolean).join(", ");
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    return toText(o.text ?? o.name ?? o.url ?? "");
  }
  return "";
}

function instructions(v: unknown): string[] {
  if (v == null) return [];
  if (typeof v === "string") {
    return v.replace(/<\/(p|li)\s*>|<br\s*\/?>/gi, "\n").split(/\n+/).map(decode).filter(Boolean);
  }
  if (Array.isArray(v)) return v.flatMap(instructions);
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (types(o).some((t) => t === "HowToSection")) {
      const name = toText(o.name);
      const steps = instructions(o.itemListElement);
      return name ? [`${name}:`, ...steps] : steps;
    }
    const t = toText(o.text ?? o.name);
    return t ? [t] : [];
  }
  return [];
}

function image(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return image(v[0]);
  if (typeof v === "object") return image((v as Record<string, unknown>).url);
  return null;
}

function duration(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const m = v.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/i);
  if (!m) return v;
  const mins = (Number(m[1] || 0) * 24 + Number(m[2] || 0)) * 60 + Number(m[3] || 0);
  if (!mins) return null;
  return mins >= 60 ? `${Math.floor(mins / 60)} שע' ${mins % 60 ? `${mins % 60} דק'` : ""}`.trim() : `${mins} דק'`;
}

function num(v: unknown): number | null {
  const n = Number(typeof v === "string" ? v.replace(",", ".") : v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function metaContent(html: string, prop: string): string | null {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*>`, "i");
  const tag = html.match(re)?.[0];
  const c = tag?.match(/content=["']([^"']*)["']/i)?.[1];
  return c ? decode(c) : null;
}

const ING_LINE = /^(מצרכים|המצרכים|רכיבים|הרכיבים|מרכיבים|המרכיבים|חומרים|החומרים|ingredients)(\s|$)/i;

function entities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
}

// Plain text of the page around the ingredients heading, for sites without structured recipe data.
function pageText(html: string): string | null {
  const body = html
    .replace(/<(script|style|noscript|svg|nav|header|footer|aside|form|iframe)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(p|li|ul|ol|div|h[1-6]|tr|section|article|dt|dd)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  const lines = entities(body).split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const at = lines.findIndex((l) => l.length < 30 && ING_LINE.test(l.replace(/[:：]\s*$/, "")));
  if (at < 0) return null;
  return lines.slice(at, at + 150).join("\n").slice(0, 15000);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  if (!(await isMember(req))) return json({ error: "not_member" }, 403);

  let target: URL;
  try {
    const { url } = await req.json();
    target = new URL(String(url));
  } catch {
    return json({ error: "bad_url" }, 400);
  }
  if (!/^https?:$/.test(target.protocol) || blockedHost(target.hostname)) return json({ error: "bad_url" }, 400);

  let html: string;
  try {
    const res = await fetch(target, {
      redirect: "follow",
      signal: AbortSignal.timeout(12000),
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; HomeInventoryRecipeImporter/1.0)",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "he,en;q=0.8",
      },
    });
    if (!res.ok) return json({ error: "fetch_failed", status: res.status }, 502);
    const buf = new Uint8Array(await res.arrayBuffer());
    html = new TextDecoder("utf-8").decode(buf.slice(0, 4_000_000));
  } catch {
    return json({ error: "fetch_failed" }, 502);
  }

  let recipe: Record<string, unknown> | null = null;
  const scripts = html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const s of scripts) {
    try {
      recipe = findRecipe(JSON.parse(s[1].trim()));
    } catch {
      continue;
    }
    if (recipe) break;
  }

  const fallbackTitle = metaContent(html, "og:title") ?? decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
  if (!recipe) {
    return json({ found: false, title: fallbackTitle || null, image_url: metaContent(html, "og:image"), source_url: target.href, text: pageText(html) });
  }

  const agg = (recipe.aggregateRating ?? {}) as Record<string, unknown>;
  const ingredients = (Array.isArray(recipe.recipeIngredient) ? recipe.recipeIngredient : recipe.ingredients ? [recipe.ingredients].flat() : [])
    .map(toText)
    .filter(Boolean);

  return json({
    found: true,
    title: toText(recipe.name) || fallbackTitle || null,
    source_url: target.href,
    image_url: image(recipe.image) ?? metaContent(html, "og:image"),
    rating: num(agg.ratingValue),
    rating_count: num(agg.ratingCount ?? agg.reviewCount),
    servings: toText(Array.isArray(recipe.recipeYield) ? recipe.recipeYield[0] : recipe.recipeYield) || null,
    total_time: duration(recipe.totalTime ?? recipe.cookTime),
    ingredients,
    instructions: instructions(recipe.recipeInstructions).join("\n"),
    text: ingredients.length ? null : pageText(html),
  });
});
