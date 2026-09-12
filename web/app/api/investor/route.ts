import { NextResponse } from "next/server";
import { joinFund, newInvestor, readInvestor, subscribe } from "@/lib/investor";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const party = new URL(req.url).searchParams.get("party");
  if (!party) return NextResponse.json({ error: "party required" }, { status: 400 });
  try {
    return NextResponse.json(await readInvestor(party));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 200 });
  }
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { action?: string; party?: string; amount?: string };
  try {
    if (body.action === "new") return NextResponse.json({ party: await newInvestor() });
    if (!body.party) return NextResponse.json({ ok: false, detail: "party required" }, { status: 400 });
    if (body.action === "join") return NextResponse.json(await joinFund(body.party));
    if (body.action === "subscribe") {
      return NextResponse.json(await subscribe(body.party, body.amount ?? "1"));
    }
    return NextResponse.json({ ok: false, detail: "unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ ok: false, detail: e instanceof Error ? e.message : String(e) }, { status: 200 });
  }
}
