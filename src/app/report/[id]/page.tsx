import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";

export default async function ReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const report = await prisma.analysisReport.findUnique({
    where: { id },
  });

  if (!report || !report.renderedHtml) {
    notFound();
  }

  return (
    <div dangerouslySetInnerHTML={{ __html: report.renderedHtml }} />
  );
}
