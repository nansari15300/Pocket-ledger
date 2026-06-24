import { NextResponse } from "next/server";
import { devPlLocalServerHandle, isDevPlLocalServerEnabled } from "@/lib/devPlLocalServer/nodeBridge";

export async function POST(req: Request) {
  if (!isDevPlLocalServerEnabled()) {
    return NextResponse.json({ error: "Not available outside development" }, { status: 403 });
  }
  try {
    const body = (await req.json()) as { action?: string; [key: string]: unknown };
    const action = String(body.action || "").trim();
    if (!action) {
      return NextResponse.json({ error: "Missing action" }, { status: 400 });
    }
    const { action: _a, ...rest } = body;
    const result = await devPlLocalServerHandle(action, rest);
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
