import { NextResponse } from "next/server";
import { readLenses } from "@/lib/lenses";

// The ledger is the source of truth and it changes under us, so nothing here is cached.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json(await readLenses(), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
