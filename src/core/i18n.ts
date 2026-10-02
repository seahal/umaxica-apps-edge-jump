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
    errorBody: 'このリダイレクトリクエストは使用できません。再読み込みでは直りません。',
    aboutCta: 'サイトについて',
    rateLimitBody: '時間をおいてから再読み込みしてください。',
    unavailableHeading: '接続できません',
    unavailableBody:
      '時間をおいてから再読み込みしてください。サーバーに届いていない可能性があります。',
    reload: '再読み込み',
    cushionTitle: '外部サイトへ移動',
    cushionHint: '移動先のホスト名を確認してから進んでください。',
    cushionReloadNote: 'このページを再読み込みすると、移動先は消えます。',
    nonAsciiWarning: '移動先のホスト名には非 ASCII 文字が含まれています。',
    host: 'ホスト',
    punycode: 'Punycode',
    url: 'URL',
    continue: '続行',
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
    errorBody: 'The redirect request could not be used. Reloading will not fix it.',
    aboutCta: 'About',
    rateLimitBody: 'Wait a moment, then reload.',
    unavailableHeading: 'Could not connect',
    unavailableBody: 'Wait a moment, then reload. The service may have been unreachable.',
    reload: 'Reload',
    cushionTitle: 'Continue to external site',
    cushionHint: 'Check the destination hostname before you continue.',
    cushionReloadNote: 'Reloading this page discards the destination.',
    nonAsciiWarning: 'The destination hostname contains non-ASCII characters.',
    host: 'host',
    punycode: 'Punycode',
    url: 'url',
    continue: 'Continue',
  },
} as const;
