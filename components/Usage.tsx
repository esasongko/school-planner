"use client";
import "./Usage.css";
import { useEffect, useState } from "react";

interface UserUsage {
  email: string;
  today: number;
  last7: number;
  last30: number;
  input_tokens: number;
  output_tokens: number;
  last_day: string;
}
interface Stats {
  users: UserUsage[];
  days: { day: string; messages: number }[];
  limit: number;
  today_total: number;
}

const k = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

export function Usage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    fetch("/api/admin/usage")
      .then(async (r) => (r.ok ? setStats(await r.json()) : setErr("Could not load usage.")))
      .catch(() => setErr("Could not load usage."));
  }, []);
  if (err) return <div className="empty">{err}</div>;
  if (!stats) return <div className="empty">Loading…</div>;
  const max = Math.max(1, ...stats.days.map((d) => d.messages));
  return (
    <>
      <div className="group">Chat usage · today</div>
      <div className="usage-total">
        <strong>{stats.today_total}</strong> / {stats.limit} messages used today (all users)
      </div>
      <div className="group">By user · last 30 days</div>
      {!stats.users.length && <div className="empty">No chat messages recorded yet.</div>}
      {stats.users.map((u) => (
        <div className="card usage-user" key={u.email}>
          <div className="title">{u.email}</div>
          <div className="usage-grid">
            <span><b>{u.today}</b> today</span>
            <span><b>{u.last7}</b> 7 days</span>
            <span><b>{u.last30}</b> 30 days</span>
          </div>
          <div className="meta">
            Tokens {k(u.input_tokens)} in / {k(u.output_tokens)} out · last active {u.last_day}
          </div>
        </div>
      ))}
      {stats.days.length > 0 && (
        <>
          <div className="group">Messages per day · last 14 days</div>
          <div className="usage-days">
            {stats.days.map((d) => (
              <div className="usage-day" key={d.day}>
                <span className="usage-day-label">{d.day.slice(5)}</span>
                <span className="usage-bar" style={{ width: `${(d.messages / max) * 100}%` }} />
                <span className="usage-day-n">{d.messages}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
