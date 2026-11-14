"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) setErr("אימייל או סיסמה שגויים");
    setBusy(false);
  }

  return (
    <main className="login">
      <h1>מלאי הבית</h1>
      <form onSubmit={submit} className="card stack">
        <label>
          אימייל
          <input type="email" dir="ltr" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          סיסמה
          <input type="password" dir="ltr" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {err && <p className="error">{err}</p>}
        <button className="primary" disabled={busy}>{busy ? "נכנס…" : "כניסה"}</button>
      </form>
    </main>
  );
}
