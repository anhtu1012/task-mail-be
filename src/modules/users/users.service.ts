import { Injectable } from '@nestjs/common';
import type { User } from '../../generated/prisma/client';
import {
  UserRepository,
  CreateUserInput,
} from './repositories/user.repository';

@Injectable()
export class UsersService {
  constructor(private readonly userRepository: UserRepository) {}

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
