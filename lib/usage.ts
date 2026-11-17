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
