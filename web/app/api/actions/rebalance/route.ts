import { NextResponse } from "next/server";
import { proposeRebalance } from "@/lib/fund";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const { mode } = (await req.json().catch(() => ({}))) as { mode?: string };
  if (mode !== "honest" && mode !== "skim" && mode !== "timid") {
    return NextResponse.json(
      { ok: false, title: "Bad request", detail: "mode must be honest, skim or timid" },
      { status: 400 },
    );
  }
  try {
    return NextResponse.json(await proposeRebalance(mode));
  } catch (e) {
    return NextResponse.json(
      { ok: false, title: "Could not reach the ledger", detail: e instanceof Error ? e.message : String(e) },
      { status: 200 },
    );
  }
}
