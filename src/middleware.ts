import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isAdminRoute = createRouteMatcher(["/admin(.*)"]);
const isUserOnlyRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/transacciones(.*)",
  "/cuentas(.*)",
  "/tarjetas(.*)",
  "/deudas(.*)",
  "/categorias(.*)",
  "/presupuestos(.*)",
  "/reportes(.*)",
  "/mas(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  const { userId, sessionClaims } = await auth();
  if (!userId) return;

  const role = (sessionClaims?.metadata as { role?: string } | undefined)?.role;
  const isAdmin = role === "admin";

  if (isAdmin && isUserOnlyRoute(req)) {
    return NextResponse.redirect(new URL("/admin", req.url));
  }

  if (!isAdmin && isAdminRoute(req)) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
