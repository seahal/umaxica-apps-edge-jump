/** @jsxImportSource hono/jsx */
import { renderToString } from 'hono/jsx/dom/server';
import { Footer } from '../footer';

describe('shared Footer component', () => {
  it('renders copyright with current UTC year', () => {
    const html = renderToString(<Footer />);
    const currentYear = new Date().getUTCFullYear();
    expect(html).toContain(`© ${currentYear} UMAXICA`);
  });

  it('renders a footer element', () => {
    const html = renderToString(<Footer />);
    expect(html).toContain('<footer');
    expect(html).toContain('</footer>');
  });

  it('uses default brand name UMAXICA', () => {
    const html = renderToString(<Footer />);
    expect(html).toContain('UMAXICA');
  });

  it('accepts custom brand name', () => {
    const html = renderToString(<Footer brandName="CustomBrand" />);
    expect(html).toContain('CustomBrand');
    expect(html).not.toContain('UMAXICA');
  });

  it('applies expected CSS classes', () => {
    const html = renderToString(<Footer />);
    expect(html).toContain('bg-white');
    expect(html).toContain('border-t');
    expect(html).toContain('border-gray-200');
    expect(html).toContain('text-center');
  });
});
