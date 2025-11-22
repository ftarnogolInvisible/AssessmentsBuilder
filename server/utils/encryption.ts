import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";

/**
 * Get encryption key from environment variable or generate a default one
 * In production (Google Cloud), use Secret Manager for ENCRYPTION_KEY
 */
function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    console.warn(
      "[Encryption] ENCRYPTION_KEY not set. Using a default key. " +
      "This is insecure for production! Set ENCRYPTION_KEY in environment variables."
    );
    // Generate a deterministic key from a default value (NOT SECURE for production)
    return crypto.createHash("sha256").update("default-insecure-key-change-in-production").digest();
  }
  // Use a 32-byte key (256 bits) for AES-256
  return crypto.createHash("sha256").update(key).digest();
}

/**
 * Encrypt an API key before storing in database
 * Returns a string format: iv:authTag:encryptedData
 */
export function encryptApiKey(apiKey: string): string {
  if (!apiKey || apiKey.trim() === "") {
    throw new Error("API key cannot be empty");
  }

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(apiKey, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag();

  // Return IV + authTag + encrypted data (all hex encoded)
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

/**
 * Decrypt an API key from database
 * Expects format: iv:authTag:encryptedData
 */
export function decryptApiKey(encrypted: string): string {
  if (!encrypted) {
    throw new Error("Encrypted string cannot be empty");
  }

  const parts = encrypted.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted format. Expected iv:authTag:encryptedData");
  }

  const [ivHex, authTagHex, encryptedData] = parts;
  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedData, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

/**
 * Check if a string is already encrypted (has the expected format)
 */
export function isEncrypted(value: string): boolean {
  if (!value) return false;
  const parts = value.split(":");
  return parts.length === 3 && parts.every(part => /^[0-9a-f]+$/i.test(part));
}

