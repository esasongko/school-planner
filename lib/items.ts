import { getPool } from "./db";
import { isValidDate, isValidTime } from "./dates";
import { z } from "zod";

import { KINDS, type Kind } from "./kinds";
export { KINDS, KIND_LABEL, type Kind } from "./kinds";

export interface Item {
  id: number;
  kind: Kind;
  title: string;
  subject: string | null;
  due_date: string; // YYYY-MM-DD
  due_time: string | null; // HH:MM[:SS]
  notes: string | null;
  status: "open" | "done";
  created_by: string | null;
}

const dateStr = z.string().refine(isValidDate, "due_date must be a real date, YYYY-MM-DD");
const timeStr = z.string().refine(isValidTime, "due_time must be HH:MM (24h)");

export const AddItemInput = z.object({
  kind: z.enum(KINDS),
  title: z.string().trim().min(1).max(200),
  subject: z.string().trim().max(80).nullish(),
  due_date: dateStr,
  due_time: timeStr.nullish(),
  notes: z.string().trim().max(2000).nullish(),
});

export const UpdateItemInput = z.object({
  id: z.number().int().positive(),
  kind: z.enum(KINDS).optional(),
  title: z.string().trim().min(1).max(200).optional(),
  subject: z.string().trim().max(80).nullish(),
  due_date: dateStr.optional(),
  due_time: timeStr.nullish(),
  notes: z.string().trim().max(2000).nullish(),
  status: z.enum(["open", "done"]).optional(),
});

const COLS = `id, kind, title, subject, due_date, to_char(due_time, 'HH24:MI') AS due_time, notes, status, created_by`;

export async function addItem(input: unknown, createdBy?: string): Promise<Item> {
  const v = AddItemInput.parse(input);
  const { rows } = await getPool().query<Item>(
    `INSERT INTO items (kind, title, subject, due_date, due_time, notes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING ${COLS}`,
    [v.kind, v.title, v.subject ?? null, v.due_date, v.due_time ?? null, v.notes ?? null, createdBy?.toLowerCase() ?? null],
  );
  return rows[0];
}

export async function updateItem(input: unknown): Promise<Item | null> {
  const v = UpdateItemInput.parse(input);
  const sets: string[] = [];
  const vals: unknown[] = [];
  const add = (col: string, val: unknown) => {
    vals.push(val);
    sets.push(`${col} = $${vals.length}`);
  };
  // `undefined` = leave unchanged; `null` = clear (for nullable columns).
  if (v.kind !== undefined) add("kind", v.kind);
  if (v.title !== undefined) add("title", v.title);
  if (v.subject !== undefined) add("subject", v.subject);
  if (v.due_date !== undefined) add("due_date", v.due_date);
  if (v.due_time !== undefined) add("due_time", v.due_time);
  if (v.notes !== undefined) add("notes", v.notes);
  if (v.status !== undefined) add("status", v.status);
  if (sets.length === 0) return getItem(v.id);
  vals.push(v.id);
  const { rows } = await getPool().query<Item>(
    `UPDATE items SET ${sets.join(", ")}, updated_at = now() WHERE id = $${vals.length} RETURNING ${COLS}`,
    vals,
  );
  return rows[0] ?? null;
}

export async function getItem(id: number): Promise<Item | null> {
  const { rows } = await getPool().query<Item>(`SELECT ${COLS} FROM items WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

export async function deleteItem(id: number): Promise<Item | null> {
  const { rows } = await getPool().query<Item>(`DELETE FROM items WHERE id = $1 RETURNING ${COLS}`, [id]);
  return rows[0] ?? null;
}

export interface ListFilter {
  status?: "open" | "done" | "all";
  kind?: Kind;
  subject?: string;
  from?: string;
  to?: string;
  limit?: number;
}

export async function listItems(f: ListFilter = {}): Promise<Item[]> {
  const where: string[] = [];
  const vals: unknown[] = [];
  const push = (clause: string, val: unknown) => {
    vals.push(val);
    where.push(clause.replace("?", `$${vals.length}`));
  };
  const status = f.status ?? "open";
  if (status !== "all") push("status = ?", status);
  if (f.kind) push("kind = ?", f.kind);
  if (f.subject) push("subject ILIKE ?", `%${f.subject}%`);
  if (f.from && isValidDate(f.from)) push("due_date >= ?", f.from);
  if (f.to && isValidDate(f.to)) push("due_date <= ?", f.to);
  vals.push(Math.min(Math.max(f.limit ?? 100, 1), 200));
  const { rows } = await getPool().query<Item>(
    `SELECT ${COLS} FROM items ${where.length ? "WHERE " + where.join(" AND ") : ""}
     ORDER BY due_date, due_time NULLS LAST, id LIMIT $${vals.length}`,
    vals,
  );
  return rows;
}
