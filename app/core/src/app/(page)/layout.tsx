import Link from 'next/link';
import { defaultLocale } from '@/i18n/config';
import { getDictionary } from '@/i18n/dictionaries';

export default async function PageLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const dict = await getDictionary(defaultLocale);

  const links = [
    { href: '/', label: dict.home.title },
    { href: '/explore', label: dict.explore.title },
    { href: '/rails-health', label: 'Rails health' },
    { href: '/messages', label: dict.messages.title },
    { href: '/notifications', label: dict.notifications.title },
    { href: '/configuration', label: dict.configuration.title },
    { href: '/about', label: dict.about.title },
  ] as const;

  return (
    <div className="page-shell">
      <aside className="page-sidebar">
        <h1 className="page-brand">UMAXICA</h1>
        <nav aria-label="Primary" className="page-nav">
          {links.map((link) => (
            <Link href={link.href as never} key={link.href}>
              {link.label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="page-content">
        <header className="page-header">
          <h1>UMAXICA</h1>
          <p>{defaultLocale.toUpperCase()} workspace</p>
        </header>
        {children}
      </div>
    </div>
  );
}
