import Anthropic from "@anthropic-ai/sdk";
import { KINDS, addItem, deleteItem, getItem, listItems, updateItem, type Item } from "./items";
import { todayInTz, weekdayInTz, TZ } from "./dates";
import { canDelete } from "./permissions";
import type { Role } from "./auth";
import { activeTerm, addSlot, createTerm, deleteSlot, getSlot, listSlots, listTerms, updateSlot, updateTerm, type Slot } from "./timetable";
import { z } from "zod";
import { WEEKDAYS } from "./weekdays";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AgentAction {
  type: "added" | "updated" | "deleted";
  item: Item;
}

export interface SlotAction {
  type: "added" | "updated" | "deleted";
  slot: Slot;
}

export interface Actor {
  email: string;
  role: Role;
}

export interface AgentResult {
  reply: string;
  actions: AgentAction[];
  slotActions: SlotAction[];
}

const MAX_TOOL_ROUNDS = 8;

const tools: Anthropic.Tool[] = [
  {
    name: "add_item",
    description:
      "Save a new school item: homework, a ULHA / Ulangan Harian (daily test), a UTS / Ujian Tengah Semester (mid-semester exam) or a UAS / Ujian Akhir Semester (end-of-semester exam). Only call once the title and the date are known.",
    input_schema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: [...KINDS] },
        title: { type: "string", description: "Short title, e.g. 'Chapter 5 worksheet'" },
        subject: { type: "string", description: "School subject, e.g. 'Mathematics'" },
        due_date: { type: "string", description: "YYYY-MM-DD. Exam/quiz date, or the task deadline." },
        due_time: { type: "string", description: "HH:MM 24h, only if the user gave a time" },
        notes: { type: "string", description: "Topics/chapters to study, materials, instructions" },
      },
      required: ["kind", "title", "due_date"],
    },
  },
  {
    name: "update_item",
    description:
      "Change an existing item by id: fix details, reschedule, or mark done/open. Look up the id with list_items first. Pass null to clear subject, due_time or notes.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "integer" },
        kind: { type: "string", enum: [...KINDS] },
        title: { type: "string" },
        subject: { type: ["string", "null"] },
        due_date: { type: "string", description: "YYYY-MM-DD" },
        due_time: { type: ["string", "null"], description: "HH:MM 24h" },
        notes: { type: ["string", "null"] },
        status: { type: "string", enum: ["open", "done"] },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_item",
    description: "Permanently delete an item by id. Only when the user clearly asks to delete/cancel/remove it.",
    input_schema: { type: "object", properties: { id: { type: "integer" } }, required: ["id"] },
  },
  {
    name: "list_items",
    description: "List items sorted by date. Defaults to open items. Use it to answer questions and to find ids.",
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["open", "done", "all"] },
        kind: { type: "string", enum: [...KINDS] },
        subject: { type: "string" },
        from: { type: "string", description: "YYYY-MM-DD, inclusive" },
        to: { type: "string", description: "YYYY-MM-DD, inclusive" },
      },
    },
  },
  {
    name: "add_class",
    description:
      "Add one class period to the weekly timetable (jadwal pelajaran). weekday: 1=Monday ... 7=Sunday. Call once per period.",
    input_schema: {
      type: "object",
      properties: {
        term_id: { type: "integer", description: "Timetable version to add to. Omit for the one in force today; pass the id returned by new_timetable when building a future one." },
        weekday: { type: "integer", description: "1=Monday ... 7=Sunday" },
        start_time: { type: "string", description: "HH:MM 24h" },
        end_time: { type: "string", description: "HH:MM 24h, optional" },
        subject: { type: "string" },
        room: { type: "string", description: "Room or teacher, optional" },
      },
      required: ["weekday", "start_time", "subject"],
    },
  },
  {
    name: "update_class",
    description: "Change a timetable entry by id (look it up with list_classes first). Pass null to clear end_time or room.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "integer" },
        weekday: { type: "integer" },
        start_time: { type: "string" },
        end_time: { type: ["string", "null"] },
        subject: { type: "string" },
        room: { type: ["string", "null"] },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_class",
    description: "Remove a timetable entry by id. Only when the user clearly asks.",
    input_schema: { type: "object", properties: { id: { type: "integer" } }, required: ["id"] },
  },
  {
    name: "list_classes",
    description: "List classes of one timetable version (default: the one in force today), optionally for one weekday (1=Monday ... 7=Sunday). Use it to answer questions and to find ids.",
    input_schema: { type: "object", properties: { weekday: { type: "integer" }, term_id: { type: "integer" } } },
  },
  {
    name: "new_timetable",
    description:
      "Start a new timetable version (e.g. a new semester) with an effective start date. The previous version is automatically ended the day before. Returns its id; then add its classes with add_class using that term_id. Previous timetables stay in history.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "e.g. 'Semester 2 2026/27'" },
        effective_from: { type: "string", description: "YYYY-MM-DD" },
        effective_to: { type: "string", description: "YYYY-MM-DD, optional (leave open-ended if unknown)" },
      },
      required: ["name", "effective_from"],
    },
  },
  {
    name: "update_timetable",
    description: "Rename a timetable version or change its effective dates. Pass effective_to null to make it open-ended.",
    input_schema: {
      type: "object",
      properties: { id: { type: "integer" }, name: { type: "string" }, effective_from: { type: "string" }, effective_to: { type: ["string", "null"] } },
      required: ["id"],
    },
  },
  {
    name: "list_timetables",
    description: "List all timetable versions with their effective dates, newest first, and which one is in force today.",
    input_schema: { type: "object", properties: {} },
  },
];

