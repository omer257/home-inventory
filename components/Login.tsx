"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabase";

function appUrl() {
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  return `${window.location.origin}${base}/`;
}

export default function Login() {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function google() {
    setBusy(true);
    setErr(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: appUrl() },
    });
    if (error) {
      setErr("הכניסה עם Google נכשלה");
      setBusy(false);
    }
  }

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
      <div className="card stack">
        <button className="primary" onClick={google} disabled={busy}>כניסה עם Google</button>
        {!showPassword && (
          <button className="ghost" onClick={() => setShowPassword(true)}>כניסה עם אימייל וסיסמה</button>
        )}
        {showPassword && (
          <form onSubmit={submit} className="stack">
            <label>
              אימייל
              <input type="email" dir="ltr" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <label>
              סיסמה
              <input type="password" dir="ltr" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </label>
            <button disabled={busy}>כניסה</button>
          </form>
        )}
        {err && <p className="error">{err}</p>}
      </div>
    </main>
  );
}

export function NoAccess({ email }: { email: string }) {
  return (
    <main className="login">
      <h1>מלאי הבית</h1>
      <div className="card stack">
        <p>החשבון <bdi dir="ltr">{email}</bdi> עדיין לא הוזמן למשק הבית.</p>
        <p className="hint">אפשר לבקש ממי שכבר משתמש באפליקציה להוסיף את האימייל הזה בהגדרות, תחת "חברי הבית".</p>
        <button onClick={() => supabase.auth.signOut()}>יציאה</button>
      </div>
    </main>
  );
}
