/** @jsxImportSource hono/jsx */

type FooterProps = {
  brandName?: string;
};

export function Footer({ brandName = 'UMAXICA' }: FooterProps) {
  const currentYear = new Date().getUTCFullYear();
  return (
    <footer class="bg-white border-t border-gray-200 mt-auto">
      <div class="max-w-7xl mx-auto px-4 py-4">
        <p class="text-center text-sm text-gray-600">
          &copy; {currentYear} {brandName}
        </p>
      </div>
    </footer>
  );
}
