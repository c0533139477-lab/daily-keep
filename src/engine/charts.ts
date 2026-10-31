/**
 * גרפים למייל, כקבצי SVG שהופכים לתמונות (במיילים אי אפשר לצייר גרפים ב-HTML).
 * צבעים חמים בהשראת עיצוב "יקיר לי": קורל, סגול-תכלת, צהוב, ורוד וכחול.
 */
import { TEXT_FONT } from './fonts';

export const PALETTE = ['#E9573F', '#7376F5', '#F4B740', '#E87A9A', '#4F7CA8', '#8BBF6A', '#B07A5A', '#5FC2B8'];
export const OTHER_COLOR = '#D9CFC4';

export interface Slice {
  label: string;
  value: number;
  color: string;
}

/** מחלק לפרוסות: עד 6 קטגוריות, והשאר מתאחדות ל"עוד קטגוריות" */
export function toSlices(byCategory: [string, number][], max = 6): Slice[] {
  const top = byCategory.slice(0, max).map(([label, value], i) => ({ label, value, color: PALETTE[i % PALETTE.length] }));
  const rest = byCategory.slice(max).reduce((s, [, v]) => s + v, 0);
  if (rest > 0) top.push({ label: 'עוד קטגוריות', value: rest, color: OTHER_COLOR });
  return top;
}

const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const shekel0 = (n: number) => '₪' + Math.round(n).toLocaleString('en-US');

function arcPath(cx: number, cy: number, r: number, start: number, end: number) {
  const p = (a: number) => [cx + r * Math.sin(a), cy - r * Math.cos(a)];
  const [x1, y1] = p(start);
  const [x2, y2] = p(end);
  const large = end - start > Math.PI ? 1 : 0;
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

/** טבעת (דונאט) עם הסכום הכולל במרכז */
export function donutSvg(slices: Slice[], total: number, size = 220): string {
  const cx = size / 2;
  const cy = size / 2;
  const stroke = size * 0.13;
  const r = size / 2 - stroke / 2 - 2;
  const sum = slices.reduce((s, x) => s + x.value, 0) || 1;
  const gap = slices.length > 1 ? 0.025 : 0;
  let a = 0;
  const arcs = slices
    .map((s) => {
      const span = (s.value / sum) * Math.PI * 2;
      const start = a + gap / 2;
      const end = a + Math.max(span - gap / 2, gap / 2 + 0.001);
      a += span;
      if (span >= Math.PI * 2 - 0.0001) {
        return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s.color}" stroke-width="${stroke}"/>`;
      }
      return `<path d="${arcPath(cx, cy, r, start, end)}" fill="none" stroke="${s.color}" stroke-width="${stroke}"/>`;
    })
    .join('');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#F3E9DC" stroke-width="${stroke}"/>` +
    arcs +
    `<text x="${cx}" y="${cy - 6}" text-anchor="middle" font-family="${TEXT_FONT.replace(/'/g, '')}" font-weight="700" font-size="${size * 0.075}" fill="#9A7B6A">החודש</text>` +
    `<text x="${cx}" y="${cy + size * 0.1}" text-anchor="middle" font-family="${TEXT_FONT.replace(/'/g, '')}" font-weight="800" font-size="${size * 0.12}" fill="#7B4B36">${esc(shekel0(total))}</text>` +
    `</svg>`
  );
}

export interface MonthBar {
  label: string; // 08/26
  total: number;
  current: boolean;
}

/** עמודות של החודשים האחרונים, החודש הנוכחי מודגש */
export function monthBarsSvg(bars: MonthBar[], width = 520, height = 220): string {
  const pad = { top: 28, bottom: 34, side: 16 };
  const max = Math.max(1, ...bars.map((b) => b.total));
  const slot = (width - pad.side * 2) / Math.max(1, bars.length);
  const barW = Math.min(64, slot * 0.6);
  const plotH = height - pad.top - pad.bottom;
  // מימין לשמאל: החודש הישן בצד ימין, כמו בעברית
  const items = bars
    .map((b, i) => {
      const x = width - pad.side - slot * (i + 0.5) - barW / 2;
      const h = Math.max(2, (b.total / max) * plotH);
      const y = pad.top + plotH - h;
      const color = b.current ? '#7376F5' : '#E6DCCF';
      return (
        `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" rx="6" fill="${color}"/>` +
        `<text x="${(x + barW / 2).toFixed(1)}" y="${(y - 8).toFixed(1)}" text-anchor="middle" font-family="${TEXT_FONT.replace(/'/g, '')}" font-weight="700" font-size="13" fill="#7B4B36">${esc(shekel0(b.total))}</text>` +
        `<text x="${(x + barW / 2).toFixed(1)}" y="${height - 10}" text-anchor="middle" font-family="${TEXT_FONT.replace(/'/g, '')}" font-size="14" font-weight="${b.current ? 800 : 700}" fill="#7B4B36">${esc(b.label)}</text>`
      );
    })
    .join('');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<line x1="${pad.side}" x2="${width - pad.side}" y1="${pad.top + plotH}" y2="${pad.top + plotH}" stroke="#EADFD2"/>` +
    items +
    `</svg>`
  );
}
