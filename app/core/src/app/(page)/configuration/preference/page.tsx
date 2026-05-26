import { defaultLocale } from '@/i18n/config';
import { getDictionary } from '@/i18n/dictionaries';

export default async function Preference() {
  const dict = await getDictionary(defaultLocale);

  return (
    <main className="page-main">
      <h1>{dict.configuration_preference.title}</h1>
    </main>
  );
}
