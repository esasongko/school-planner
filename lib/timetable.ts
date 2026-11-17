import { z } from "zod";
import { getPool } from "./db";
import { isValidDate, isValidTime, todayInTz } from "./dates";

export interface Term {
  id: number;
  name: string;
  effective_from: string; // YYYY-MM-DD
  effective_to: string | null; // null = open-ended
}

export interface Slot {
  id: number;
  term_id: number;
  weekday: number; // 1 = Monday ... 7 = Sunday
  start_time: string; // HH:MM
  end_time: string | null;
  subject: string;
  room: string | null;
  created_by: string | null;
}

const timeStr = z.string().refine(isValidTime, "time must be HH:MM (24h)");

export const AddSlotInput = z.object({
  term_id: z.number().int().positive().nullish(),
  weekday: z.number().int().min(1).max(7),
  start_time: timeStr,
  end_time: timeStr.nullish(),
  subject: z.string().trim().min(1).max(80),
  room: z.string().trim().max(40).nullish(),
});

export const UpdateSlotInput = z.object({
  id: z.number().int().positive(),
  weekday: z.number().int().min(1).max(7).optional(),
  start_time: timeStr.optional(),
  end_time: timeStr.nullish(),
  subject: z.string().trim().min(1).max(80).optional(),
  room: z.string().trim().max(40).nullish(),
});

const COLS = `id, term_id, weekday, to_char(start_time,'HH24:MI') AS start_time, to_char(end_time,'HH24:MI') AS end_time, subject, room, created_by`;

export async function addSlot(input: unknown, createdBy?: string): Promise<Slot> {
  const v = AddSlotInput.parse(input);
  const termId = v.term_id ?? (await activeTerm())?.id;
  if (!termId) throw new Error("No timetable exists yet. Create one first with new_timetable.");
  const { rows } = await getPool().query<Slot>(
    `INSERT INTO timetable (term_id, weekday, start_time, end_time, subject, room, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING ${COLS}`,
    [termId, v.weekday, v.start_time, v.end_time ?? null, v.subject, v.room ?? null, createdBy?.toLowerCase() ?? null],
  );
  return rows[0];
}

export async function getSlot(id: number): Promise<Slot | null> {
  const { rows } = await getPool().query<Slot>(`SELECT ${COLS} FROM timetable WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

export async function updateSlot(input: unknown): Promise<Slot | null> {
  const v = UpdateSlotInput.parse(input);
  const sets: string[] = [];
  const vals: unknown[] = [];
  const add = (col: string, val: unknown) => {
    vals.push(val);
    sets.push(`${col} = $${vals.length}`);
  };
  if (v.weekday !== undefined) add("weekday", v.weekday);
  if (v.start_time !== undefined) add("start_time", v.start_time);
  if (v.end_time !== undefined) add("end_time", v.end_time);
  if (v.subject !== undefined) add("subject", v.subject);
  if (v.room !== undefined) add("room", v.room);
  if (sets.length === 0) return getSlot(v.id);
  vals.push(v.id);
  const { rows } = await getPool().query<Slot>(
    `UPDATE timetable SET ${sets.join(", ")} WHERE id = $${vals.length} RETURNING ${COLS}`,
    vals,
  );
  return rows[0] ?? null;
}

export async function deleteSlot(id: number): Promise<Slot | null> {
  const { rows } = await getPool().query<Slot>(`DELETE FROM timetable WHERE id = $1 RETURNING ${COLS}`, [id]);
  return rows[0] ?? null;
}

export async function listSlots(termId?: number, weekday?: number): Promise<Slot[]> {
  const where: string[] = [];
  const vals: unknown[] = [];
  const tid = termId ?? (await activeTerm())?.id;
  if (!tid) return [];
  vals.push(tid);
  where.push(`term_id = $${vals.length}`);
  if (weekday) {
    vals.push(weekday);
    where.push(`weekday = $${vals.length}`);
  }
  const { rows } = await getPool().query<Slot>(
    `SELECT ${COLS} FROM timetable WHERE ${where.join(" AND ")} ORDER BY weekday, start_time, id`,
    vals,
  );
  return rows;
}

export async function allSlots(): Promise<Slot[]> {
  const { rows } = await getPool().query<Slot>(`SELECT ${COLS} FROM timetable ORDER BY weekday, start_time, id`);
  return rows;
}

// ---- terms (timetable versions) ----

export async function listTerms(): Promise<Term[]> {
  const { rows } = await getPool().query<Term>(
    `SELECT id, name, effective_from, effective_to FROM timetable_terms ORDER BY effective_from DESC, id DESC`,
  );
  return rows;
}

/** The timetable in force on `day` (latest start wins if ranges overlap). */
export async function activeTerm(day = todayInTz()): Promise<Term | null> {
  const { rows } = await getPool().query<Term>(
    `SELECT id, name, effective_from, effective_to FROM timetable_terms
     WHERE effective_from <= $1 AND (effective_to IS NULL OR effective_to >= $1)
     ORDER BY effective_from DESC, id DESC LIMIT 1`,
    [day],
  );
  return rows[0] ?? null;
}

const dateStr = z.string().refine(isValidDate, "date must be a real date, YYYY-MM-DD");
export const NewTermInput = z.object({
  name: z.string().trim().min(1).max(80),
  effective_from: dateStr,
  effective_to: dateStr.nullish(),
});

/**
 * Starts a new timetable version. Any earlier open-ended (or overlapping) version is closed
 * the day before, so history keeps clean, non-overlapping date ranges.
 */
export async function createTerm(input: unknown): Promise<Term> {
  const v = NewTermInput.parse(input);
  if (v.effective_to && v.effective_to < v.effective_from) throw new Error("effective_to must not be before effective_from");
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE timetable_terms SET effective_to = ($1::date - 1)
       WHERE effective_from < $1::date AND (effective_to IS NULL OR effective_to >= $1::date)`,
      [v.effective_from],
    );
    const { rows } = await client.query<Term>(
      `INSERT INTO timetable_terms (name, effective_from, effective_to) VALUES ($1,$2,$3)
       RETURNING id, name, effective_from, effective_to`,
      [v.name, v.effective_from, v.effective_to ?? null],
    );
    await client.query("COMMIT");
    return rows[0];
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function updateTerm(id: number, patch: { name?: string; effective_from?: string; effective_to?: string | null }): Promise<Term | null> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  const add = (c: string, x: unknown) => {
    vals.push(x);
    sets.push(`${c} = $${vals.length}`);
  };
  if (patch.name !== undefined) add("name", z.string().trim().min(1).max(80).parse(patch.name));
  if (patch.effective_from !== undefined) add("effective_from", dateStr.parse(patch.effective_from));
  if (patch.effective_to !== undefined) add("effective_to", patch.effective_to === null ? null : dateStr.parse(patch.effective_to));
  if (!sets.length) return (await listTerms()).find((t) => t.id === id) ?? null;
  vals.push(id);
  const { rows } = await getPool().query<Term>(
    `UPDATE timetable_terms SET ${sets.join(", ")} WHERE id = $${vals.length}
     RETURNING id, name, effective_from, effective_to`,
    vals,
  );
  return rows[0] ?? null;
}
