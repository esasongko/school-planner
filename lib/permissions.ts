import type { Role } from "./auth";

/** Admin (parent) can delete anything; a child can delete only items they created. */
export function canDelete(actor: { email: string; role: Role }, item: { created_by: string | null }): boolean {
  if (actor.role === "admin") return true;
  return item.created_by !== null && item.created_by.toLowerCase() === actor.email.toLowerCase();
}
