import { defaultLocale } from '@/i18n/config';
import { getDictionary } from '@/i18n/dictionaries';

export default async function PageIndex() {
  const dict = await getDictionary(defaultLocale);

  return (
    <main className="page-main">
      <h1>{dict.home.title}</h1>
      <p>{dict.home.description}</p>
    </main>
  );
}
