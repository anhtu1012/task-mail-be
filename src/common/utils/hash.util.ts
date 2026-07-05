import * as bcrypt from 'bcrypt';
import { AUTH_CONSTANTS } from '../constants/auth.constants';

export class HashUtil {
  static hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, AUTH_CONSTANTS.BCRYPT_SALT_ROUNDS);
  }

  static compare(plain: string, hashed: string): Promise<boolean> {
    return bcrypt.compare(plain, hashed);
  }
}
