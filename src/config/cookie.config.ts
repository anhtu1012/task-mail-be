import { registerAs } from '@nestjs/config';

export interface CookieConfig {
  secure: boolean;
  // Left undefined in cross-site setups (frontend and backend on different
  // domains) so the browser scopes the cookie to the exact backend host
  // instead of rejecting a Set-Cookie whose domain doesn't match it.
  domain?: string;
  // Cross-site requests only ever carry a cookie when it's `SameSite=None`
  // (which itself requires Secure/HTTPS) — same-site local dev keeps `lax`.
  sameSite: 'none' | 'lax';
}

export default registerAs('cookie', (): CookieConfig => {
  const secure = process.env.COOKIE_SECURE === 'true';
  return {
    secure,
    domain: process.env.COOKIE_DOMAIN || undefined,
    sameSite: secure ? 'none' : 'lax',
  };
});
