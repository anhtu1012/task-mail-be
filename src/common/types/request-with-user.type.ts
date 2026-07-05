import { Request } from 'express';
import { JwtAccessPayload } from './jwt-payload.type';
import { GoogleProfile } from '../../modules/auth/types/google-profile.type';

export type RequestWithUser = Request & { user: JwtAccessPayload };

export type RequestWithRefreshUser = Request & {
  user: { sub: string; tokenId: string; refreshToken: string };
};

export type RequestWithGoogleUser = Request & { user: GoogleProfile };
