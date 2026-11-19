"use client";
import "./ExamBanner.css";
import { daysBetween, todayInTz } from "@/lib/dates";
import type { Item } from "@/lib/items";

const SHOW_WITHIN_DAYS = 45;

const fmt = (d: string) =>
  new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(d + "T00:00:00Z"));

/** Scrolling reminder shown while a UAS (or UTS) exam period is near or under way. */
export function ExamBanner({ items }: { items: Item[] }) {
  const today = todayInTz();
  const exams = items.filter((i) => (i.kind === "uas" || i.kind === "uts") && i.status === "open" && i.due_date >= today);
  if (!exams.length) return null;
  const first = exams.reduce((a, b) => (b.due_date < a.due_date ? b : a));
  const kind = first.kind;
  const label = kind === "uas" ? "UAS" : "UTS";
  const series = exams.filter((i) => i.kind === kind);
  const dates = series.map((i) => i.due_date).sort();
  const start = dates[0];
  const end = dates[dates.length - 1];
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
    <div className={`exam-banner${now ? " now" : ""}`} role="status">
      <span className="eb-tag">{label}</span>
      <div className="eb-track">
        <div className="eb-move">
          <span className="eb-text">{text}</span>
          <span className="eb-text" aria-hidden>
            {text}
          </span>
        </div>
      </div>
    </div>
  );
}
