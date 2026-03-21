import { NextResponse } from "next/server";
import { requireAuthedUser } from "@/lib/auth/requireAuthedUser";
import { listVoices } from "@/lib/services/elevenlabs";

export async function GET() {
  try {
    await requireAuthedUser();
    const voices = await listVoices();
    return NextResponse.json({ voices });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Failed" }, { status: 500 });
  }
}
