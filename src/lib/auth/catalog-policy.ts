export const catalogManagementRoles = ["SUPER_ADMIN", "ADMIN", "MANAGER"] as const;

export function canManageCatalog(role: string | null | undefined) {
  return catalogManagementRoles.includes(role as typeof catalogManagementRoles[number]);
}
