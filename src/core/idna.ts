/** Decode ASCII hostnames with `xn--` labels to Unicode. Fail closed to ASCII. */
export function unicodeHostname(asciiHostname: string): string {
  return asciiHostname
    .split('.')
    .map((label) => {
      if (!label.startsWith('xn--')) return label;
      try {
        return decodePunycode(label.slice(4));
      } catch {
        return label;
      }
    })
    .join('.');
}

function decodePunycode(input: string): string {
  const output: number[] = [];
  let n = 128;
  let i = 0;
  let bias = 72;
  const lastDelim = input.lastIndexOf('-');
  const basicEnd = lastDelim < 0 ? 0 : lastDelim;
  for (let j = 0; j < basicEnd; j += 1) {
    const code = input.charCodeAt(j);
    if (code >= 0x80) throw new Error('punycode');
    output.push(code);
  }
  let index = basicEnd > 0 ? basicEnd + 1 : 0;
  while (index < input.length) {
    const oldI = i;
    let w = 1;
    for (let k = 36; ; k += 36) {
      if (index >= input.length) throw new Error('punycode');
      const digit = decodeDigit(input.charCodeAt(index));
      index += 1;
      i += digit * w;
      const t = k <= bias ? 1 : k >= bias + 26 ? 26 : k - bias;
      if (digit < t) break;
      w *= 36 - t;
    }
    const out = output.length + 1;
    bias = adapt(i - oldI, out, oldI === 0);
    n += Math.floor(i / out);
    i %= out;
    output.splice(i, 0, n);
    i += 1;
  }
  return String.fromCodePoint(...output);
}

function decodeDigit(code: number): number {
  if (code >= 48 && code <= 57) return code - 22;
  if (code >= 65 && code <= 90) return code - 65;
  if (code >= 97 && code <= 122) return code - 97;
  throw new Error('punycode');
}

function adapt(delta: number, numPoints: number, firstTime: boolean): number {
  let d = firstTime ? Math.floor(delta / 700) : Math.floor(delta / 2);
  d += Math.floor(d / numPoints);
  let k = 0;
  while (d > 455) {
    d = Math.floor(d / 35);
    k += 36;
  }
  return k + Math.floor((36 * d) / (d + 38));
}
