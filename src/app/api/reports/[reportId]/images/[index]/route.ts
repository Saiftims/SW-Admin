import { prisma } from "@/lib/db";

export async function GET(
  _req: Request,
  context: { params: Promise<{ reportId: string; index: string }> }
) {
  const { reportId, index } = await context.params;
  const idx = parseInt(index, 10);

  const report = await prisma.analysisReport.findUnique({
    where: { id: reportId },
    select: { imageData: true },
  });

  if (!report?.imageData || !Array.isArray(report.imageData)) {
    return new Response("Not found", { status: 404 });
  }

  const img = (report.imageData as any[])[idx];
  if (!img?.base64) {
    return new Response("Not found", { status: 404 });
  }

  const buffer = Buffer.from(img.base64, "base64");
  return new Response(buffer, {
    status: 200,
    headers: {
      "Content-Type": img.mimeType ?? "image/jpeg",
      "Content-Length": buffer.length.toString(),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
