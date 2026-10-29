import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from "node:crypto";
import { env } from "./env";

// Stored beside each value, so a new key can be brought in without losing what the old one sealed.
export const KEY_VERSION = 1;

// A different APP_ENCRYPTION_KEY, or a value changed since it was stored.
export class UnreadableSecretError extends Error {
  constructor() {
    super("The stored secret cannot be read with this encryption key");
  }
}

export const canEncrypt = () => Boolean(env.APP_ENCRYPTION_KEY);

function keyOf(secret: string | undefined, version: number) {
  if (!secret) throw new Error("APP_ENCRYPTION_KEY is not set");
  return Buffer.from(
    hkdfSync("sha256", secret, "", `touchpoint:secrets:v${version}`, 32),
  );
}

// AES-256-GCM with a random IV per value, stored as iv.tag.ciphertext in base64url.
export function encryptSecret(plain: string, secret = env.APP_ENCRYPTION_KEY) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyOf(secret, KEY_VERSION), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const value = [iv, cipher.getAuthTag(), data]
    .map((part) => part.toString("base64url"))
    .join(".");
  return { value, keyVersion: KEY_VERSION };
}

export function decryptSecret(
  value: string,
  keyVersion: number,
  secret = env.APP_ENCRYPTION_KEY,
) {
  const parts = value.split(".").map((part) => Buffer.from(part, "base64url"));
  if (parts.length !== 3 || keyVersion !== KEY_VERSION) {
    throw new UnreadableSecretError();
  }
  const [iv, tag, data] = parts;
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      keyOf(secret, keyVersion),
      iv,
    );
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString(
      "utf8",
    );
  } catch {
    throw new UnreadableSecretError();
  }
}
