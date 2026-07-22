import { createHash, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;

function demoSalt(actorId: string): string {
  return createHash("sha256").update(`reelay-demo:${actorId}`).digest("hex").slice(0, 32);
}

export async function hashDemoPassword(password: string, actorId: string): Promise<string> {
  const salt = demoSalt(actorId);
  const key = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
  return `scrypt$${salt}$${key.toString("hex")}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, salt, expectedHex, ...extra] = encoded.split("$");
  if (algorithm !== "scrypt" || !salt || !expectedHex || extra.length > 0) return false;

  const expected = Buffer.from(expectedHex, "hex");
  if (expected.length !== KEY_LENGTH) return false;
  const actual = (await scrypt(password, salt, expected.length)) as Buffer;
  return timingSafeEqual(actual, expected);
}
