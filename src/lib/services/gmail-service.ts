import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import { getEnv } from "@/lib/env";
import { prisma } from "@/lib/db";
import { analyzeImages, buildTemplatePlaceholders } from "@/lib/services/silent-witness-client";
import { renderTemplate, getDefaultTemplate } from "@/lib/services/email-template";

type ParsedEmail = {
  uid: number;
  from: string;
  subject: string;
  date: Date;
  attachments: { filename: string; content: Buffer; contentType: string }[];
};

function getSmtpTransport() {
  const env = getEnv();
  return nodemailer.createTransport({
    host: env.GMAIL_SMTP_HOST,
    port: Number(env.GMAIL_SMTP_PORT),
    secure: true,
    auth: {
      user: env.GMAIL_USER,
      pass: env.GMAIL_APP_PASSWORD,
    },
  });
}

async function sendAnalysisResponse(toEmail: string, subject: string, htmlBody: string) {
  const env = getEnv();
  const transport = getSmtpTransport();
  await transport.sendMail({
    from: `"Silent Witness" <${env.GMAIL_USER}>`,
    to: toEmail,
    subject: `Re: ${subject} — Silent Witness Analysis`,
    html: htmlBody,
  });
}

// ─── Main polling function ──────────────────────────────────────────

export async function pollAndProcessEmails(): Promise<number> {
  const env = getEnv();
  let client: ImapFlow | null = null;

  try {
    client = new ImapFlow({
      host: env.GMAIL_IMAP_HOST,
      port: Number(env.GMAIL_IMAP_PORT),
      secure: true,
      auth: { user: env.GMAIL_USER, pass: env.GMAIL_APP_PASSWORD },
      logger: false,
    });

    await client.connect();

    const lock = await client.getMailboxLock("INBOX");
    let processed = 0;

    try {
      // Only search for recent unseen emails (last 24h) to avoid processing the entire inbox
      const since = new Date();
      since.setHours(since.getHours() - 24);

      const uids = await client.search({ seen: false, since });

      if (!uids || uids.length === 0) {
        return 0;
      }

      // Only process the 5 most recent to avoid timeout
      const recentUids = uids.slice(-5);
      console.log(`[Gmail] Found ${uids.length} unseen email(s) from last 24h, processing ${recentUids.length} most recent`);

      for (const uid of recentUids) {
        try {
          // Fetch envelope first (lightweight)
          const msg = await client.fetchOne(uid, { envelope: true, bodyStructure: true });
          if (!msg) continue;

          const envelope = (msg as any).envelope;
          const from = envelope?.from?.[0]?.address ?? "unknown";
          const subject = envelope?.subject ?? "(no subject)";

          // Check body structure for image attachments before downloading
          const bs = (msg as any).bodyStructure;
          const imageParts = findImageParts(bs);

          if (imageParts.length === 0) {
            // No images — mark as seen and skip
            await client.messageFlagsAdd(uid, ["\\Seen"]);
            continue;
          }

          console.log(`[Gmail] Email from ${from}: "${subject}" — ${imageParts.length} image(s)`);

          // Download image attachments
          const attachments: { filename: string; content: Buffer; contentType: string }[] = [];
          for (const part of imageParts) {
            try {
              const { content } = await client.download(uid.toString(), part.partNumber);
              const chunks: Buffer[] = [];
              for await (const chunk of content) {
                chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
              }
              const buffer = Buffer.concat(chunks);
              const ct = `${part.type}/${part.subtype}`.toLowerCase();
              const filename = part.filename ?? `image-${part.partNumber}.${part.subtype}`;
              attachments.push({ filename, content: buffer, contentType: ct });
              console.log(`[Gmail]   Downloaded: ${filename} (${(buffer.length / 1024).toFixed(0)}KB)`);
            } catch (dlErr: any) {
              console.error(`[Gmail]   Failed to download part ${part.partNumber}: ${dlErr?.message}`);
            }
          }

          // Mark as seen immediately
          await client.messageFlagsAdd(uid, ["\\Seen"]);

          if (attachments.length === 0) continue;

          // Run analysis
          console.log(`[Gmail] Analyzing ${attachments.length} image(s)...`);
          const imageInputs = attachments.map(a => ({
            buffer: a.content,
            mimeType: a.contentType,
            filename: a.filename,
          }));

          const outcome = await analyzeImages(imageInputs);

          if (!outcome.ok) {
            console.error(`[Gmail] ❌ Analysis failed: ${outcome.error.message}`);
            continue;
          }

          console.log(`[Gmail] ✅ Analysis succeeded — Delta-V: ${outcome.result.deltaV?.min}-${outcome.result.deltaV?.max} ${outcome.result.deltaV?.unit}`);

          // Look up tenant
          const firm = await prisma.firm.findFirst({
            where: { billingEmail: from },
            include: { tenant: true },
          });

          const placeholders = buildTemplatePlaceholders(outcome.result, {
            customerName: firm?.tenant?.name ?? from,
            lawFirmName: firm?.lawFirmName ?? "Valued Client",
            caseReference: subject ? ` — ${subject}` : "",
          });

          // Get template
          let template = getDefaultTemplate();
          if (firm?.tenant?.id) {
            const dbTemplate = await prisma.emailTemplate.findFirst({
              where: { tenantId: firm.tenant.id },
              include: {
                versions: {
                  where: { status: "PUBLISHED" },
                  orderBy: { versionNumber: "desc" },
                  take: 1,
                },
              },
            });
            if (dbTemplate?.versions?.[0]?.htmlBody) {
              template = dbTemplate.versions[0].htmlBody;
            }
          }

          const html = renderTemplate(template, placeholders);

          // Store in conversation memory
          if (firm?.tenant?.id) {
            const analysisText = `Delta-V: ${outcome.result.deltaV?.min}-${outcome.result.deltaV?.max} ${outcome.result.deltaV?.unit}, Impact: ${outcome.result.impact?.pdofDirection}, Type: ${outcome.result.impact?.collisionType}, Confidence: ${outcome.result.confidence}, AIS: ${outcome.result.aisDistribution.map(a => `${a.label} ${((a.probabilityMin ?? a.probability)*100).toFixed(1)}%`).join(", ")}`;
            await prisma.conversationMessage.createMany({
              data: [
                { tenantId: firm.tenant.id, channel: `email:${from}`, role: "user", content: `(sent ${attachments.length} crash photo(s) via email: "${subject}")`, hasImages: true },
                { tenantId: firm.tenant.id, channel: `email:${from}`, role: "assistant", content: `[ANALYSIS RESULTS]\n${analysisText}` },
              ],
            }).catch(() => {});
          }

          // Store report in DB
          const imageData = attachments.map((a) => ({
            base64: a.content.toString("base64"),
            mimeType: a.contentType,
            filename: a.filename,
          }));
          await prisma.analysisReport.create({
            data: {
              tenantId: firm?.tenant?.id ?? null,
              sourceType: "EMAIL",
              sourceRef: from,
              senderEmail: from,
              subject: subject,
              imageCount: attachments.length,
              imageData: imageData as any,
              resultJson: outcome.result as any,
              placeholders: placeholders as any,
              renderedHtml: html,
            },
          }).catch(() => {});
          console.log(`[Gmail] Sending response to ${from}...`);
          await sendAnalysisResponse(from, subject, html);
          console.log(`[Gmail] ✅ Response sent to ${from}`);
          processed++;
        } catch (emailErr: any) {
          console.error(`[Gmail] Error processing UID ${uid}: ${emailErr?.message}`);
          // Mark as seen to avoid reprocessing broken emails
          try { await client.messageFlagsAdd(uid, ["\\Seen"]); } catch {}
        }
      }
    } finally {
      lock.release();
    }

    return processed;
  } catch (err: any) {
    console.error(`[Gmail] Poll error: ${err?.message ?? err}`);
    if (err?.stack) console.error(err.stack);
    if (err?.responseText) console.error(`[Gmail] IMAP response: ${err.responseText}`);
    return 0;
  } finally {
    if (client) {
      try { await client.logout(); } catch {}
    }
  }
}

// ─── Helper: find image parts in MIME body structure ────────────────

type ImagePart = {
  partNumber: string;
  type: string;
  subtype: string;
  filename: string | null;
};

function findImageParts(structure: any, prefix = ""): ImagePart[] {
  const parts: ImagePart[] = [];
  if (!structure) return parts;

  if (structure.childNodes && structure.childNodes.length > 0) {
    for (let i = 0; i < structure.childNodes.length; i++) {
      const childPrefix = prefix ? `${prefix}.${i + 1}` : `${i + 1}`;
      parts.push(...findImageParts(structure.childNodes[i], childPrefix));
    }
  } else {
    const type = (structure.type ?? "").toLowerCase();
    const subtype = (structure.subtype ?? "").toLowerCase();
    if (type === "image" && ["jpeg", "jpg", "png", "webp"].includes(subtype)) {
      parts.push({
        partNumber: prefix || "1",
        type,
        subtype,
        filename:
          structure.dispositionParameters?.filename ??
          structure.parameters?.name ??
          null,
      });
    }
  }

  return parts;
}
