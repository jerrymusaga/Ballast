import { NextResponse } from "next/server";
import { connFromEnv } from "../../../../keeper/src/ledger.ts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const c = connFromEnv();
    const r = await fetch(`${c.baseUrl}/v2/version`, { cache: "no-store" });
    const v = (await r.json()) as { version?: string };
    return NextResponse.json({ ok: r.ok, ledger: c.baseUrl, version: v.version ?? null });
  } catch (e) {
    return NextResponse.json(
      { ok: false, ledger: process.env.LEDGER_API_URL ?? null, error: e instanceof Error ? e.message : String(e) },
      { status: 200 },
    );
  }
}
