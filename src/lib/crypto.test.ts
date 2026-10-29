import { describe, expect, it } from "vitest";
import {
  decryptSecret,
  encryptSecret,
  KEY_VERSION,
  UnreadableSecretError,
} from "./crypto";

describe("encryptSecret", () => {
  it("reads back what it sealed, and never holds the text itself", () => {
    const { value, keyVersion } = encryptSecret("GOCSPX-secret-value");
    expect(keyVersion).toBe(KEY_VERSION);
    expect(value).not.toContain("GOCSPX");
    expect(decryptSecret(value, keyVersion)).toBe("GOCSPX-secret-value");
  });

  it("seals the same text differently each time", () => {
    const first = encryptSecret("same");
    const second = encryptSecret("same");
    expect(first.value).not.toBe(second.value);
    expect(decryptSecret(second.value, second.keyVersion)).toBe("same");
  });

  it("refuses a value sealed with another key", () => {
    const { value, keyVersion } = encryptSecret("x", "another-key-0123456789abcdef0123456");
    expect(() => decryptSecret(value, keyVersion)).toThrow(UnreadableSecretError);
  });

  it("refuses a value that was changed after it was stored", () => {
    const { value, keyVersion } = encryptSecret("refresh-token");
    const [iv, tag, data] = value.split(".");
    const flipped = Buffer.from(data, "base64url");
    flipped[0] ^= 1;
    expect(() =>
      decryptSecret([iv, tag, flipped.toString("base64url")].join("."), keyVersion),
    ).toThrow(UnreadableSecretError);
    expect(() => decryptSecret("not-a-sealed-value", keyVersion)).toThrow(
      UnreadableSecretError,
    );
    expect(() => decryptSecret(value, KEY_VERSION + 1)).toThrow(UnreadableSecretError);
  });
});
