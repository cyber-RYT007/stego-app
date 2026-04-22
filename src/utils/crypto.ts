import CryptoJS from "crypto-js";

export function aesEncrypt(message: string, password: string): string {
  return CryptoJS.AES.encrypt(message, password).toString();
}

export function aesDecrypt(ciphertext: string, password: string): string {
  try {
    const bytes = CryptoJS.AES.decrypt(ciphertext, password);
    const decrypted = bytes.toString(CryptoJS.enc.Utf8);
    if (!decrypted) throw new Error("Wrong password or corrupted data.");
    return decrypted;
  } catch {
    throw new Error("Decryption failed — wrong password?");
  }
}

// Fallback XOR kept for compatibility
export function xorEncrypt(message: string, password: string): string {
  return message.split("").map((c, i) =>
    String.fromCharCode(c.charCodeAt(0) ^ password.charCodeAt(i % password.length))
  ).join("");
}
export const xorDecrypt = xorEncrypt;