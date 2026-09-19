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
  PROJECTS: {
    ROOT: 'projects',
    DEFAULT: 'default',
    ARCHIVE: 'archive',
  },
  PREFERENCES: {
    ROOT: 'me/preferences',
    THEME: 'theme',
  },
  TASKS: {
    ROOT: 'tasks',
    STATS: 'stats',
    COMPLETE: 'complete',
    MOVE: 'move',
    SNOOZE: 'snooze',
    DETAIL: 'detail',
    RESTORE: 'restore',
    LABELS: 'labels',
    CHECKLISTS: 'checklists',
    NOTES: 'notes',
    ATTACHMENTS: 'attachments',
  },
  BOARDS: {
    ROOT: 'boards',
    ME_FULL: 'me/full',
    ME_TODAY: 'me/today',
    ME_AGENDA: 'me/agenda',
    ME_SEARCH: 'me/search',
    LISTS: 'lists',
    LABELS: 'labels',
  },
  LISTS: {
    ROOT: 'lists',
    MOVE: 'move',
    REBALANCE: 'rebalance',
    CARDS: 'cards',
  },
  CHECKLISTS: {
    ROOT: 'checklists',
    ITEMS: 'items',
  },
  CHECKLIST_ITEMS: {
    ROOT: 'checklist-items',
  },
  NOTES: {
    ROOT: 'notes',
  },
  ATTACHMENTS: {
    ROOT: 'attachments',
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
