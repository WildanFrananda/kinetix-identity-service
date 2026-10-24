import type { UserRole } from "../types/principal.type"

function requiresTwoFactor(role: UserRole): boolean {
  return role === "admin"
}

export { requiresTwoFactor }
