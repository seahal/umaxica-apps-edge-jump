import { defaultLocale } from '@/i18n/config';
import { getDictionary } from '@/i18n/dictionaries';

export default async function Messages() {
  const dict = await getDictionary(defaultLocale);

  return (
    <main className="page-main">
      <h1>{dict.messages.title}</h1>
      <p>{dict.messages.wip}</p>
    </main>
  );
}
