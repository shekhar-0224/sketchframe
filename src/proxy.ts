import { NextResponse, type NextRequest } from "next/server";

/** Public pages: the landing page (dashboard when signed in), shared movies, and the demo assets. */
const isPublic = (path: string) => path === "/" || path.startsWith("/s/") || path.startsWith("/demo/");

/**
 * Optimistic gate: app pages without a session cookie go to /login. The real check (valid,
 * unexpired session) happens in every API route via handle() in lib/api.ts.
 */
export function proxy(req: NextRequest) {
  if (req.cookies.has("sf_session") || isPublic(req.nextUrl.pathname)) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(req.nextUrl.pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except API routes, the login page and static assets.
  matcher: ["/((?!api|login|_next/static|_next/image|favicon.ico|.*\\.(?:png|svg|ico|jpg|webp)$).*)"],
};
