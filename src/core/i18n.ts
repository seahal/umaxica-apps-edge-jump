export type Locale = 'ja' | 'en';

export function asLocale(value: string | undefined): Locale {
  return value === 'en' ? 'en' : 'ja';
}

export const messages = {
  ja: {
    aboutTitle: 'UMAXICA Jump Gateway',
    aboutPageTitle: 'サイトについて',
    aboutDescription: 'UMAXICA のジャンプページです。',
    healthTitle: 'サーバー状態',
    healthOk: 'status',
    errorTitle: 'リクエストを処理できません',
    notFoundTitle: 'ページが見つかりません',
    rateLimitTitle: 'アクセスが集中しています',
    errorHeading: '無効な Jump リクエスト',
    errorBody: 'このリダイレクトリクエストは使用できません。',
    notFoundBody: 'お探しのページは見つかりませんでした。',
    rateLimitBody: '時間をおいてからもう一度お試しください。',
    cushionTitle: '外部サイトへ移動',
    nonAsciiWarning: '移動先のホスト名には非 ASCII 文字が含まれています。',
    host: 'ホスト',
    url: 'URL',
    continue: '続行',
  },
  en: {
    aboutTitle: 'UMAXICA Jump Gateway',
    aboutPageTitle: 'About',
    aboutDescription: 'This is the UMAXICA jump page.',
    healthTitle: 'Health status',
    healthOk: 'status',
    errorTitle: 'Cannot process this request',
    notFoundTitle: 'Page not found',
    rateLimitTitle: 'Too many requests',
    errorHeading: 'Invalid jump request',
    errorBody: 'The redirect request could not be used.',
    notFoundBody: 'The page you requested could not be found.',
    rateLimitBody: 'Please wait a moment and try again.',
    cushionTitle: 'Continue to external site',
    nonAsciiWarning: 'The destination hostname contains non-ASCII characters.',
    host: 'host',
    url: 'url',
    continue: 'Continue',
  },
} as const;
