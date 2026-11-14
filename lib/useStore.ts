"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";
import type { Extra, Item, Named } from "./logic";

type Reason = "use" | "buy" | "count" | "edit" | "discard";

export type Toast = { text: string; undo?: () => Promise<void> } | null;

export function useStore(enabled: boolean) {
  const [items, setItems] = useState<Item[]>([]);
  const [locations, setLocations] = useState<Named[]>([]);
  const [categories, setCategories] = useState<Named[]>([]);
  const [extras, setExtras] = useState<Extra[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((t: Toast) => {
    setToast(t);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 5000);
  }, []);

  const reload = useCallback(async () => {
    const [i, l, c, e] = await Promise.all([
      supabase.from("items").select("*").order("name"),
      supabase.from("locations").select("*").order("sort_order"),
      supabase.from("categories").select("*").order("sort_order"),
      supabase.from("shopping_extras").select("*").order("created_at"),
    ]);
    const err = i.error || l.error || c.error || e.error;
    if (err) setError(err.message);
    else setError(null);
    if (i.data) setItems(i.data as Item[]);
    if (l.data) setLocations(l.data as Named[]);
    if (c.data) setCategories(c.data as Named[]);
    if (e.data) setExtras(e.data as Extra[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    reload();
    let t: ReturnType<typeof setTimeout> | null = null;
    const debounced = () => {
      if (t) clearTimeout(t);
      t = setTimeout(reload, 300);
    };
    const ch = supabase
      .channel("inventory")
      .on("postgres_changes", { event: "*", schema: "public", table: "items" }, debounced)
      .on("postgres_changes", { event: "*", schema: "public", table: "shopping_extras" }, debounced)
      .on("postgres_changes", { event: "*", schema: "public", table: "locations" }, debounced)
      .on("postgres_changes", { event: "*", schema: "public", table: "categories" }, debounced)
      .subscribe();
    const onFocus = () => reload();
    window.addEventListener("focus", onFocus);
    return () => {
      supabase.removeChannel(ch);
      window.removeEventListener("focus", onFocus);
    };
  }, [enabled, reload]);

  const fail = (msg: string) => {
    setError(msg);
    reload();
  };

  /** Set quantity (and optionally other fields), log the change, offer undo. */
  const setQuantity = useCallback(
    async (item: Item, newQty: number, reason: Reason, extra: Partial<Item> = {}, label?: string) => {
      const q = Math.max(0, Math.round(newQty * 100) / 100);
      const prev = { quantity: item.quantity, expiry_date: item.expiry_date, opened_at: item.opened_at };
      setItems((xs) => xs.map((x) => (x.id === item.id ? { ...x, ...extra, quantity: q } : x)));
      const { error } = await supabase.from("items").update({ ...extra, quantity: q }).eq("id", item.id);
      if (error) return fail(error.message);
      const delta = q - Number(item.quantity);
      if (delta !== 0) await supabase.from("stock_log").insert({ item_id: item.id, delta, reason });
      showToast({
        text: label ?? `${item.name}: ${q}`,
        undo: async () => {
          await supabase.from("items").update(prev).eq("id", item.id);
          if (delta !== 0) await supabase.from("stock_log").insert({ item_id: item.id, delta: -delta, reason: "edit" });
          setToast(null);
          reload();
        },
      });
    },
    [reload, showToast]
  );

  const saveItem = useCallback(
    async (data: Partial<Item>, id?: number) => {
      const res = id
        ? await supabase.from("items").update(data).eq("id", id)
        : await supabase.from("items").insert(data);
      if (res.error) {
        setError(res.error.code === "23505" ? "כבר קיים פריט בשם הזה" : res.error.message);
        return false;
      }
      await reload();
      return true;
    },
    [reload]
  );

  const deleteItem = useCallback(
    async (id: number) => {
      const { error } = await supabase.from("items").delete().eq("id", id);
      if (error) return fail(error.message);
      reload();
    },
    [reload]
  );

  const addExtra = useCallback(
    async (name: string, quantity = 1) => {
      const { error } = await supabase.from("shopping_extras").insert({ name, quantity });
      if (error) return fail(error.message);
      reload();
    },
    [reload]
  );

  const toggleExtra = useCallback(
    async (ex: Extra) => {
      setExtras((xs) => xs.map((x) => (x.id === ex.id ? { ...x, checked: !x.checked } : x)));
      const { error } = await supabase.from("shopping_extras").update({ checked: !ex.checked }).eq("id", ex.id);
      if (error) fail(error.message);
    },
    []
  );

  const clearCheckedExtras = useCallback(async () => {
    const { error } = await supabase.from("shopping_extras").delete().eq("checked", true);
    if (error) return fail(error.message);
    reload();
  }, [reload]);

  const saveNamed = useCallback(
    async (table: "locations" | "categories", name: string, id?: number) => {
      const res = id
        ? await supabase.from(table).update({ name }).eq("id", id)
        : await supabase.from(table).insert({ name, sort_order: 100 });
      if (res.error) return fail(res.error.message);
      reload();
    },
    [reload]
  );

  const deleteNamed = useCallback(
    async (table: "locations" | "categories", id: number) => {
      const { error } = await supabase.from(table).delete().eq("id", id);
      if (error) return fail(error.message);
      reload();
    },
    [reload]
  );

  /** Ensure a location/category exists by name, return its id. */
  const ensureNamed = useCallback(async (table: "locations" | "categories", name: string) => {
    const n = name.trim();
    if (!n) return null;
    const found = await supabase.from(table).select("id").eq("name", n).maybeSingle();
    if (found.data) return found.data.id as number;
    const ins = await supabase.from(table).insert({ name: n, sort_order: 100 }).select("id").single();
    return ins.data ? (ins.data.id as number) : null;
  }, []);

  return {
    items, locations, categories, extras, loading, error, setError, toast, setToast, showToast,
    reload, setQuantity, saveItem, deleteItem, addExtra, toggleExtra, clearCheckedExtras,
    saveNamed, deleteNamed, ensureNamed,
  };
}

export type Store = ReturnType<typeof useStore>;
