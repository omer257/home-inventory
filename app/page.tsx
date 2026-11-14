"use client";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { configured, supabase } from "@/lib/supabase";
import { Item, expiryStatus, isLow } from "@/lib/logic";
import { useStore } from "@/lib/useStore";
import Login from "@/components/Login";
import ItemForm from "@/components/ItemForm";
import Settings from "@/components/Settings";
import { CountView, ExpiringView, InventoryView, ShoppingView } from "@/components/Views";

type Tab = "inv" | "exp" | "shop" | "count" | "set";

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>("inv");
  const [editing, setEditing] = useState<Item | null | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const store = useStore(Boolean(session));

  if (!configured) return <main className="login"><p>חסרות הגדרות Supabase בבנייה.</p></main>;
  if (!ready) return null;
  if (!session) return <Login />;

  const expCount = store.items.filter((i) => ["expired", "soon", "week"].includes(expiryStatus(i))).length;
  const shopCount = store.items.filter(isLow).length + store.extras.filter((e) => !e.checked).length;

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: "inv", label: "מלאי" },
    { id: "exp", label: "פג בקרוב", badge: expCount },
    { id: "shop", label: "קניות", badge: shopCount },
    { id: "count", label: "ספירה" },
    { id: "set", label: "הגדרות" },
  ];

  return (
    <>
      <header className="top">
        <h1>{tabs.find((t) => t.id === tab)?.label}</h1>
      </header>
      <main className="content">
        {store.error && (
          <p className="error banner" onClick={() => store.setError(null)}>{store.error}</p>
        )}
        {store.loading ? <p className="empty-state">טוען…</p> : (
          <>
            {tab === "inv" && <InventoryView store={store} onOpen={setEditing} />}
            {tab === "exp" && <ExpiringView store={store} onOpen={setEditing} />}
            {tab === "shop" && <ShoppingView store={store} onOpen={setEditing} />}
            {tab === "count" && <CountView store={store} />}
            {tab === "set" && <Settings store={store} />}
          </>
        )}
      </main>
      {store.toast && (
        <div className="toast">
          <span>{store.toast.text}</span>
          {store.toast.undo && <button onClick={store.toast.undo}>בטל</button>}
        </div>
      )}
      <nav className="tabs">
        {tabs.map((t) => (
          <button key={t.id} className={tab === t.id ? "on" : ""} onClick={() => setTab(t.id)}>
            {t.label}
            {!!t.badge && <span className="count">{t.badge}</span>}
          </button>
        ))}
      </nav>
      {editing !== undefined && (
        <ItemForm store={store} item={editing} onClose={() => { setEditing(undefined); store.setError(null); }} />
      )}
    </>
  );
}
