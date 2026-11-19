"use client";
import { useEffect, useState } from "react";
import "./ExamBanner.css";
import { daysBetween, todayInTz } from "@/lib/dates";
import type { Item } from "@/lib/items";

const SHOW_WITHIN_DAYS = 45;

const fmt = (d: string) =>
  new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(d + "T00:00:00Z"));

/** Scrolling reminder shown while a UAS (or UTS) exam period is near or under way. Click to see the full schedule. */
export function ExamBanner({ items }: { items: Item[] }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const today = todayInTz();
  const exams = items.filter((i) => (i.kind === "uas" || i.kind === "uts") && i.status === "open" && i.due_date >= today);
  if (!exams.length) return null;
  const first = exams.reduce((a, b) => (b.due_date < a.due_date ? b : a));
  const kind = first.kind;
  const label = kind === "uas" ? "UAS" : "UTS";
  const series = exams.filter((i) => i.kind === kind).sort((a, b) => (a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : 0));
  const start = series[0].due_date;
  const end = series[series.length - 1].due_date;
  const away = daysBetween(today, start);
  if (away > SHOW_WITHIN_DAYS) return null;
  const now = away <= 0;
  const todays = series.filter((i) => i.due_date === today);
  let text: string;
  if (now) {
    text = todays.length
      ? `${label} is happening now. Today: ${todays.map((i) => i.subject || i.title).join(", ")}. Stay calm, read the questions carefully, and do your best!`
      : `${label} is happening now, until ${fmt(end)}. Check the next exam in Upcoming and keep revising!`;
  } else {
    const when = away === 1 ? "tomorrow" : `in ${away} days`;
    text = `${label} starts ${fmt(start)} (${when}), ${series.length} exam${series.length > 1 ? "s" : ""} until ${fmt(end)}. Be prepared: make a revision plan, study a little every day, and get enough sleep!`;
  }
  return (
    <>
      <button type="button" className={`exam-banner${now ? " now" : ""}`} onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label={`${text} Tap for details.`}>
        <span className="eb-tag">{label}</span>
        <span className="eb-track">
          <span className="eb-move">
            <span className="eb-text">{text}</span>
            <span className="eb-text" aria-hidden>
              {text}
            </span>
          </span>
        </span>
      </button>
      {open && (
        <div className="eb-overlay" onClick={() => setOpen(false)}>
          <div className={`eb-modal${now ? " now" : ""}`} role="dialog" aria-modal="true" aria-label={`${label} reminder`} onClick={(e) => e.stopPropagation()}>
            <div className="eb-head">
              <span className="eb-tag">{label}</span>
              <h2>{now ? `${label} is happening now` : `${label} is coming`}</h2>
              <button type="button" className="eb-close" onClick={() => setOpen(false)} aria-label="Close">
                ×
              </button>
            </div>
            <p className="eb-msg">{text}</p>
            <h3>Schedule</h3>
            <ul className="eb-list">
              {series.map((i) => {
                const d = daysBetween(today, i.due_date);
                return (
                  <li key={i.id} className={d === 0 ? "today" : ""}>
                    <span className="eb-date">{fmt(i.due_date)}</span>
                    <span className="eb-subj">{i.subject || i.title}</span>
                    <span className="eb-in">{d === 0 ? "Today" : d === 1 ? "Tomorrow" : `in ${d} days`}</span>
                  </li>
                );
              })}
            </ul>
            <button type="button" className="eb-ok" onClick={() => setOpen(false)}>
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}
