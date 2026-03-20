import { NextResponse } from "next/server";
import { pollAndProcessEmails } from "@/lib/services/gmail-service";

export const maxDuration = 60;

export async function GET(req: Request) {
  // Verify this is called by Vercel Cron (or allow in dev)
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Disabled until fresh Gmail account is configured
  const gmailUser = process.env.GMAIL_USER?.trim();
  const gmailPass = process.env.GMAIL_APP_PASSWORD?.trim();
  if (!gmailUser || !gmailPass || gmailPass === "xxxx-xxxx-xxxx-xxxx") {
    return NextResponse.json({ ok: true, skipped: true, reason: "Gmail not configured" });
  }

  try {
    const processed = await pollAndProcessEmails();
    console.log(`[Cron] Email poll complete — processed ${processed} email(s).`);
    return NextResponse.json({ ok: true, processed });
  } catch (err: any) {
    console.error(`[Cron] Email poll failed: ${err?.message}`);
    return NextResponse.json({ error: err?.message ?? "Poll failed" }, { status: 500 });
  }
}
