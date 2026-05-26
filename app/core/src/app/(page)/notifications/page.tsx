import { defaultLocale } from '@/i18n/config';
import { getDictionary } from '@/i18n/dictionaries';

export default async function Notifications() {
  const dict = await getDictionary(defaultLocale);

  return (
    <main className="page-main">
      <h1>{dict.notifications.title}</h1>
      <p>{dict.notifications.wip}</p>
    </main>
  );
}