function systemPrompt(actor: Actor): string {
  const who =
    actor.role === "admin"
      ? "You are talking to the student's parent (admin), who can manage every item."
      : "You are talking to the student. He can add and edit items, but can only delete items he created himself; if a delete is refused, say so in one short sentence and suggest asking a parent.";
  return `You are the school planner assistant for a student. You help him record and manage school homework, ULHA (Ulangan Harian), UTS (Ujian Tengah Semester) and UAS (Ujian Akhir Semester), and answer questions about what is coming up.

${who}

Today is ${weekdayInTz()}, ${todayInTz()} (timezone ${TZ}). Resolve relative dates ("tomorrow", "next Friday", "end of the month") against today and always pass dates to tools as YYYY-MM-DD. "Next <weekday>" means the first such weekday after today.

Rules:
- Record things with the tools; never claim something is saved unless a tool call succeeded.
- Item kinds: "homework" (PR, tugas, assignments, projects); "ulangan_harian" (shown as ULHA = Ulangan Harian, a daily test or quiz; students may also write UH, ulangan, quiz); "uts" (Ujian Tengah Semester, mid-semester exam; also "midterm"); "uas" (Ujian Akhir Semester, end-of-semester exam; also "final exam"). Map the student's words to these. In replies, call them Homework, ULHA, UTS and UAS. If the kind is truly unclear, ask.
- If the date is missing or ambiguous, ask ONE short question instead of guessing. If the subject is obvious from context, fill it in.
- Put study topics, chapters and instructions in notes.
- Before editing or deleting, call list_items to find the right id. If several items could match, ask which one.
- After saving or changing anything, confirm in one short line stating the title, subject, and the date with its weekday (format: "Saved: <kind label> <title>, <Weekday> <day> <Mon>, <notes>."), so mistakes are caught.
- The weekly class timetable (jadwal pelajaran) is separate from items: use add_class / update_class / delete_class / list_classes. Weekdays are numbered 1=Monday to 7=Sunday (${WEEKDAYS.join(", ")}). The timetable is versioned: each version has an effective start date (and an end date once replaced), so old semesters stay as history. For a changed or new semester timetable, call new_timetable with its effective start date first, then add_class for every period with the returned term_id; do not edit the old version. For small fixes to the current timetable, just use update_class. When given a whole timetable, add every period. "Jadwal" and "timetable" mean the same thing. Confirm class changes briefly.
- Stay on school planning. Politely decline unrelated requests in one sentence.
- Reply in the language the student writes in (English, Bahasa Indonesia or Malay), in a friendly, brief tone. Keep replies to a few lines.`;
}

