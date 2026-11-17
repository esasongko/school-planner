"use client";
import { todayInTz } from "@/lib/dates";
import { WEEKDAYS, isoWeekday } from "@/lib/weekdays";
import { useState } from "react";
import type { Slot, Term } from "@/lib/timetable";

export function SlotRow({ slot, onDelete }: { slot: Slot; onDelete?: (s: Slot) => void }) {
  return (
    <div className="slot">
      <div className="slot-time">
        {slot.start_time}
        {slot.end_time && <span> – {slot.end_time}</span>}
      </div>
      <div className="slot-main">
        <div className="slot-subject">{slot.subject}</div>
        {slot.room && <div className="meta">{slot.room}</div>}
      </div>
      {onDelete && (
        <button className="slot-del" aria-label={`Remove ${slot.subject}`} onClick={() => onDelete(slot)}>
          ×
        </button>
      )}
    </div>
  );
}

/** Today's classes, shown at the top of Upcoming. */
export function TodayClasses({ slots, activeTermId }: { slots: Slot[]; activeTermId: number | null }) {
  const wd = isoWeekday(todayInTz());
  const list = slots.filter((s) => s.term_id === activeTermId && s.weekday === wd);
  if (!list.length) return null;
  return (
    <section className="today-classes">
      <div className="group">Today&apos;s classes · {WEEKDAYS[wd - 1]}</div>
      <div className="slots">
        {list.map((s) => (
          <SlotRow key={s.id} slot={s} />
        ))}
      </div>
    </section>
  );
}

const fmt = (d: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(d + "T00:00:00Z"));

function termStatus(t: Term, today: string): "Current" | "Upcoming" | "Past" {
  if (t.effective_from > today) return "Upcoming";
  if (t.effective_to && t.effective_to < today) return "Past";
  return "Current";
}

export function Timetable({
  terms,
  slots,
  activeTermId,
  onDelete,
  canDelete,
}: {
  terms: Term[];
  slots: Slot[];
  activeTermId: number | null;
  onDelete: (s: Slot) => void;
  canDelete: (s: Slot) => boolean;
}) {
  const todayStr = todayInTz();
  const today = isoWeekday(todayStr);
  const [picked, setPicked] = useState<number | null>(null);
  if (!terms.length) {
    return <div className="empty">No timetable yet. Ask in Chat, e.g. &quot;New timetable from 26 Oct 2026: Monday 07:30–08:10 Mathematics&quot;.</div>;
  }
  const term = terms.find((t) => t.id === (picked ?? activeTermId)) ?? terms[0];
  const status = termStatus(term, todayStr);
  const list = slots.filter((s) => s.term_id === term.id);
  return (
    <>
      <div className="term-bar">
        <select aria-label="Timetable version" value={term.id} onChange={(e) => setPicked(Number(e.target.value))}>
          {terms.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} · {termStatus(t, todayStr)}
            </option>
          ))}
        </select>
        <div className="meta">
          Effective {fmt(term.effective_from)} – {term.effective_to ? fmt(term.effective_to) : "until replaced"}
          <span className={`term-badge ${status.toLowerCase()}`}>{status}</span>
        </div>
      </div>
      {!list.length && <div className="empty">No classes in this timetable yet.</div>}
      {WEEKDAYS.map((name, i) => {
        const day = i + 1;
        const dayList = list.filter((s) => s.weekday === day);
        if (!dayList.length) return null;
        const isToday = status === "Current" && day === today;
        return (
          <section key={name}>
            <div className={`group${isToday ? " today-label" : ""}`}>
              {name}
              {isToday ? " · Today" : ""}
            </div>
            <div className={`slots${isToday ? " is-today" : ""}`}>
              {dayList.map((s) => (
                <SlotRow key={s.id} slot={s} onDelete={canDelete(s) ? onDelete : undefined} />
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}
