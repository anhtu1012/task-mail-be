import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy, StrategyOptionsWithoutRequest } from 'passport-jwt';
import { AUTH_CONSTANTS } from '../../../common/constants/auth.constants';
import { JwtAccessPayload } from '../../../common/types/jwt-payload.type';

@Injectable()
export class JwtStrategy extends PassportStrategy(
  Strategy,
  AUTH_CONSTANTS.JWT_ACCESS_STRATEGY,
) {
  constructor(configService: ConfigService) {
    const options: StrategyOptionsWithoutRequest = {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('auth.accessSecret'),
    };
    super(options);
  }

  validate(payload: JwtAccessPayload): JwtAccessPayload {
    return payload;
  }
}
