import { NextResponse } from "next/server";
import { findCareers } from "@/lib/finder";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const url = typeof body?.url === "string" ? body.url.trim() : "";
  if (!url || url.length > 300) {
    return NextResponse.json({ error: "Send a website address." }, { status: 400 });
  }
  const result = await findCareers(url);
  return NextResponse.json(result);
}
