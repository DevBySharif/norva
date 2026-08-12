import "next-auth";
import "next-auth/jwt";
declare module "next-auth" {
  interface Session { user: { id: string; role: string; name?: string | null; email?: string | null } }
  interface User { role: string; passwordChangedAt?: Date | null }
}
declare module "next-auth/jwt" { interface JWT { role?: string; pwdChangedAt?: string | null } }
