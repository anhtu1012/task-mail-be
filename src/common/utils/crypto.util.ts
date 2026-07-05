import { createHash, randomBytes } from 'crypto';

export class CryptoUtil {
  /** Generates a cryptographically-random opaque token (used for raw refresh tokens/OTPs). */
  static generateOpaqueToken(bytes = 64): string {
    return randomBytes(bytes).toString('hex');
  }

  /**
   * SHA-256 hash for values we need to look up by exact match (refresh tokens, OTPs).
   * bcrypt is intentionally avoided here: it's slow by design and we already compare
   * high-entropy random tokens, so a fast, deterministic hash is what we want for the lookup.
   */
  static sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
}
