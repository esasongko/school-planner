import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { isDenied, requireSession } from "@/lib/auth";
import { canDeleteSlot } from "@/lib/permissions";
import { deleteSlot, getSlot, updateSlot } from "@/lib/timetable";

type Ctx = { params: Promise<{ id: string }> };

async function idOf(ctx: Ctx): Promise<number | null> {
  const n = Number((await ctx.params).id);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const session = requireSession(req);
  if (isDenied(session)) return session;
  const id = await idOf(ctx);
  if (!id) return NextResponse.json({ error: "Bad id" }, { status: 400 });
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const slot = await updateSlot({ ...body, id });
    return slot ? NextResponse.json({ slot }) : NextResponse.json({ error: "Not found" }, { status: 404 });
  } catch (e) {
    if (e instanceof ZodError) return NextResponse.json({ error: "Invalid input", issues: e.issues }, { status: 400 });
    throw e;
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const session = requireSession(req);
  if (isDenied(session)) return session;
  const id = await idOf(ctx);
  if (!id) return NextResponse.json({ error: "Bad id" }, { status: 400 });
  const existing = await getSlot(id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canDeleteSlot(session)) return NextResponse.json({ error: "Only the superadmin can delete timetable classes" }, { status: 403 });
  const slot = await deleteSlot(id);
  return slot ? NextResponse.json({ slot }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}
