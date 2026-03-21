import { prisma } from "@/lib/db";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  const entry = await prisma.jobEventHistory.findFirst({
    where: { correlationId: `audio:${id}`, entityType: "voice_response" },
  });

  if (!entry) {
    return new Response("Not found", { status: 404 });
  }

  const data = entry.detailsJson as any;
  if (!data?.base64) {
    return new Response("Not found", { status: 404 });
  }

  const buffer = Buffer.from(data.base64, "base64");
  return new Response(buffer, {
    status: 200,
    headers: {
      "Content-Type": data.mimeType ?? "audio/mpeg",
      "Content-Length": buffer.length.toString(),
      "Cache-Control": "public, max-age=3600",
    },
  });
}
