import { NextResponse } from "next/server";
import { requireAuthedUser } from "@/lib/auth/requireAuthedUser";

export async function GET() {
  try {
    const user = await requireAuthedUser();
    return NextResponse.json({ user });
  } catch (e: any) {
    const status = e?.status ?? 500;
    return NextResponse.json({ error: e?.message ?? "Unauthorized" }, { status });
  }
}

