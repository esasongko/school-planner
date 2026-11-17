import assert from "node:assert/strict";
import { getPool } from "../lib/db";
import { addItem, deleteItem, listItems, updateItem } from "../lib/items";
import { daysBetween, isValidDate, todayInTz } from "../lib/dates";
import { pendingReminders, reminderText, stageFor } from "../lib/reminders";
import { runAgent, type Actor } from "../lib/agent";
import { canDelete } from "../lib/permissions";
import { KIND_FULL, KIND_LABEL } from "../lib/kinds";
import { takeChatQuota } from "../lib/usage";
import { bypassSession } from "../lib/auth";
import { createSessionToken, parseAllowlist, readSessionToken, roleFor } from "../lib/auth";

let passed = 0;
async function t(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passed++;
    console.log("  ok  ", name);
  } catch (e) {
    console.error("  FAIL", name, "\n      ", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  }
}

const plus = (n: number) => {
  const d = new Date(Date.parse(todayInTz() + "T00:00:00Z") + n * 86_400_000);
  return d.toISOString().slice(0, 10);
};

const parent: Actor = { email: "parent@example.com", role: "admin" };
const kid: Actor = { email: "kid@example.com", role: "child" };

async function main() {
  const pool = getPool();
  await pool.query("TRUNCATE items, reminders_sent RESTART IDENTITY CASCADE");

  console.log("dates");
  await t("daysBetween", () => {
    assert.equal(daysBetween("2026-11-17", "2026-11-20"), 3);
    assert.equal(daysBetween("2026-11-17", "2026-11-16"), -1);
    assert.equal(daysBetween("2026-02-27", "2026-03-01"), 2);
  });
  await t("isValidDate rejects impossible dates", () => {
    assert.equal(isValidDate("2026-02-30"), false);
    assert.equal(isValidDate("21/11/2026"), false);
    assert.equal(isValidDate("2026-11-21"), true);
  });

  console.log("items");
  await t("add validates input", async () => {
    await assert.rejects(addItem({ kind: "uts", title: "x", due_date: "2026-02-30" }));
    await assert.rejects(addItem({ kind: "quiz", title: "x", due_date: "2026-11-21" }));
    await assert.rejects(addItem({ kind: "homework", title: "  ", due_date: "2026-11-21" }));
    await assert.rejects(addItem({ kind: "homework", title: "x", due_date: "2026-11-21", due_time: "25:00" }));
  });
  let id = 0;
  await t("add + read back (date stays a string, time formatted)", async () => {
    const it = await addItem({ kind: "ulangan_harian", title: "Ch 5-6 quiz", subject: "Math", due_date: "2026-11-21", due_time: "08:30", notes: "fractions" });
    id = it.id;
    assert.equal(it.due_date, "2026-11-21");
    assert.equal(it.due_time, "08:30");
    assert.equal(it.status, "open");
  });
  await t("update changes only given fields; null clears", async () => {
    const a = await updateItem({ id, due_date: "2026-11-24" });
    assert.equal(a?.due_date, "2026-11-24");
    assert.equal(a?.subject, "Math");
    assert.equal(a?.notes, "fractions");
    const b = await updateItem({ id, notes: null, due_time: null });
    assert.equal(b?.notes, null);
    assert.equal(b?.due_time, null);
    assert.equal(b?.title, "Ch 5-6 quiz");
  });
  await t("update missing id returns null", async () => {
    assert.equal(await updateItem({ id: 99999, title: "x" }), null);
  });
  await t("list filters + ordering + status", async () => {
    await addItem({ kind: "homework", title: "Essay", subject: "English", due_date: "2026-11-20" });
    await addItem({ kind: "uts", title: "Midterm", subject: "Science", due_date: "2026-12-01" });
    const all = await listItems();
    assert.deepEqual(all.map((i) => i.due_date), ["2026-11-20", "2026-11-24", "2026-12-01"]);
    assert.equal((await listItems({ kind: "uts" })).length, 1);
    assert.equal((await listItems({ subject: "math" })).length, 1);
    assert.equal((await listItems({ from: "2026-11-21", to: "2026-11-30" })).length, 1);
    await updateItem({ id, status: "done" });
    assert.equal((await listItems()).length, 2);
    assert.equal((await listItems({ status: "done" })).length, 1);
    assert.equal((await listItems({ status: "all" })).length, 3);
  });
  await t("delete", async () => {
    assert.ok(await deleteItem(id));
    assert.equal(await deleteItem(id), null);
  });

  console.log("reminders");
  await t("stageFor rules", () => {
    assert.equal(stageFor("uts", 7), "7d");
    assert.equal(stageFor("uas", 7), "7d");
    assert.equal(stageFor("ulangan_harian", 7), null);
    assert.equal(stageFor("homework", 7), null);
    assert.equal(stageFor("uts", 3), "3d");
    assert.equal(stageFor("ulangan_harian", 3), "3d");
    assert.equal(stageFor("homework", 3), null);
    assert.equal(stageFor("homework", 1), "1d");
    assert.equal(stageFor("uas", 0), "0d");
    assert.equal(stageFor("uts", 2), null);
    assert.equal(stageFor("uts", -1), null);
  });
  await t("kind labels: short on badges, full names in tooltips", () => {
    assert.deepEqual(KIND_LABEL, { homework: "Homework", ulangan_harian: "ULHA", uts: "UTS", uas: "UAS" });
    assert.equal(KIND_FULL.ulangan_harian, "Ulangan Harian");
    assert.equal(KIND_FULL.uts, "Ujian Tengah Semester");
    assert.equal(KIND_FULL.uas, "Ujian Akhir Semester");
  });
  await t("reminderText", () => {
    const r = reminderText({ kind: "uts", title: "Midterm", subject: "Science", due_time: "09:00" }, "1d");
    assert.equal(r.title, "UTS tomorrow at 09:00");
    assert.equal(reminderText({ kind: "ulangan_harian", title: "UH Bahasa", subject: null, due_time: null }, "0d").title, "ULHA today");
    assert.equal(r.body, "Midterm (Science)");
  });
  await t("pendingReminders picks the right items and respects sent log", async () => {
    await pool.query("TRUNCATE items, reminders_sent RESTART IDENTITY CASCADE");
    const ex3 = await addItem({ kind: "uts", title: "E3", due_date: plus(3) });
    await addItem({ kind: "homework", title: "T3-none", due_date: plus(3) });
    const tk1 = await addItem({ kind: "homework", title: "T1", due_date: plus(1) });
    const qz0 = await addItem({ kind: "ulangan_harian", title: "Q0", due_date: plus(0) });
    await addItem({ kind: "uts", title: "E5-none", due_date: plus(5) });
    await addItem({ kind: "uas", title: "U7", due_date: plus(7) });
    await addItem({ kind: "ulangan_harian", title: "UH7-none", due_date: plus(7) });
    await addItem({ kind: "uts", title: "Past-none", due_date: plus(-1) });
    const done = await addItem({ kind: "uts", title: "Done-none", due_date: plus(1) });
    await updateItem({ id: done.id, status: "done" });

    const p = await pendingReminders();
    assert.deepEqual(
      p.map((x) => `${x.item.title}:${x.stage}`).sort(),
      [`E3:3d`, `Q0:0d`, `T1:1d`, `U7:7d`].sort(),
    );
    await pool.query(`INSERT INTO reminders_sent (item_id, stage, due_date) VALUES ($1,'3d',$2)`, [ex3.id, ex3.due_date]);
    assert.equal((await pendingReminders()).length, 3);
    // Rescheduling the item (new due date) must allow a fresh reminder.
    await updateItem({ id: tk1.id, due_date: plus(0) });
    const after = (await pendingReminders()).map((x) => `${x.item.title}:${x.stage}`).sort();
    assert.deepEqual(after, [`Q0:0d`, `T1:0d`, `U7:7d`].sort());
    void qz0;
  });

  console.log("agent (fake model)");
  type Resp = { stop_reason: string; content: unknown[] };
  const fake = (script: Resp[]) => {
    const calls: unknown[] = [];
    return {
      calls,
      client: {
        messages: {
          create: async (args: unknown) => {
            calls.push(JSON.parse(JSON.stringify(args)));
            const next = script.shift();
            if (!next) throw new Error("script exhausted");
            return next;
          },
        },
      } as never,
    };
  };
  await t("tool loop saves the item and returns actions + reply", async () => {
    await pool.query("TRUNCATE items, reminders_sent RESTART IDENTITY CASCADE");
    const f = fake([
      { stop_reason: "tool_use", content: [{ type: "tool_use", id: "tu1", name: "add_item", input: { kind: "ulangan_harian", title: "Quiz", subject: "Math", due_date: plus(4), notes: "Ch 5-6" } }] },
      { stop_reason: "end_turn", content: [{ type: "text", text: "Saved: Math quiz." }] },
    ]);
    const r = await runAgent([{ role: "user", content: "math quiz in 4 days ch 5-6" }], parent, f.client);
    assert.equal(r.reply, "Saved: Math quiz.");
    assert.equal(r.actions.length, 1);
    assert.equal(r.actions[0].type, "added");
    assert.equal((await listItems()).length, 1);
    // second call must include the tool_result for tu1
    const second = JSON.stringify((f.calls[1] as { messages: unknown }).messages);
    assert.ok(second.includes("tool_result") && second.includes("tu1"));
    // system prompt carries today's date
    assert.ok(String((f.calls[0] as { system: string }).system).includes(todayInTz()));
  });
  await t("invalid tool input is reported back to the model, not saved, loop continues", async () => {
    const before = (await listItems()).length;
    const f = fake([
      { stop_reason: "tool_use", content: [{ type: "tool_use", id: "tu2", name: "add_item", input: { kind: "uts", title: "Bad", due_date: "2026-02-30" } }] },
      { stop_reason: "end_turn", content: [{ type: "text", text: "That date doesn't exist - which day did you mean?" }] },
    ]);
    const r = await runAgent([{ role: "user", content: "exam on 30 feb" }], parent, f.client);
    assert.equal(r.actions.length, 0);
    assert.equal((await listItems()).length, before);
    assert.ok(JSON.stringify((f.calls[1] as { messages: unknown }).messages).includes('"is_error":true'));
    assert.ok(r.reply.includes("which day"));
  });
  await t("update + delete via agent", async () => {
    const [it] = await listItems();
    const f = fake([
      { stop_reason: "tool_use", content: [{ type: "tool_use", id: "a", name: "update_item", input: { id: it.id, due_date: plus(6) } }, { type: "tool_use", id: "b", name: "delete_item", input: { id: 424242 } }] },
      { stop_reason: "end_turn", content: [{ type: "text", text: "ok" }] },
    ]);
    const r = await runAgent([{ role: "user", content: "move it" }], parent, f.client);
    assert.deepEqual(r.actions.map((a) => a.type), ["updated"]);
    assert.equal((await listItems())[0].due_date, plus(6));
  });
  await t("runaway tool loop is capped", async () => {
    const loop: Resp = { stop_reason: "tool_use", content: [{ type: "tool_use", id: "x", name: "list_items", input: {} }] };
    const f = fake(Array.from({ length: 10 }, () => loop));
    const r = await runAgent([{ role: "user", content: "hi" }], parent, f.client);
    assert.ok(r.reply.startsWith("Sorry"));
    assert.equal(f.calls.length, 6);
  });

  console.log("auth + permissions");
  await t("allowlist parsing", () => {
    const m = parseAllowlist(" A@x.com:admin , b@x.com:child ,");
    assert.equal(m.get("a@x.com"), "admin");
    assert.equal(m.get("b@x.com"), "child");
    assert.throws(() => parseAllowlist("c@x.com:owner"));
    assert.throws(() => parseAllowlist("c@x.com"));
    assert.equal(parseAllowlist("").size, 0);
  });
  await t("roleFor is case-insensitive and rejects strangers", () => {
    assert.equal(roleFor("PARENT@example.com"), "admin");
    assert.equal(roleFor("kid@example.com"), "child");
    assert.equal(roleFor("stranger@example.com"), null);
  });
  await t("session token: valid, tampered, expired, revoked", () => {
    const tok = createSessionToken("kid@example.com", "Kid");
    assert.deepEqual(readSessionToken(tok), { email: "kid@example.com", role: "child", name: "Kid" });
    const [body, sig] = tok.split(".");
    const forged = Buffer.from(JSON.stringify({ e: "parent@example.com", x: 9999999999 })).toString("base64url");
    assert.equal(readSessionToken(`${forged}.${sig}`), null);
    assert.equal(readSessionToken(`${body}.${sig.slice(0, -2)}xx`), null);
    assert.equal(readSessionToken(tok, Date.now() + 91 * 86_400_000), null);
    assert.equal(readSessionToken(createSessionToken("stranger@example.com")), null);
    assert.equal(readSessionToken(undefined), null);
    assert.equal(readSessionToken("garbage"), null);
  });
  await t("canDelete: parent any, child only own", () => {
    assert.equal(canDelete(parent, { created_by: "kid@example.com" }), true);
    assert.equal(canDelete(kid, { created_by: "KID@example.com" }), true);
    assert.equal(canDelete(kid, { created_by: "parent@example.com" }), false);
    assert.equal(canDelete(kid, { created_by: null }), false);
  });
  await t("agent: child cannot delete parent's item but can delete own", async () => {
    await pool.query("TRUNCATE items, reminders_sent RESTART IDENTITY CASCADE");
    const theirs = await addItem({ kind: "uas", title: "Final", due_date: plus(10) }, parent.email);
    const mine = await addItem({ kind: "homework", title: "Mine", due_date: plus(2) }, kid.email);
    const f = fake([
      { stop_reason: "tool_use", content: [{ type: "tool_use", id: "d1", name: "delete_item", input: { id: theirs.id } }, { type: "tool_use", id: "d2", name: "delete_item", input: { id: mine.id } }] },
      { stop_reason: "end_turn", content: [{ type: "text", text: "ok" }] },
    ]);
    const r = await runAgent([{ role: "user", content: "delete both" }], kid, f.client);
    assert.deepEqual(r.actions.map((a) => `${a.type}:${a.item.title}`), ["deleted:Mine"]);
    assert.equal((await listItems()).length, 1);
    assert.ok(JSON.stringify((f.calls[1] as { messages: unknown }).messages).includes("Not allowed"));
  });
  await t("agent: items are stamped with the creator", async () => {
    const f = fake([
      { stop_reason: "tool_use", content: [{ type: "tool_use", id: "c1", name: "add_item", input: { kind: "uts", title: "UTS IPA", due_date: plus(9) } }] },
      { stop_reason: "end_turn", content: [{ type: "text", text: "saved" }] },
    ]);
    const r = await runAgent([{ role: "user", content: "UTS IPA" }], kid, f.client);
    assert.equal(r.actions[0].item.created_by, "kid@example.com");
    assert.ok(String((f.calls[0] as { system: string }).system).includes("only delete items he created"));
  });
  await t("chat quota allows exactly `limit` calls per day, then refuses; new day resets", async () => {
    await pool.query("TRUNCATE chat_usage");
    const results = await Promise.all(Array.from({ length: 8 }, () => takeChatQuota(5, "2030-01-01")));
    assert.equal(results.filter(Boolean).length, 5);
    assert.equal(await takeChatQuota(5, "2030-01-01"), false);
    assert.equal(await takeChatQuota(5, "2030-01-02"), true);
  });
  await t("bypass: off by default, on only for allowlisted email", () => {
    delete process.env.AUTH_BYPASS_EMAIL;
    assert.equal(bypassSession(), null);
    process.env.AUTH_BYPASS_EMAIL = "KID@example.com";
    assert.deepEqual(bypassSession(), { email: "kid@example.com", role: "child" });
    process.env.AUTH_BYPASS_EMAIL = "stranger@example.com";
    assert.equal(bypassSession(), null);
    delete process.env.AUTH_BYPASS_EMAIL;
  });

  await pool.query("TRUNCATE items, reminders_sent RESTART IDENTITY CASCADE");
  await pool.end();
  console.log(`\n${passed} passed${process.exitCode ? ", with failures" : ""}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
