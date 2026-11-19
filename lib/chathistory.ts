import { getPool } from "./db";

export interface StoredMsg {
  role: "user" | "assistant";
  content: string;
  actions?: unknown[];
  slotActions?: unknown[];
}

const KEEP = 200;

export async function loadHistory(email: string, limit = 100): Promise<StoredMsg[]> {
  const { rows } = await getPool().query(
    `SELECT role, content, extra FROM (SELECT id, role, content, extra FROM chat_messages WHERE email = $1 ORDER BY id DESC LIMIT $2) t ORDER BY id`,
    [email.toLowerCase(), limit],
  );
  return rows.map((r) => ({ role: r.role, content: r.content, ...(r.extra ?? {}) }));
}

export async function saveExchange(email: string, userText: string, reply: { content: string; actions?: unknown[]; slotActions?: unknown[] }): Promise<void> {
  const e = email.toLowerCase();
  const extra = reply.actions?.length || reply.slotActions?.length ? { actions: reply.actions, slotActions: reply.slotActions } : null;
  const pool = getPool();
  await pool.query(
    `INSERT INTO chat_messages (email, role, content) VALUES ($1,'user',$2)`,
    [e, userText],
  );
  await pool.query(`INSERT INTO chat_messages (email, role, content, extra) VALUES ($1,'assistant',$2,$3)`, [e, reply.content, extra]);
  await pool.query(`DELETE FROM chat_messages WHERE email = $1 AND id <= (SELECT id FROM chat_messages WHERE email = $1 ORDER BY id DESC OFFSET $2 LIMIT 1)`, [e, KEEP]);
}

export async function clearHistory(email: string): Promise<void> {
  await getPool().query(`DELETE FROM chat_messages WHERE email = $1`, [email.toLowerCase()]);
}
