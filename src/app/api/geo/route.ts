import type { NextRequest } from "next/server";

/**
 * Country hint for signup (see `getCountryByIP`). For static / APK there is no server;
 * `fetch("/api/geo")` fails and callers get `null` — that path is already handled.
 *
 * `output: "export"` requires an explicit static config on route handlers (Next 16+).
 */
export const dynamic = "force-static";

export async function GET(request: NextRequest) {
  const country =
    request.headers.get("x-vercel-ip-country") ||
    request.headers.get("cf-ipcountry") ||
    null;
  return Response.json({ country: country?.trim() || null });
}
