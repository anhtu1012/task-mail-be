export const AUTH_CONSTANTS = {
  BCRYPT_SALT_ROUNDS: 12,
  JWT_ACCESS_STRATEGY: 'jwt-access',
  JWT_REFRESH_STRATEGY: 'jwt-refresh',
  GOOGLE_STRATEGY: 'google',
} as const;

export const IS_PUBLIC_KEY = 'isPublic';
export const ROLES_KEY = 'roles';
