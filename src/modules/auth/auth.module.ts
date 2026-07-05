import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokenService } from './services/token.service';
import { RefreshTokenRepository } from './repositories/refresh-token.repository';
import { RegisterHandler } from './handlers/register.handler';
import { LoginHandler } from './handlers/login.handler';
import { LogoutHandler } from './handlers/logout.handler';
import { RefreshTokenHandler } from './handlers/refresh-token.handler';
import { GoogleLoginHandler } from './handlers/google-login.handler';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy';
import { GoogleStrategy } from './strategies/google.strategy';

@Module({
  imports: [UsersModule, PassportModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    RefreshTokenRepository,
    RegisterHandler,
    LoginHandler,
    LogoutHandler,
    RefreshTokenHandler,
    GoogleLoginHandler,
    JwtStrategy,
    JwtRefreshStrategy,
    GoogleStrategy,
  ],
})
export class AuthModule {}
