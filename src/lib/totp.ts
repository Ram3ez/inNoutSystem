/**
 * RFC 6238 Time-Based One-Time Password (TOTP) Library
 * 
 * Implements TOTP generation and verification using the standard Web Crypto API.
 * Provides client-side and server-side compatibility without external dependencies.
 */

// Helper to get standard Web Crypto API across browser and Node environments
const getCrypto = (): Crypto => {
  if (typeof window !== "undefined" && window.crypto) {
    return window.crypto;
  }
  // Node.js fallback
  const nodeCrypto = require("crypto");
  return nodeCrypto.webcrypto || nodeCrypto;
};

/**
 * Decodes a Base32 encoded string into a Uint8Array.
 * Required for RFC 4226 / 6238 compatibility with standard authenticator secret keys.
 */
function base32ToBytes(base32: string): Uint8Array {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const cleanBase32 = base32.toUpperCase().replace(/=+$/, "");
  const len = cleanBase32.length;
  const bytes = new Uint8Array(Math.floor((len * 5) / 8));
  
  let val = 0;
  let count = 0;
  let index = 0;
  
  for (let i = 0; i < len; i++) {
    const char = cleanBase32[i];
    const idx = alphabet.indexOf(char);
    if (idx === -1) {
      throw new Error(`Invalid base32 character: ${char}`);
    }
    
    val = (val << 5) | idx;
    count += 5;
    
    if (count >= 8) {
      bytes[index++] = (val >>> (count - 8)) & 0xff;
      count -= 8;
    }
  }
  return bytes;
}

/**
 * Generates a cryptographically secure Base32 secret.
 * Defaults to 16 characters so that the obfuscated/base64-encoded output fits within the 32-character database limits.
 */
export function generateBase32Secret(length = 16): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bytes = new Uint8Array(length);
  const cryptoObj = getCrypto();
  
  if (cryptoObj.getRandomValues) {
    cryptoObj.getRandomValues(bytes);
  } else {
    // Fallback if getRandomValues is not available in Node wrapper
    const nodeCrypto = require("crypto");
    nodeCrypto.randomFillSync(bytes);
  }
  
  let result = "";
  for (let i = 0; i < length; i++) {
    result += alphabet[bytes[i] % 32];
  }
  return result;
}

/**
 * Generates a 6-digit TOTP token using HMAC-SHA1.
 * 
 * @param secret - Base32 encoded secret key
 * @param counter - Specific 30-second time-step counter. If omitted, Date.now() is used.
 */
export async function generateTOTP(
  secret: string,
  counter?: number
): Promise<string> {
  if (counter === undefined) {
    const epoch = Math.floor(Date.now() / 1000);
    counter = Math.floor(epoch / 30);
  }
  
  const keyBytes = base32ToBytes(secret);
  const dataBytes = new Uint8Array(8);
  let temp = counter;
  
  for (let i = 7; i >= 0; i--) {
    dataBytes[i] = temp & 0xff;
    temp = Math.floor(temp / 256);
  }

  const cryptoObj = getCrypto();
  const key = await cryptoObj.subtle.importKey(
    "raw",
    keyBytes as any,
    { name: "HMAC", hash: { name: "SHA-1" } },
    false,
    ["sign"]
  );

  const signature = await cryptoObj.subtle.sign("HMAC", key, dataBytes);
  const signatureBytes = new Uint8Array(signature);
  
  const offset = signatureBytes[signatureBytes.length - 1] & 0xf;
  const binary =
    ((signatureBytes[offset] & 0x7f) << 24) |
    ((signatureBytes[offset + 1] & 0xff) << 16) |
    ((signatureBytes[offset + 2] & 0xff) << 8) |
    (signatureBytes[offset + 3] & 0xff);
    
  const otp = binary % 1000000;
  return otp.toString().padStart(6, "0");
}

/**
 * Verifies a TOTP token against a secret key with a given clock drift allowance.
 * 
 * @param secret - Base32 encoded secret key
 * @param token - 6-digit TOTP token to verify
 * @param driftWindowSteps - Number of steps of clock drift allowed (default 1 step = 30s)
 */
export async function verifyTOTP(
  secret: string,
  token: string,
  driftWindowSteps = 1
): Promise<boolean> {
  const currentEpoch = Math.floor(Date.now() / 1000);
  const currentStep = Math.floor(currentEpoch / 30);

  for (let i = -driftWindowSteps; i <= driftWindowSteps; i++) {
    const generated = await generateTOTP(secret, currentStep + i);
    if (generated === token) {
      return true;
    }
  }
  return false;
}

const OBFUSCATION_KEY = "AntigravityTotpObfuscationKey2026!";

/**
 * Obfuscates a TOTP secret using XOR encryption and encodes it in Base64
 * so that it is not directly visible on inspecting.
 */
export function encryptSecret(secret: string): string {
  let result = "";
  for (let i = 0; i < secret.length; i++) {
    const charCode = secret.charCodeAt(i) ^ OBFUSCATION_KEY.charCodeAt(i % OBFUSCATION_KEY.length);
    result += String.fromCharCode(charCode);
  }
  return btoa(result);
}

/**
 * Decrypts an obfuscated TOTP secret. Gracefully falls back to raw Base32
 * if the secret is not obfuscated.
 */
export function decryptSecret(encrypted: string): string {
  if (!encrypted) return encrypted;
  
  // Heuristic: A raw Base32 secret is exactly 16 or 32 uppercase characters (A-Z, 2-7)
  const isRawBase32 = /^[A-Z2-7]{16}$|^[A-Z2-7]{32}$/.test(encrypted);
  if (isRawBase32) {
    return encrypted;
  }

  try {
    const decoded = atob(encrypted);
    let result = "";
    for (let i = 0; i < decoded.length; i++) {
      const charCode = decoded.charCodeAt(i) ^ OBFUSCATION_KEY.charCodeAt(i % OBFUSCATION_KEY.length);
      result += String.fromCharCode(charCode);
    }
    // Verify decrypted matches expected Base32 format before returning
    if (/^[A-Z2-7]{16}$|^[A-Z2-7]{32}$/.test(result)) {
      return result;
    }
  } catch (err) {
    // Treat as raw if Base64 decoding fails
  }
  return encrypted;
}

