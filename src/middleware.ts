import { getToken } from "next-auth/jwt";
import { NextResponse, type NextRequest } from "next/server";

const allowedRoles = new Set(["SUPER_ADMIN", "ADMIN", "MANAGER"]);

export async function middleware(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.AUTH_SECRET });
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/admin")) {
    if (!token || !allowedRoles.has(String(token.role))) return NextResponse.redirect(new URL("/admin/login", request.url));
    return NextResponse.next();
  }

  if (pathname.startsWith("/account")) {
    if (!token || token.role !== "CUSTOMER") {
      const login = new URL("/login", request.url);
      login.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(login);
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = { matcher: ["/admin", "/admin/((?!login).*)", "/account/:path*"] };
