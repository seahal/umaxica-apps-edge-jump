export type Locale = 'ja' | 'en';

export function localeFromAcceptLanguage(value: string | null | undefined): Locale {
  if (!value) return 'ja';
  const preferences = value
    .slice(0, 512)
    .split(',')
    .slice(0, 16)
    .flatMap((part, index) => {
      const [language = '', ...parameters] = part.trim().split(';');
      const languageCode = /^(en|ja)(?:-|$)/i.exec(language)?.[1]?.toLowerCase();
      if (languageCode !== 'en' && languageCode !== 'ja') return [];
      const qualityParameter = parameters.find((parameter) => /^\s*q\s*=/i.test(parameter));
      const quality = qualityParameter === undefined ? 1 : Number(qualityParameter.split('=')[1]);
      if (!Number.isFinite(quality) || quality <= 0 || quality > 1) return [];
      return [{ locale: languageCode as Locale, quality, index }];
    });
  preferences.sort((left, right) => right.quality - left.quality || left.index - right.index);
  return preferences[0]?.locale ?? 'ja';
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
