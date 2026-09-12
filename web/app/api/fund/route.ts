import { NextResponse } from "next/server";
import { readFundState } from "@/lib/fund";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json(await readFundState(), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json(
      { ready: false, reason: e instanceof Error ? e.message : String(e) },
      { status: 200 },
    );
  }
}
