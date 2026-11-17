import type { Role } from "./auth";

type Actor = { email: string; role: Role };

/** Superadmin and admin (parent) can delete any item; a child can delete only items they created. */
export function canDelete(actor: Actor, item: { created_by: string | null }): boolean {
  if (actor.role === "superadmin" || actor.role === "admin") return true;
  return item.created_by !== null && item.created_by.toLowerCase() === actor.email.toLowerCase();
}

/** Timetable classes can only be deleted by the superadmin. */
export function canDeleteSlot(actor: Actor): boolean {
  return actor.role === "superadmin";
}
