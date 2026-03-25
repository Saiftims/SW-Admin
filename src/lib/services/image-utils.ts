import sharp from "sharp";

const MAX_ANTHROPIC_BYTES = 4_500_000; // 4.5MB to stay safely under Claude's 5MB limit

/**
 * Downsize an image buffer if it exceeds Anthropic's base64 size limit.
 * Returns the original buffer untouched if it's already small enough.
 */
export async function compressForAnthropic(
  buffer: Buffer,
  mimeType: string
): Promise<{ buffer: Buffer; mimeType: string }> {
  if (buffer.length <= MAX_ANTHROPIC_BYTES) {
    return { buffer, mimeType };
  }

  console.log(`[ImageUtils] Compressing ${(buffer.length / 1024 / 1024).toFixed(1)}MB image...`);

  let quality = 80;
  let result = await sharp(buffer)
    .resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality, mozjpeg: true })
    .toBuffer();

  while (result.length > MAX_ANTHROPIC_BYTES && quality > 30) {
    quality -= 15;
    result = await sharp(buffer)
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();
  }

  console.log(`[ImageUtils] Compressed to ${(result.length / 1024 / 1024).toFixed(1)}MB (q=${quality})`);
  return { buffer: result, mimeType: "image/jpeg" };
}
