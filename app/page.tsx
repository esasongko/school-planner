"use client";
import { useCallback, useEffect, useState } from "react";
import type { Item } from "@/lib/items";
import { Chat } from "@/components/Chat";
import { Upcoming } from "@/components/Upcoming";
import { Calendar } from "@/components/Calendar";
import { PushButton } from "@/components/PushButton";
import { Legend } from "@/components/Legend";
import { Timetable, TodayClasses } from "@/components/Timetable";
import type { Slot, Term } from "@/lib/timetable";
import { Usage } from "@/components/Usage";
import { ExamBanner } from "@/components/ExamBanner";

type Tab = "chat" | "upcoming" | "timetable" | "calendar" | "usage";

const ERRORS: Record<string, string> = {
  not_allowed: "That Google account isn't allowed to use this app. Ask a parent to add it.",
  cancelled: "Sign-in was cancelled.",
  state: "Sign-in expired. Please try again.",
  google: "Google sign-in failed. Please try again.",
};

function LogoMark({ dark }: { dark?: boolean }) {
  const c = dark ? "#1e3a8a" : "#fff";
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4M8.5 15l2.3 2.3L15.5 13" />
    </svg>
  );
}

function Login() {
  const [err, setErr] = useState("");
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("error");
    if (code) {
      setErr(ERRORS[code] ?? "Sign-in failed.");
      window.history.replaceState(null, "", "/");
    }
  }, []);
  return (
    <div className="login">
      <div className="card-login">
        <div className="logo">
          <LogoMark dark />
        </div>
        <h1>School Planner</h1>
        <p className="sub">Homework, ULHA, UTS and UAS in one place.</p>
        {err && <p className="err">{err}</p>}
        <a className="google" href="/api/auth/google">
          Sign in with Google
        </a>
      </div>
    </div>
  );
}

interface Me {
  authed: boolean;
  email?: string;
  role?: "superadmin" | "admin" | "child";
  name?: string | null;
  bypass?: boolean;
}

export default function Home() {
  const [me, setMe] = useState<Me | null>(null);
  const [tab, setTab] = useState<Tab>("chat");
  const [items, setItems] = useState<Item[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [activeTermId, setActiveTermId] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/items?status=all");
    if (res.status === 401) return setMe({ authed: false });
    const data = await res.json();
    setItems(data.items);
    const t = await fetch("/api/timetable");
    if (t.ok) {
      const d = await t.json();
      setSlots(d.slots);
      setTerms(d.terms);
      setActiveTermId(d.activeTermId);
    }
  }, []);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((d: Me) => setMe(d));
  }, []);
  useEffect(() => {
    if (me?.authed) refresh();
  }, [me, refresh]);

  const canDelete = (i: Item) => me?.role === "superadmin" || me?.role === "admin" || (!!i.created_by && i.created_by === me?.email);

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    setMe({ authed: false });
    setItems([]);
    setSlots([]);
    setTerms([]);
  }

  async function toggle(item: Item) {
    await fetch(`/api/items/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: item.status === "done" ? "open" : "done" }),
    });
    refresh();
  }
  async function remove(item: Item) {
    if (!confirm(`Delete "${item.title}"?`)) return;
    const res = await fetch(`/api/items/${item.id}`, { method: "DELETE" });
    if (res.status === 403) alert("Only a parent can delete this item.");
    refresh();
  }

  async function removeSlot(slot: Slot) {
    if (!confirm(`Remove ${slot.subject} from the timetable?`)) return;
    const res = await fetch(`/api/timetable/${slot.id}`, { method: "DELETE" });
    if (res.status === 403) alert("Only the superadmin can remove timetable classes.");
    refresh();
  }
  const canDeleteSlot = () => me?.role === "superadmin";

  if (me === null) return null;
  if (!me.authed) return <Login />;

  const open = items.filter((i) => i.status === "open");
  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <div className="logo">
            <LogoMark />
          </div>
          <div style={{ minWidth: 0 }}>
            <h1>School Planner</h1>
            <div className="who">
              {me.name || me.email} · {me.role === "superadmin" ? "Superadmin" : me.role === "admin" ? "Parent" : "Student"} ·{" "}
              <button className="link" onClick={signOut}>
                Sign out
              </button>
            </div>
          </div>
        </div>
        <PushButton />
      </header>
      {me.bypass && <div className="banner">Login is switched off for now (temporary). Don't share this link.</div>}
      <ExamBanner items={items} />
      <nav className="tabs" role="tablist">
        {((me.role === "superadmin" ? ["chat", "upcoming", "timetable", "calendar", "usage"] : ["chat", "upcoming", "timetable", "calendar"]) as Tab[]).map((t) => (
          <button key={t} role="tab" className="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
            {t === "chat" ? "Chat" : t === "upcoming" ? `Upcoming${open.length ? ` (${open.length})` : ""}` : t === "timetable" ? "Timetable" : t === "usage" ? "Usage" : "Calendar"}
          </button>
        ))}
      </nav>
      {tab === "chat" && <Chat onChanged={refresh} />}
      {tab === "upcoming" && (
        <div className="pane">
          <TodayClasses slots={slots} activeTermId={activeTermId} />
          <Upcoming items={open} onToggle={toggle} onDelete={remove} canDelete={canDelete} />
          <Legend />
        </div>
      )}
      {tab === "timetable" && (
        <div className="pane">
          <Timetable terms={terms} slots={slots} activeTermId={activeTermId} onDelete={removeSlot} canDelete={canDeleteSlot} />
        </div>
      )}
      {tab === "usage" && me.role === "superadmin" && (
        <div className="pane">
          <Usage />
        </div>
      )}
      {tab === "calendar" && (
        <div className="pane">
          <Calendar items={open} onToggle={toggle} onDelete={remove} canDelete={canDelete} />
          <Legend />
        </div>
      )}
    </div>
  );
}
