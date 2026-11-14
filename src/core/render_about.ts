import { type Locale } from './i18n';
import { renderAboutPage } from './page';

export function renderAbout(locale: Locale) {
  return renderAboutPage(locale);
}
