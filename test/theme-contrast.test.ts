import { assertDefined } from './assert-defined';
import { expect, test } from 'vitest';
import { PRODUCT_PAGE_CSS, SPLASH_PAGE_CSS } from '../src/core/security_headers';

function luminance(hex: string) {
  const channel = (offset: number) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return channel(1) * 0.2126 + channel(3) * 0.7152 + channel(5) * 0.0722;
}
function contrast(first: string, second: string) {
  const a = luminance(first),
    b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
for (const [layout, css] of [
  ['product', PRODUCT_PAGE_CSS],
  ['splash', SPLASH_PAGE_CSS],
] as const) {
  const palettes = [...css.matchAll(/:root\{([^}]+)\}/g)].map((match) =>
    Object.fromEntries(
      [...assertDefined(match[1]).matchAll(/--([a-z-]+):(#[0-9a-f]{6})/g)].map((color) => [
        assertDefined(color[1]),
        assertDefined(color[2]),
      ]),
    ),
  );
  test(`${layout} defines light and OS dark palettes with accessible contrast`, () => {
    expect(palettes).toHaveLength(2);
    expect(css).toContain('@media(prefers-color-scheme:dark)');
    for (const palette of palettes) {
      for (const [foreground, background] of [
        ['ink', 'paper'],
        ['muted', 'paper'],
        ['muted', 'panel'],
        ['alert-ink', 'alert-bg'],
        ['paper', 'ink'],
        ['paper', 'muted'],
      ] as const) {
        expect(
          contrast(assertDefined(palette[foreground]), assertDefined(palette[background])),
          `${foreground}/${background}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
      for (const foreground of ['control', 'ink'])
        expect(
          contrast(assertDefined(palette[foreground]), assertDefined(palette.paper)),
        ).toBeGreaterThanOrEqual(3);
    }
  });
}
