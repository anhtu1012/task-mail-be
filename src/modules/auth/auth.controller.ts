import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiCookieAuth,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto } from './dto/auth-request.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { MeResponseDto } from './dto/me-response.dto';
import { AUTH_MODULE_CONSTANTS } from './auth.constants';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CookieUtil } from '../../common/utils/cookie.util';
import { DateUtil } from '../../common/utils/date.util';
import { COOKIE_KEYS } from '../../common/constants/cookie.constants';
import { API_ROUTES } from '../../common/constants/api-routes.constants';
import type {
  RequestWithUser,
  RequestWithRefreshUser,
  RequestWithGoogleUser,
} from '../../common/types/request-with-user.type';
import { CookieConfig } from '../../config/cookie.config';
import { GoogleOAuthConfig } from '../../config/google.config';
import { IssuedTokenPair } from './services/token.service';

@ApiTags(AUTH_MODULE_CONSTANTS.SWAGGER_TAG)
@Controller(API_ROUTES.AUTH.ROOT)
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  private getRequestMeta(req: Request) {
    return { userAgent: req.headers['user-agent'], ipAddress: req.ip };
  }

  private setRefreshCookieAndRespond(res: Response, issued: IssuedTokenPair): AuthResponseDto {
    const cookieConfig = this.configService.getOrThrow<CookieConfig>('cookie');
    CookieUtil.setRefreshTokenCookie(
      res,
      issued.refreshToken,
      cookieConfig,
      issued.refreshTokenExpiresAt.getTime() - Date.now(),
    );
    return { accessToken: issued.accessToken, expiresIn: issued.accessTokenExpiresIn };
  }

  @Public()
  @Post(API_ROUTES.AUTH.REGISTER)
  @ApiOperation({ summary: 'Register a new account' })
  @ApiResponse({ status: HttpStatus.CREATED, type: AuthResponseDto })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'Email already registered' })
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    const issued = await this.authService.register(dto, this.getRequestMeta(req));
    return this.setRefreshCookieAndRespond(res, issued);
  }

  @Public()
  @Post(API_ROUTES.AUTH.LOGIN)
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiResponse({ status: HttpStatus.OK, type: AuthResponseDto })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Invalid credentials' })
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    const issued = await this.authService.login(dto, this.getRequestMeta(req));
    return this.setRefreshCookieAndRespond(res, issued);
  }

  @Public()
  @UseGuards(JwtRefreshGuard)
  @ApiCookieAuth(COOKIE_KEYS.REFRESH_TOKEN)
  @Post(API_ROUTES.AUTH.REFRESH_TOKEN)
  @ApiOperation({ summary: 'Rotate the refresh token and issue a new access token' })
  @ApiResponse({ status: HttpStatus.OK, type: AuthResponseDto })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Refresh token missing, expired, or reused' })
  @HttpCode(HttpStatus.OK)
  async refreshToken(
    @Req() req: RequestWithRefreshUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    const { sub, tokenId, refreshToken } = req.user;
    const issued = await this.authService.refreshToken(
      { userId: sub, tokenId, rawRefreshToken: refreshToken },
      this.getRequestMeta(req),
    );
    return this.setRefreshCookieAndRespond(res, issued);
  }

  @Public()
  @UseGuards(JwtRefreshGuard)
  @ApiCookieAuth(COOKIE_KEYS.REFRESH_TOKEN)
  @Post(API_ROUTES.AUTH.LOGOUT)
  @ApiOperation({ summary: 'Revoke the current refresh token and clear the session cookie' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() req: RequestWithRefreshUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.authService.logout(req.user.tokenId);
    CookieUtil.clearRefreshTokenCookie(res, this.configService.getOrThrow<CookieConfig>('cookie'));
  }

  @ApiBearerAuth('access-token')
  @Get(API_ROUTES.AUTH.ME)
  @ApiOperation({ summary: 'Get the authenticated user profile' })
  @ApiResponse({ status: HttpStatus.OK, type: MeResponseDto })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED })
  async me(@CurrentUser() user: RequestWithUser['user']): Promise<MeResponseDto> {
    const profile = await this.authService.getProfile(user.sub);
    return { id: profile.id, email: profile.email, role: profile.role };
  }

  @Public()
  @UseGuards(GoogleAuthGuard)
  @Get(API_ROUTES.AUTH.GOOGLE)
  @ApiOperation({ summary: 'Redirect to Google to start the sign-in/register flow' })
  googleLogin(): void {
    // Handled by GoogleAuthGuard, which redirects to Google's consent screen.
  }

  @Public()
  @UseGuards(GoogleAuthGuard)
  @Get(API_ROUTES.AUTH.GOOGLE_CALLBACK)
  @ApiOperation({ summary: 'Google OAuth callback: issues tokens and redirects to the frontend' })
  async googleCallback(
    @Req() req: RequestWithGoogleUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const issued = await this.authService.googleLogin(req.user, this.getRequestMeta(req));
    this.setRefreshCookieAndRespond(res, issued);

    const { frontendUrl } = this.configService.getOrThrow<GoogleOAuthConfig>('googleOAuth');
    const redirectUrl = new URL('/oauth-callback', frontendUrl);
    redirectUrl.searchParams.set('accessToken', issued.accessToken);
    redirectUrl.searchParams.set('expiresIn', String(issued.accessTokenExpiresIn));
    res.redirect(redirectUrl.toString());
  }
}
