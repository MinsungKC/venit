import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * The personalized student experience — requires sign-in. Browsing (`/listings`, `/listing/*`),
 * the landing page, org registration (`/register`), admin, and shared shortlist links (`/shared`)
 * stay public by design (discoverability / shareability). A path is protected if it equals one of
 * these or is nested under it.
 */
const PROTECTED_PREFIXES = ["/match", "/onboarding", "/refine", "/shortlist", "/tracker", "/globe", "/settings"];

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Refresh the Supabase auth session on each request so cookies stay valid (standard @supabase/ssr),
 * and gate the personalized student routes: an unauthenticated request to a protected path is
 * redirected to `/login?next=<original path>` so the magic-link callback can return them there.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && isProtectedPath(request.nextUrl.pathname)) {
    const loginUrl = request.nextUrl.clone();
    const nextPath = request.nextUrl.pathname + request.nextUrl.search;
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    loginUrl.searchParams.set("next", nextPath);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}
