import { sendNotification, setVapidDetails } from "web-push";
import { getPool } from "./db";
import { daysBetween, todayInTz } from "./dates";
import { KIND_LABEL, type Item } from "./items";
import { parseAllowlist } from "./auth";

export type Stage = "7d" | "3d" | "1d" | "0d";

/**
 * Which reminder stage (if any) applies to an item due `daysLeft` days from today.
 * Homework: 1 day before + the day. Ulangan Harian: 3d, 1d, 0d. UTS/UAS: 7d, 3d, 1d, 0d.
 */
export function stageFor(kind: Item["kind"], daysLeft: number): Stage | null {
  if (daysLeft === 0) return "0d";
  if (daysLeft === 1) return "1d";
  if (daysLeft === 3 && kind !== "homework") return "3d";
  if (daysLeft === 7 && (kind === "uts" || kind === "uas")) return "7d";
  return null;
}

export function reminderText(item: Pick<Item, "kind" | "title" | "subject" | "due_time">, stage: Stage) {
  const when = stage === "0d" ? "today" : stage === "1d" ? "tomorrow" : stage === "3d" ? "in 3 days" : "in 1 week";
  const at = item.due_time ? ` at ${item.due_time}` : "";
  const subject = item.subject ? ` (${item.subject})` : "";
  return {
    title: `${KIND_LABEL[item.kind]} ${when}${at}`,
    body: `${item.title}${subject}`,
  };
}

export interface PendingReminder {
  item: Item;
  stage: Stage;
}

/** Items that need a reminder today and haven't had it yet. */
export async function pendingReminders(today = todayInTz()): Promise<PendingReminder[]> {
  const { rows } = await getPool().query<Item>(
    `SELECT id, kind, title, subject, due_date, to_char(due_time,'HH24:MM') AS due_time, notes, status, created_by
     FROM items
     WHERE status = 'open' AND due_date BETWEEN $1::date AND ($1::date + 7)
     ORDER BY due_date, due_time NULLS LAST`,
    [today],
  );
  const out: PendingReminder[] = [];
  for (const item of rows) {
    const stage = stageFor(item.kind, daysBetween(today, item.due_date));
    if (!stage) continue;
    const sent = await getPool().query(
      `SELECT 1 FROM reminders_sent WHERE item_id=$1 AND stage=$2 AND due_date=$3`,
      [item.id, stage, item.due_date],
    );
    if (sent.rowCount === 0) out.push({ item, stage });
  }
  return out;
}

export function pushConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);
}

export interface RunSummary {
  today: string;
  pending: number;
  sent: number;
  skippedNoPush: boolean;
  removedSubscriptions: number;
}

export async function runReminders(opts: { dryRun?: boolean } = {}): Promise<RunSummary> {
  const today = todayInTz();
  const pending = await pendingReminders(today);
  const summary: RunSummary = { today, pending: pending.length, sent: 0, skippedNoPush: false, removedSubscriptions: 0 };
  if (opts.dryRun) return summary;
  if (!pushConfigured()) {
    summary.skippedNoPush = true;
    return summary;
  }
  setVapidDetails(process.env.VAPID_SUBJECT!, process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);

  const pool = getPool();
  // Only devices belonging to people still on the allowlist get notifications.
  const allowed = parseAllowlist();
  const subs = (await pool.query<{ id: number; endpoint: string; p256dh: string; auth: string; user_email: string | null }>(
    `SELECT id, endpoint, p256dh, auth, user_email FROM push_subscriptions`,
  )).rows.filter((s) => s.user_email !== null && allowed.has(s.user_email.toLowerCase()));
  if (subs.length === 0) return { ...summary, skippedNoPush: true };

  for (const { item, stage } of pending) {
    const text = reminderText(item, stage);
    const payload = JSON.stringify({ ...text, url: "/" , tag: `item-${item.id}-${stage}` });
    let delivered = 0;
    for (const s of subs) {
      try {
        await sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
        delivered++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await pool.query(`DELETE FROM push_subscriptions WHERE id=$1`, [s.id]);
          summary.removedSubscriptions++;
        }
      }
    }
    // Only mark as sent if at least one device received it, so failures are retried next run.
    if (delivered > 0) {
      await pool.query(
        `INSERT INTO reminders_sent (item_id, stage, due_date) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
        [item.id, stage, item.due_date],
      );
      summary.sent++;
    }
  }
  return summary;
}
