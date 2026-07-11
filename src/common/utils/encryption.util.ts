import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

export class EncryptionUtil {
  /** Encrypts with AES-256-GCM. `keyHex` must be 64 hex chars (32 bytes). */
  static encrypt(plainText: string, keyHex: string): string {
    const key = Buffer.from(keyHex, 'hex');
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plainText, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    return [iv, authTag, encrypted].map((buf) => buf.toString('hex')).join(':');
  }

  static decrypt(payload: string, keyHex: string): string {
    const [ivHex, authTagHex, cipherTextHex] = payload.split(':');
    const key = Buffer.from(keyHex, 'hex');
    const decipher = createDecipheriv(
      ALGORITHM,
      key,
      Buffer.from(ivHex, 'hex'),
    );
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    return Buffer.concat([
      decipher.update(Buffer.from(cipherTextHex, 'hex')),
      decipher.final(),
    ]).toString('utf8');
  }
}
