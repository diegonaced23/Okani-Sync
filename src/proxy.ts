import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// "/sign-in" sigue acá aunque la ruta ahora sea "/login": es el origen del
// redirect 308 de next.config.ts, y tiene que ser alcanzable sin sesión para
// que los enlaces viejos que están en correos ya enviados lleguen a redirigir.
const PUBLIC_PREFIXES = ["/login", "/sign-in", "/forgot-password", "/reset-password", "/api/auth", "/sw.js"];

function isPublicRoute(pathname: string) {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

// Chequeo optimista: solo mira si existe la cookie de sesión, sin round-trip
// de red. La autorización real vive en cada función de Convex (getCurrentUser)
// y en AuthGuard — acá solo evitamos renderizar rutas privadas sin cookie.
// Acá NO se expulsa de /login a quien ya tiene sesión: esa decisión necesita
// validar la sesión de verdad, y este chequeo solo mira que la cookie exista.
// Con una cookie vencida el redirect entraría en bucle contra el de
// src/app/(app)/layout.tsx, que sí valida. Vive en la propia página de
// /login, que resuelve la sesión server-side.
export function proxy(req: NextRequest) {
  if (isPublicRoute(req.nextUrl.pathname)) return NextResponse.next();

  if (!getSessionCookie(req)) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
