import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { isDenied, requireSession } from "@/lib/auth";
import { canDelete } from "@/lib/permissions";
import { deleteItem, getItem, updateItem } from "@/lib/items";

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
    const item = await updateItem({ ...body, id });
    return item ? NextResponse.json({ item }) : NextResponse.json({ error: "Not found" }, { status: 404 });
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
  const existing = await getItem(id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canDelete(session, existing)) return NextResponse.json({ error: "Only a parent can delete this item" }, { status: 403 });
  const item = await deleteItem(id);
  return item ? NextResponse.json({ item }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}
