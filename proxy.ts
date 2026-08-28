import { createServerClient } from "@supabase/ssr";
import { isAdminUser } from "@/lib/auth/admin";
import {
  MAINTENANCE_PATH,
  shouldBypassMaintenance,
  shouldRedirectToMaintenance,
} from "@/lib/site-maintenance";
import { NextResponse, type NextRequest } from "next/server";

const getSafeAdminPath = (value: string | null) =>
  value?.startsWith("/admin/") && !value.startsWith("//") ? value : null;

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const pathname = request.nextUrl.pathname;
  const isAdminRoute = pathname.startsWith("/admin");
  const isLoginPage = pathname === "/admin/login";
  const isSetPasswordPage = pathname === "/admin/set-password";

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });

          response = NextResponse.next({ request });

          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  let maintenanceEnabled = false;

  if (!shouldBypassMaintenance(pathname)) {
    const { data: settings, error: settingsError } = await supabase
      .from("site_settings")
      .select("maintenance_mode")
      .eq("id", "global")
      .maybeSingle();

    maintenanceEnabled = !settingsError && settings?.maintenance_mode === true;
  }

  const user =
    isAdminRoute || maintenanceEnabled
      ? (await supabase.auth.getUser()).data.user
      : null;
  const isAdmin = Boolean(user && isAdminUser(user));

  if (shouldRedirectToMaintenance(pathname, maintenanceEnabled, isAdmin)) {
    const maintenanceUrl = new URL(MAINTENANCE_PATH, request.url);
    const redirectResponse = NextResponse.redirect(maintenanceUrl);
    redirectResponse.headers.set("Cache-Control", "no-store, max-age=0");
    return redirectResponse;
  }

  if (isAdminRoute && !isLoginPage && !isSetPasswordPage && !user) {
    const loginUrl = new URL("/admin/login", request.url);
    loginUrl.searchParams.set(
      "next",
      `${request.nextUrl.pathname}${request.nextUrl.search}`,
    );
    return NextResponse.redirect(loginUrl);
  }

  if (
    isAdminRoute &&
    !isLoginPage &&
    !isSetPasswordPage &&
    user &&
    !isAdmin
  ) {
    const forbiddenUrl = new URL("/admin/login", request.url);
    forbiddenUrl.searchParams.set("error", "forbidden");
    return NextResponse.redirect(forbiddenUrl);
  }

  if (isLoginPage && user && isAdmin) {
    const destination =
      getSafeAdminPath(request.nextUrl.searchParams.get("next")) ??
      "/admin/dashboard";
    return NextResponse.redirect(new URL(destination, request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
