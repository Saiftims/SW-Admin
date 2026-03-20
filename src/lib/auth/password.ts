import { scrypt as _scrypt } from "crypto";

export async function verifyPassword(password: string, stored: string) {
  const [salt, hashHex] = stored.split(":");
  if (!salt || !hashHex) return false;

  const derivedKey = (await new Promise<Buffer>((resolve, reject) => {
    _scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(derivedKey);
    });
  })) as Buffer;

  const computedHex = derivedKey.toString("hex");
  return computedHex === hashHex;
}

