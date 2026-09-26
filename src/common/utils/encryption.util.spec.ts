import { randomBytes } from 'crypto';
import { EncryptionUtil } from './encryption.util';

describe('EncryptionUtil', () => {
  const key = randomBytes(32).toString('hex');

  it('round-trips plaintext through encrypt/decrypt', () => {
    const plain = 'ya29.a0AfH6SMC-example-refresh-token';
    const encrypted = EncryptionUtil.encrypt(plain, key);
    expect(encrypted).not.toBe(plain);
    expect(EncryptionUtil.decrypt(encrypted, key)).toBe(plain);
  });

  it('produces a different ciphertext each time (random IV)', () => {
    const plain = 'same input';
    expect(EncryptionUtil.encrypt(plain, key)).not.toBe(
      EncryptionUtil.encrypt(plain, key),
    );
  });

  it('throws when decrypting with the wrong key', () => {
    const encrypted = EncryptionUtil.encrypt('secret', key);
    const wrongKey = randomBytes(32).toString('hex');
    expect(() => EncryptionUtil.decrypt(encrypted, wrongKey)).toThrow();
  });

  it('throws when the ciphertext has been tampered with', () => {
    const encrypted = EncryptionUtil.encrypt('secret', key);
    const [iv, authTag, cipherText] = encrypted.split(':');
    const lastByte = cipherText.slice(-2);
    // Đảm bảo byte cuối luôn thực sự đổi khác — flip thay vì ép cứng '00', vì
    // '00' trùng ngẫu nhiên với ciphertext gốc (~1/256 lần) khiến test flaky.
    const flippedByte = lastByte === '00' ? '01' : '00';
    const tampered = [iv, authTag, cipherText.slice(0, -2) + flippedByte].join(
      ':',
    );
    expect(() => EncryptionUtil.decrypt(tampered, key)).toThrow();
  });
});
