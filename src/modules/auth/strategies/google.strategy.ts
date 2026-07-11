import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import {
  Strategy,
  StrategyOptions,
  VerifyCallback,
  Profile,
} from 'passport-google-oauth20';
import { AUTH_CONSTANTS } from '../../../common/constants/auth.constants';
import { GoogleOAuthConfig } from '../../../config/google.config';
import { GoogleProfile } from '../types/google-profile.type';

@Injectable()
export class GoogleStrategy extends PassportStrategy(
  Strategy,
  AUTH_CONSTANTS.GOOGLE_STRATEGY,
) {
  constructor(configService: ConfigService) {
    const googleConfig =
      configService.getOrThrow<GoogleOAuthConfig>('googleOAuth');
    const options: StrategyOptions = {
      clientID: googleConfig.clientId ?? '',
      clientSecret: googleConfig.clientSecret ?? '',
      callbackURL: googleConfig.loginCallbackUrl ?? '',
      scope: ['email', 'profile'],
    };
    super(options);
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): void {
    const email = profile.emails?.[0]?.value;
    const googleProfile: GoogleProfile = {
      googleId: profile.id,
      email,
      firstName: profile.name?.givenName,
      lastName: profile.name?.familyName,
      picture: profile.photos?.[0]?.value,
    };
    done(null, googleProfile);
  }
}
