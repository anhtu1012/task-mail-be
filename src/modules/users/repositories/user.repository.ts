import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { AuthProvider, Role } from '../../../generated/prisma/enums';
import type { User } from '../../../generated/prisma/client';

export type CreateUserInput = {
  email: string;
  passwordHash?: string;
  googleId?: string;
  provider?: AuthProvider;
  role?: Role;
};

@Injectable()
export class UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  findByGoogleId(googleId: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { googleId } });
  }

  create(input: CreateUserInput): Promise<User> {
    return this.prisma.user.create({
      data: {
        email: input.email,
        passwordHash: input.passwordHash,
        googleId: input.googleId,
        provider: input.provider ?? AuthProvider.LOCAL,
        role: input.role ?? Role.USER,
      },
    });
  }

  linkGoogleId(userId: string, googleId: string): Promise<User> {
    return this.prisma.user.update({ where: { id: userId }, data: { googleId } });
  }
}
