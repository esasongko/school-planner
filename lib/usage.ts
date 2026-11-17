import { getPool } from "./db";
import { todayInTz } from "./dates";

export const dailyChatLimit = () => {
  const n = Number(process.env.CHAT_DAILY_LIMIT);
  return Number.isInteger(n) && n > 0 ? n : 150;
};

/** Atomically counts one chat call for today; returns false once the daily cap is reached. */
export async function takeChatQuota(limit = dailyChatLimit(), day = todayInTz()): Promise<boolean> {
  const { rowCount } = await getPool().query(
    `INSERT INTO chat_usage (day, count) VALUES ($1, 1)
     ON CONFLICT (day) DO UPDATE SET count = chat_usage.count + 1 WHERE chat_usage.count < $2`,
    [day, limit],
  );
  return (rowCount ?? 0) > 0;
}

/** Records one chat message (and the model tokens it used) against a user, for the superadmin stats. */
export async function recordUserChat(email: string, tokens: { input: number; output: number }, day = todayInTz()): Promise<void> {
  await getPool().query(
    `INSERT INTO chat_usage_user (day, email, messages, input_tokens, output_tokens) VALUES ($1, $2, 1, $3, $4)
     ON CONFLICT (day, email) DO UPDATE SET messages = chat_usage_user.messages + 1,
       input_tokens = chat_usage_user.input_tokens + $3, output_tokens = chat_usage_user.output_tokens + $4`,
    [day, email.toLowerCase(), tokens.input, tokens.output],
  );
}

export interface UserUsage {
  email: string;
  today: number;
  last7: number;
  last30: number;
  input_tokens: number;
  output_tokens: number;
  last_day: string;
}

export interface DayUsage {
  day: string;
  messages: number;
}

/** Per-user totals for the last 30 days plus a per-day series. */
export async function usageStats(today = todayInTz()): Promise<{ users: UserUsage[]; days: DayUsage[]; limit: number; today_total: number }> {
  const pool = getPool();
  const { rows: users } = await pool.query<UserUsage>(
    `SELECT email,
       COALESCE(SUM(messages) FILTER (WHERE day = $1::date), 0)::int AS today,
       COALESCE(SUM(messages) FILTER (WHERE day > $1::date - 7), 0)::int AS last7,
       COALESCE(SUM(messages), 0)::int AS last30,
       COALESCE(SUM(input_tokens), 0)::int AS input_tokens,
       COALESCE(SUM(output_tokens), 0)::int AS output_tokens,
       MAX(day)::text AS last_day
     FROM chat_usage_user WHERE day > $1::date - 30
     GROUP BY email ORDER BY last30 DESC, email`,
    [today],
  );
  const { rows: days } = await pool.query<DayUsage>(
    `SELECT day::text AS day, SUM(messages)::int AS messages FROM chat_usage_user
     WHERE day > $1::date - 14 GROUP BY day ORDER BY day DESC`,
    [today],
  );
  const { rows } = await pool.query<{ count: number }>(`SELECT count FROM chat_usage WHERE day = $1`, [today]);
  return { users, days, limit: dailyChatLimit(), today_total: rows[0]?.count ?? 0 };
}
