import { registerAs } from '@nestjs/config';

export interface GoogleOAuthConfig {
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  // Separate callback for the "Sign in with Google" login flow, distinct
  // from the Gmail mail-ingestion connect flow above (different redirect
  // URI registered on the same Google Cloud OAuth client).
  loginCallbackUrl?: string;
  frontendUrl?: string;
}

export default registerAs('googleOAuth', (): GoogleOAuthConfig => ({
  clientId: process.env.GOOGLE_OAUTH_CLIENT_ID,
  clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
  redirectUri: process.env.GOOGLE_OAUTH_REDIRECT_URI,
  loginCallbackUrl: process.env.GOOGLE_OAUTH_LOGIN_CALLBACK_URL,
  frontendUrl: process.env.FRONTEND_URL,
}));
