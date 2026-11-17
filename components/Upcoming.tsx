"use client";
import { useMemo } from "react";
import { daysBetween, todayInTz } from "@/lib/dates";
import type { Item } from "@/lib/items";
import { ItemCard } from "./ItemCard";

type Handlers = { onToggle: (i: Item) => void; onDelete: (i: Item) => void; canDelete: (i: Item) => boolean };

export function Upcoming({ items, onToggle, onDelete, canDelete }: { items: Item[] } & Handlers) {
  const groups = useMemo(() => {
    const today = todayInTz();
    const g: Record<string, Item[]> = { Overdue: [], Today: [], "This week": [], Later: [] };
    for (const it of items) {
      const n = daysBetween(today, it.due_date);
      (n < 0 ? g.Overdue : n === 0 ? g.Today : n <= 7 ? g["This week"] : g.Later).push(it);
    }
    return Object.entries(g).filter(([, v]) => v.length);
  }, [items]);

  if (!groups.length) return <div className="empty">Nothing coming up. Use Chat to add something.</div>;
  return (
    <>
      {groups.map(([name, list]) => (
        <section key={name}>
          <div className={`group${name === "Overdue" ? " overdue" : ""}`}>{name}</div>
          {list.map((it) => (
            <ItemCard key={it.id} item={it} onToggle={onToggle} onDelete={canDelete(it) ? onDelete : undefined} />
          ))}
        </section>
      ))}
    </>
  );
}
