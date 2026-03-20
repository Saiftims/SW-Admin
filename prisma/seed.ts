import { randomBytes, scrypt as _scrypt } from "crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hashBuffer = (await new Promise<Buffer>((resolve, reject) => {
    _scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(derivedKey);
    });
  })) as Buffer;
  return `${salt}:${hashBuffer.toString("hex")}`;
}

async function main() {
  const seedEmail = process.env.SEED_ADMIN_EMAIL;
  const seedPassword = process.env.SEED_ADMIN_PASSWORD;

  if (!seedEmail || !seedPassword) {
    console.log("Skipping seed: SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD not set.");
    return;
  }

  const passwordHash = await hashPassword(seedPassword);

  await prisma.user.upsert({
    where: { email: seedEmail },
    update: { passwordHash },
    create: {
      email: seedEmail,
      passwordHash,
      globalRole: "SUPER_ADMIN"
    }
  });

  console.log("Seed complete (admin ensured).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

