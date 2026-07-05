export const API_ROUTES = {
  AUTH: {
    ROOT: 'auth',
    REGISTER: 'register',
    LOGIN: 'login',
    LOGOUT: 'logout',
    REFRESH_TOKEN: 'refresh-token',
    ME: 'me',
    GOOGLE: 'google',
    GOOGLE_CALLBACK: 'google/callback',
  },
  TASKS: {
    ROOT: 'tasks',
    STATS: 'stats',
    COMPLETE: 'complete',
  },
  TASK_TYPES: {
    ROOT: 'task-types',
  },
  MAIL_ACCOUNTS: {
    ROOT: 'mail-accounts',
    GOOGLE_CONNECT: 'google/connect',
    GOOGLE_CALLBACK: 'google/callback',
  },
  ZALO_ACCOUNTS: {
    ROOT: 'zalo-accounts',
    LINK_CODE: 'link-code',
    ME: 'me',
  },
  ZALO_BOT: {
    ROOT: 'zalo-bot',
    STATUS: 'status',
  },
} as const;
