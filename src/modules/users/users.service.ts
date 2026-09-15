import { Injectable } from '@nestjs/common';
import type { User } from '../../generated/prisma/client';
import { DEFAULT_TIMEZONE } from '../../common/constants/board.constants';
import { TimezoneUtil } from '../../common/utils/timezone.util';
import {
  UserRepository,
  CreateUserInput,
} from './repositories/user.repository';

@Injectable()
export class UsersService {
  constructor(private readonly userRepository: UserRepository) {}

  /**
   * The zone every wall-clock time for this user must be read and written in.
   *
   * Background jobs (mail ingestion, Zalo reminders) have no request to take a
   * `?tz=` from, so they rely on this. Never fall back to the server's own
   * clock: the container runs UTC while users are on GMT+7.
   */
  async resolveTimezone(userId: string, requested?: string): Promise<string> {
    if (requested && TimezoneUtil.isValid(requested)) return requested;
    const user = await this.userRepository.findById(userId);
    if (user?.timezone && TimezoneUtil.isValid(user.timezone)) {
      return user.timezone;
    }
    return DEFAULT_TIMEZONE;
  }

  findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findByEmail(email);
  }

  findById(id: string): Promise<User | null> {
    return this.userRepository.findById(id);
  }

  findByGoogleId(googleId: string): Promise<User | null> {
    return this.userRepository.findByGoogleId(googleId);
  }

  create(input: CreateUserInput): Promise<User> {
    return this.userRepository.create(input);
  }

  linkGoogleId(userId: string, googleId: string): Promise<User> {
    return this.userRepository.linkGoogleId(userId, googleId);
  }
}
