"use client";
import { daysBetween, todayInTz } from "@/lib/dates";
import { KIND_FULL, KIND_LABEL } from "@/lib/kinds";
import type { Item } from "@/lib/items";

export function fmtDate(d: string): string {
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(d + "T00:00:00Z"),
  );
}

export function dueLabel(item: Item, today = todayInTz()): { text: string; cls: string } {
  if (item.status === "done") return { text: "Done", cls: "" };
  const n = daysBetween(today, item.due_date);
  if (n < 0) return { text: `${-n}d overdue`, cls: "overdue" };
  if (n === 0) return { text: "Today", cls: "soon" };
  if (n === 1) return { text: "Tomorrow", cls: "soon" };
  return { text: `in ${n} days`, cls: "" };
}

export function ItemCard({
  item,
  compact,
  deleted,
  onToggle,
  onDelete,
}: {
  item: Item;
  compact?: boolean;
  deleted?: boolean;
  onToggle?: (item: Item) => void;
  onDelete?: (item: Item) => void;
}) {
  const due = dueLabel(item);
  return (
    <div className={`card k-${item.kind}${compact ? " compact" : ""}${deleted ? " deleted" : ""}`}>
      <div className="top-row">
        <span className={`badge ${item.kind}`} title={KIND_FULL[item.kind]}>
          {KIND_LABEL[item.kind]}
        </span>
        <span className={`due ${due.cls}`}>{due.text}</span>
      </div>
      <div className="title">{item.title}</div>
      <div className="meta">
        {[item.subject, fmtDate(item.due_date) + (item.due_time ? ` · ${item.due_time}` : "")].filter(Boolean).join(" · ")}
      </div>
      {item.notes && !compact && <div className="notes">{item.notes}</div>}
      {(onToggle || onDelete) && (
        <div className="acts">
          {onToggle && <button onClick={() => onToggle(item)}>{item.status === "done" ? "Reopen" : "Mark done"}</button>}
          {onDelete && <button onClick={() => onDelete(item)}>Delete</button>}
        </div>
      )}
    </div>
  );
}
