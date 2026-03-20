import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuthedUser } from "@/lib/auth/requireAuthedUser";
import { requireTenantAccessOrThrow } from "@/lib/auth/permissions";

export async function GET(
  _req: Request,
  context: { params: Promise<{ tenantId: string }> }
) {
  const user = await requireAuthedUser();
  const params = await context.params;
  await requireTenantAccessOrThrow({ user, tenantId: params.tenantId });

  const doc = await prisma.memoryDocument.findUnique({
    where: { tenantId: params.tenantId },
    include: {
      currentVersion: true,
      versions: {
        orderBy: { versionNumber: "desc" },
        take: 10,
        select: { id: true, versionNumber: true, createdAt: true },
      },
    },
  });

  // Get recent conversations
  const conversations = await prisma.conversationMessage.findMany({
    where: { tenantId: params.tenantId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  // Get firm info
  const firm = await prisma.firm.findUnique({
    where: { tenantId: params.tenantId },
  });

  return NextResponse.json({
    memory: doc?.currentVersion?.contentMarkdown ?? "",
    versions: doc?.versions ?? [],
    conversations: conversations.reverse(),
    firm,
  });
}

const UpdateMemorySchema = z.object({
  content: z.string().min(1),
});

export async function PUT(
  req: Request,
  context: { params: Promise<{ tenantId: string }> }
) {
  try {
    const user = await requireAuthedUser();
    const params = await context.params;
    await requireTenantAccessOrThrow({ user, tenantId: params.tenantId });

    const body = await req.json().catch(() => null);
    const parsed = UpdateMemorySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
    }

    let doc = await prisma.memoryDocument.findUnique({ where: { tenantId: params.tenantId } });
    if (!doc) {
      doc = await prisma.memoryDocument.create({ data: { tenantId: params.tenantId } });
    }

    const latest = await prisma.memoryDocumentVersion.findFirst({
      where: { memoryDocumentId: doc.id },
      orderBy: { versionNumber: "desc" },
    });

    const version = await prisma.memoryDocumentVersion.create({
      data: {
        memoryDocumentId: doc.id,
        tenantId: params.tenantId,
        versionNumber: (latest?.versionNumber ?? 0) + 1,
        contentMarkdown: parsed.data.content,
        createdByUserId: user.id,
      },
    });

    await prisma.memoryDocument.update({
      where: { id: doc.id },
      data: { currentVersionId: version.id },
    });

    return NextResponse.json({ ok: true, versionNumber: version.versionNumber });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}
