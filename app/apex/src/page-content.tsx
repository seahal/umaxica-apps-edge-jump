import type { AssetEnv } from '../../../shared/apex/security-headers';
import { DEFAULT_BRAND_NAME } from '../../../shared/apex/brand';

const ABOUT_DESCRIPTION =
  'umaxica.app is the apex domain of the UMAXICA platform. Services and content are available on dedicated subdomains';

export const ABOUT_CANONICAL_URL = 'https://umaxica.app/about';
export const ABOUT_ROBOTS = 'index,follow';

export function buildApexTitle(_env: AssetEnv, domain: string, pageName?: string): string {
  const brandName = DEFAULT_BRAND_NAME;
  const baseTitle = `${brandName} (${domain}) - Apex`;
  return pageName ? `${pageName} | ${baseTitle}` : baseTitle;
}

export function getAboutMeta(env: AssetEnv) {
  return {
    title: buildApexTitle(env, 'app', 'About'),
    description: ABOUT_DESCRIPTION,
    canonical: ABOUT_CANONICAL_URL,
    robots: ABOUT_ROBOTS,
  };
}

export function renderAboutContent(language: string | undefined) {
  if (language === 'ja') {
    return (
      <div class="space-y-4">
        <h2 class="text-3xl font-semibold text-gray-800">このサイトについて</h2>
        <p>
          本ドメイン（<a href="https://umaxica.app">umaxica.app</a>
          ）は、一般向けのウェブサイトとして運用いたしておりません。弊社サービスの利用につきましては、
          <a href="https://umaxica.app">umaxica.app</a>、{' '}
          <a href="https://umaxica.com">umaxica.com</a>、{' '}
          <a href="https://umaxica.org">umaxica.org</a>
          の公式ウェブサイトへごアクセス賜りますようお願い申し上げます。
        </p>
      </div>
    );
  }

  return (
    <div class="space-y-4">
      <h2 class="text-3xl font-semibold text-gray-800">About this site.</h2>
      <p>
        This domain (<a href="https://umaxica.app">umaxica.app</a>) is not operated as a
        public-facing website. To access our services, please visit our official websites (
        <a href="https://umaxica.app">umaxica.app</a>, <a href="https://umaxica.com">umaxica.com</a>
        , <a href="https://umaxica.org">umaxica.org</a>).
      </p>
    </div>
  );
}
