import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

const PUBLIC_PREFIXES = ["/sign-in", "/reset-password", "/api/auth", "/sw.js"];

function isPublicRoute(pathname: string) {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

// Chequeo optimista: solo mira si existe la cookie de sesión, sin round-trip
// de red. La autorización real vive en cada función de Convex (getCurrentUser)
// y en AuthGuard — acá solo evitamos renderizar rutas privadas sin cookie.
export function proxy(req: NextRequest) {
  if (isPublicRoute(req.nextUrl.pathname)) return NextResponse.next();

  if (!getSessionCookie(req)) {
    return NextResponse.redirect(new URL("/sign-in", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
