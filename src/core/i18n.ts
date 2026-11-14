export type Locale = 'ja' | 'en';

export function asLocale(value: string | undefined): Locale {
  return value === 'en' ? 'en' : 'ja';
}

export const messages = {
  ja: {
    aboutTitle: 'UMAXICA Jump Gateway',
    aboutPageTitle: 'サイトについて',
    aboutDescription: 'UMAXICA のジャンプページです。サービス間の移動を中継します。',
    healthTitle: 'サーバー状態',
    healthOk: 'status',
    errorTitle: 'リクエストを処理できません',
    rateLimitTitle: 'アクセスが集中しています',
    unavailableTitle: '接続できません',
    errorHeading: '無効な Jump リクエスト',
    errorBody: 'このリダイレクトリクエストは使用できません。元のページからもう一度お試しください。',
    aboutCta: 'サイトについて',
    rateLimitBody: '時間をおいてから再読み込みしてください。',
    unavailableHeading: '接続できません',
    unavailableBody:
      '時間をおいてから再読み込みしてください。サーバーに届いていない可能性があります。',
    reload: '再読み込み',
    back: '戻る',
  },
  en: {
    aboutTitle: 'UMAXICA Jump Gateway',
    aboutPageTitle: 'About',
    aboutDescription: 'This is the UMAXICA jump page. It brokers navigation between services.',
    healthTitle: 'Health status',
    healthOk: 'status',
    errorTitle: 'Cannot process this request',
    rateLimitTitle: 'Too many requests',
    unavailableTitle: 'Could not connect',
    errorHeading: 'Invalid jump request',
    errorBody: 'The redirect request could not be used. Try again from the original page.',
    aboutCta: 'About',
    rateLimitBody: 'Wait a moment, then reload.',
    unavailableHeading: 'Could not connect',
    unavailableBody: 'Wait a moment, then reload. The service may have been unreachable.',
    reload: 'Reload',
    back: 'Back',
  },
} as const;