async function runTool(name: string, input: unknown, actions: AgentAction[], slotActions: SlotAction[], actor: Actor): Promise<unknown> {
  switch (name) {
    case "add_item": {
      const item = await addItem(input, actor.email);
      actions.push({ type: "added", item });
      return item;
    }
    case "update_item": {
      const item = await updateItem(input);
      if (!item) return { error: "No item with that id" };
      actions.push({ type: "updated", item });
      return item;
    }
    case "delete_item": {
      const id = (input as { id?: number }).id;
      if (!Number.isInteger(id)) return { error: "id must be an integer" };
      const existing = await getItem(id as number);
      if (!existing) return { error: "No item with that id" };
      if (!canDelete(actor, existing)) return { error: "Not allowed: only a parent can delete items someone else created" };
      const item = await deleteItem(id as number);
      if (!item) return { error: "No item with that id" };
      actions.push({ type: "deleted", item });
      return { deleted: item };
    }
    case "add_class": {
      const slot = await addSlot(input, actor.email);
      slotActions.push({ type: "added", slot });
      return slot;
    }
    case "update_class": {
      const slot = await updateSlot(input);
      if (!slot) return { error: "No class with that id" };
      slotActions.push({ type: "updated", slot });
      return slot;
    }
    case "delete_class": {
      const id = (input as { id?: number }).id;
      if (!Number.isInteger(id)) return { error: "id must be an integer" };
      const existing = await getSlot(id as number);
      if (!existing) return { error: "No class with that id" };
      if (!canDelete(actor, existing)) return { error: "Not allowed: only a parent can delete classes someone else added" };
      const slot = await deleteSlot(id as number);
      if (!slot) return { error: "No class with that id" };
      slotActions.push({ type: "deleted", slot });
      return { deleted: slot };
    }
    case "list_classes": {
      const q = (input ?? {}) as { weekday?: number; term_id?: number };
      return await listSlots(q.term_id, q.weekday);
    }
    case "new_timetable":
      return await createTerm(input);
    case "update_timetable": {
      const { id, ...patch } = z.object({ id: z.number().int().positive(), name: z.string().optional(), effective_from: z.string().optional(), effective_to: z.string().nullable().optional() }).parse(input);
      return (await updateTerm(id, patch)) ?? { error: "No timetable with that id" };
    }
    case "list_timetables":
      return { in_force_today: (await activeTerm())?.id ?? null, timetables: await listTerms() };
    case "list_items":
      return await listItems((input ?? {}) as Parameters<typeof listItems>[0]);
    default:
      return { error: `Unknown tool ${name}` };
  }
}

export async function runAgent(history: ChatMessage[], actor: Actor, injected?: Pick<Anthropic, "messages">): Promise<AgentResult> {
  let client: Pick<Anthropic, "messages"> | undefined = injected;
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
    client = new Anthropic({ apiKey });
  }
  const model = process.env.ANTHROPIC_MODEL || "claude-haiku-5-5";

  const messages: Anthropic.MessageParam[] = history.slice(-20).map((m) => ({
    role: m.role,
    content: m.content,
  }));
  const actions: AgentAction[] = [];
  const slotActions: SlotAction[] = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const res = await client.messages.create({
      model,
      max_tokens: 4096,
      system: systemPrompt(actor),
      tools,
      messages,
    });

    if (res.stop_reason !== "tool_use") {
      const reply = res.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      return { reply: reply || "Done.", actions, slotActions };
    }

    messages.push({ role: "assistant", content: res.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const block of res.content) {
      if (block.type !== "tool_use") continue;
      try {
        const out = await runTool(block.name, block.input, actions, slotActions, actor);
        results.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(out) });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        results.push({ type: "tool_result", tool_use_id: block.id, content: `Error: ${msg}`, is_error: true });
      }
    }
    messages.push({ role: "user", content: results });
  }

  return { reply: "Sorry, I got stuck on that. Could you try again with a bit more detail?", actions, slotActions };
}
