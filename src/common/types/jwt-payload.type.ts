import { Role } from '../enums/role.enum';

export type JwtAccessPayload = {
  sub: string;
  email: string;
  role: Role;
};

export type JwtRefreshPayload = {
  sub: string;
  tokenId: string;
};
