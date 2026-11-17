"use client";
import { useMemo, useState } from "react";
import { todayInTz } from "@/lib/dates";
import type { Item } from "@/lib/items";
import { ItemCard, fmtDate } from "./ItemCard";

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const pad = (n: number) => String(n).padStart(2, "0");

export function Calendar({ items, onToggle, onDelete, canDelete }: { items: Item[]; onToggle: (i: Item) => void; onDelete: (i: Item) => void; canDelete: (i: Item) => boolean }) {
  const today = todayInTz();
  const [ym, setYm] = useState(() => ({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) }));
  const [sel, setSel] = useState<string | null>(today);

  const byDate = useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const it of items) m.set(it.due_date, [...(m.get(it.due_date) ?? []), it]);
    return m;
  }, [items]);

  const cells = useMemo(() => {
    const first = new Date(Date.UTC(ym.y, ym.m - 1, 1));
    const lead = (first.getUTCDay() + 6) % 7; // Monday-first
    const start = new Date(first.getTime() - lead * 86_400_000);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start.getTime() + i * 86_400_000);
      return { date: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`, day: d.getUTCDate(), out: d.getUTCMonth() !== ym.m - 1 };
    });
  }, [ym]);

  const shift = (delta: number) =>
    setYm(({ y, m }) => {
      const t = y * 12 + (m - 1) + delta;
      return { y: Math.floor(t / 12), m: (t % 12) + 1 };
    });

  const title = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(ym.y, ym.m - 1, 1)));
  const selected = sel ? byDate.get(sel) ?? [] : [];

  return (
    <>
      <div className="cal-head">
        <button onClick={() => shift(-1)} aria-label="Previous month">‹</button>
        <strong>{title}</strong>
        <button onClick={() => shift(1)} aria-label="Next month">›</button>
      </div>
      <div className="grid">
        {DOW.map((d) => (
          <div className="dow" key={d}>{d}</div>
        ))}
        {cells.map((c) => {
          const list = byDate.get(c.date) ?? [];
          return (
            <button
              key={c.date}
              className={`day${c.out ? " out" : ""}${c.date === today ? " today" : ""}${c.date === sel ? " sel" : ""}`}
              onClick={() => setSel(c.date)}
            >
              {c.day}
              <span className="dots">
                {list.slice(0, 4).map((it) => (
                  <span key={it.id} className={`dot ${it.kind}`} />
                ))}
              </span>
            </button>
          );
        })}
      </div>
      {sel && (
        <>
          <div className="group">{fmtDate(sel)}</div>
          {selected.length ? (
            selected.map((it) => <ItemCard key={it.id} item={it} onToggle={onToggle} onDelete={canDelete(it) ? onDelete : undefined} />)
          ) : (
            <div className="empty" style={{ padding: 16 }}>Nothing on this day.</div>
          )}
        </>
      )}
    </>
  );
}
