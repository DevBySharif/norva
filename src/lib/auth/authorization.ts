import "server-only";
export type UserRole = "SUPER_ADMIN" | "ADMIN" | "MANAGER" | "STAFF" | "CUSTOMER";

export function canAccessAdmin(role: UserRole | undefined) {
  return role !== undefined && role !== "CUSTOMER";
}
