import crypto from "crypto";
import { config } from "../config/index.js";

/**
 * Derives a consistent 32-byte key from JWT_ACCESS_SECRET
 */
function getEncryptionKey(): Buffer {
  const secret = config.JWT_ACCESS_SECRET || "collabrix_secure_token_encryption_key_default";
  return crypto.createHash("sha256").update(secret).digest();
}

/**
 * Encrypts sensitive tokens (like GitHub access tokens) using AES-256-GCM.
 * Format: enc:<iv_hex>:<authTag_hex>:<ciphertext_hex>
 */
export function encryptToken(plaintext: string | null | undefined): string | null {
  if (!plaintext) return null;
  if (plaintext.startsWith("enc:")) return plaintext; // Already encrypted

  const iv = crypto.randomBytes(16);
  const key = getEncryptionKey();
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  return `enc:${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

/**
 * Decrypts sensitive tokens encrypted with AES-256-GCM.
 * Seamlessly handles legacy plaintext tokens for backward compatibility.
 */
export function decryptToken(ciphertext: string | null | undefined): string | null {
  if (!ciphertext) return null;
  if (!ciphertext.startsWith("enc:")) {
    // Unencrypted legacy token or mock token
    return ciphertext;
  }

  try {
    const parts = ciphertext.split(":");
    if (parts.length !== 4) return ciphertext;

    const [, ivHex, authTagHex, encryptedHex] = parts;
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const encrypted = Buffer.from(encryptedHex, "hex");
    const key = getEncryptionKey();

    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);

    return decrypted.toString("utf8");
  } catch (error: any) {
    console.error("Failed to decrypt token:", error.message);
    return null;
  }
}
