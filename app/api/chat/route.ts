import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isDenied, requireSession } from "@/lib/auth";
import { runAgent } from "@/lib/agent";
import { recordUserChat, takeChatQuota } from "@/lib/usage";

export const maxDuration = 60;

const Body = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) }))
    .min(1)
    .max(40),
});

export async function POST(req: NextRequest) {
  const session = requireSession(req);
  if (isDenied(session)) return session;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success || parsed.data.messages.at(-1)?.role !== "user") {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  if (!(await takeChatQuota())) {
    return NextResponse.json({ error: "Daily chat limit reached. Try again tomorrow, or add items from the other tabs." }, { status: 429 });
  }
  try {
    const { usage, ...result } = await runAgent(parsed.data.messages, session);
    await recordUserChat(session.email, usage).catch((e) => console.error("usage log failed", e));
    return NextResponse.json(result);
  } catch (e) {
    console.error("chat error", e);
    return NextResponse.json({ error: "The assistant is unavailable right now. Try again in a moment." }, { status: 502 });
  }
}
