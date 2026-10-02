import { type Locale } from './i18n';
import { renderAboutPage } from './page';

export function renderAbout(locale: Locale, serviceOrigin: string) {
  return renderAboutPage(locale, serviceOrigin);
}
