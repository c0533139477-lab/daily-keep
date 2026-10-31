/**
 * באנר מונפש לראש המייל (GIF): עציץ שצומח לפי כמה נשאר בתקציב,
 * ושורות טקסט שנכנסות אחת אחרי השנייה. בהשראת עיצוב "יקיר לי".
 * כאן רק מציירים את הפריימים כ-SVG; ההפיכה ל-GIF נעשית ב-render.ts.
 */
import { DISPLAY_FONT, TEXT_FONT } from './fonts';

export const BANNER_W = 600;
export const BANNER_H = 240;

export const WARM = {
  periwinkle: '#7376F5',
  periwinkleLight: '#8487F7',
  cream: '#FBF5EA',
  brown: '#7B4B36',
  coral: '#E9573F',
  pink: '#E87A9A',
  blue: '#4F7CA8',
  yellow: '#F4C542',
  highlight: '#FCE38A',
  coffee: '#6B3E26',
  crema: '#A8724F',
};

export interface BannerData {
  dateLabel: string; // 25/10
  hasBudget: boolean;
  over: boolean;
  budget: number;
  spent: number;
  left: number; // שלילי בחריגה
  usedPct: number;
  perDayLeft: number;
  daysLeft: number;
}

const clamp = (n: number, a = 0, b = 1) => Math.min(b, Math.max(a, n));
const easeOut = (t: number) => 1 - Math.pow(1 - clamp(t), 3);
const shekel0 = (n: number) => '₪' + Math.round(Math.abs(n)).toLocaleString('en-US');
const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** כניסה של שורה: שקיפות ותזוזה קטנה למעלה, בין from ל-to של ציר הזמן */
function enter(t: number, from: number, to: number) {
  const k = easeOut((t - from) / (to - from));
  return { opacity: k, dy: (1 - k) * 16 };
}

/** פריים אחד. t בין 0 ל-1 */
export function bannerFrameSvg(d: BannerData, t: number): string {
  const W = BANNER_W;
  const H = BANNER_H;
  // ---- עציץ שצומח ----
  // גובה הצמח: לפי כמה נשאר מהתקציב. בלי תקציב - צמח בינוני. בחריגה - נבט קטן ונובל
  const leftFrac = d.hasBudget && d.budget > 0 ? clamp(d.left / d.budget) : 0.6;
  const targetH = d.over ? 64 : 52 + 74 * leftFrac;
  const growK = easeOut((t - 0.16) / 0.46);
  const h = targetH * growK;
  const cx = 150;
  const baseY = 156;
  const wilt = d.over ? easeOut((t - 0.6) / 0.25) : 0;
  const sway = !d.over && t > 0.62 ? Math.sin((t - 0.62) * 22) * 2.5 * (1 - (t - 0.62) / 0.38) : 0;
  const topX = cx + sway + wilt * 10;
  const topY = baseY - h + wilt * 6;
  const stemColor = d.over ? '#9DA65A' : '#6FA552';

  // מטבע שנופל לאדמה בהתחלה
  let coin = '';
  if (t < 0.22) {
    const fallK = clamp(t / 0.14);
    const y = -20 + (baseY - 2 + 20) * fallK * fallK;
    const sink = clamp((t - 0.14) / 0.08);
    const r = 13 * (1 - sink * 0.9);
    coin =
      `<g opacity="${1 - sink}"><circle cx="${cx}" cy="${y}" r="${r}" fill="${WARM.yellow}" stroke="#D9A21C" stroke-width="3"/>` +
      `<text x="${cx}" y="${y + r * 0.42}" text-anchor="middle" font-family="${TEXT_FONT}" font-weight="800" font-size="${r * 1.15}" fill="#9A6B00">₪</text></g>`;
  }
  // נצנוצים כשהמטבע נכנס לאדמה
  let sparkle = '';
  if (t > 0.13 && t < 0.3) {
    const k = clamp((t - 0.13) / 0.17);
    sparkle = [
      [-26, -8],
      [24, -12],
      [-8, -22],
      [12, -4],
    ]
      .map(
        ([dx, dy]) =>
          `<circle cx="${cx + dx * (0.6 + k)}" cy="${baseY + dy * (0.6 + k)}" r="${3 * (1 - k)}" fill="#FFF3B0"/>`,
      )
      .join('');
  }

  // גבעול
  const stem =
    h > 1
      ? `<path d="M ${cx} ${baseY} C ${cx - 10} ${baseY - h * 0.35}, ${topX + 12} ${baseY - h * 0.65}, ${topX} ${topY}" stroke="${stemColor}" stroke-width="6" stroke-linecap="round" fill="none"/>`
      : '';

  // עלים לאורך הגבעול
  const leafPath = 'M0 0 C 9 -13, 30 -14, 38 0 C 30 9, 9 9, 0 0 Z';
  const leaves = [0.28, 0.52, 0.74]
    .map((pos, i) => {
      const at = pos * targetH;
      if (h < at) return '';
      const k = easeOut((h - at) / 22);
      const side = i % 2 === 0 ? -1 : 1; // שמאל / ימין
      const x = cx + (topX - cx) * pos;
      const y = baseY - at + wilt * 4 * pos;
      const angle = side === 1 ? -28 + wilt * 60 : 208 - wilt * 60;
      // בחריגה העלה האמצעי נושר ומתעופף למטה
      if (d.over && i === 1 && t > 0.7) {
        const fall = easeOut((t - 0.7) / 0.3);
        return `<g transform="translate(${x + 70 * fall} ${y + 30 * fall}) rotate(${angle + 120 * fall}) scale(${k})" opacity="${1 - fall * 0.3}"><path d="${leafPath}" fill="#C9A15A"/></g>`;
      }
      const color = d.over ? (wilt > 0.5 ? '#B7B25E' : '#8BBF6A') : i === 1 ? '#7DB55C' : '#8BBF6A';
      return (
        `<g transform="translate(${x} ${y}) rotate(${angle}) scale(${k})"><path d="${leafPath}" fill="${color}"/>` +
        `<path d="M3 0 L 30 0" stroke="#5E8F43" stroke-width="1.6" stroke-linecap="round" opacity=".6"/></g>`
      );
    })
    .join('');

  // פרח שבמרכזו מטבע, נפתח בסוף (כשלא חורגים)
  let flower = '';
  if (!d.over && t > 0.56) {
    const k = clamp((t - 0.56) / 0.2);
    const back = 1 + 0.25 * Math.sin(k * Math.PI) ; // קפיצה קטנה כשהוא נפתח
    const s = easeOut(k) * back;
    const petals = Array.from({ length: 6 }, (_, i) => {
      const a = (i / 6) * Math.PI * 2;
      return `<ellipse cx="${Math.cos(a) * 13}" cy="${Math.sin(a) * 13}" rx="10" ry="8" transform="rotate(${(a * 180) / Math.PI} ${Math.cos(a) * 13} ${Math.sin(a) * 13})" fill="${i % 2 ? '#F29BB6' : WARM.pink}"/>`;
    }).join('');
    flower =
      `<g transform="translate(${topX} ${topY}) scale(${s})">${petals}` +
      `<circle r="10" fill="${WARM.yellow}" stroke="#D9A21C" stroke-width="2"/>` +
      `<text y="4.5" text-anchor="middle" font-family="${TEXT_FONT}" font-weight="800" font-size="12" fill="#9A6B00">₪</text></g>`;
  } else if (d.over && h > 1) {
    // ניצן סגור ומושפל
    flower = `<g transform="translate(${topX} ${topY}) rotate(${40 * wilt})"><ellipse rx="6" ry="9" fill="#C98E9F"/></g>`;
  }

  // מטבעות קטנים שתלויים כמו פירות, כשנשאר הרבה
  let fruits = '';
  if (!d.over && leftFrac > 0.45 && t > 0.66) {
    const k = easeOut((t - 0.66) / 0.18);
    fruits = [
      [-30, 0.6],
      [28, 0.42],
    ]
      .map(([dx, pos]) => {
        const x = cx + dx;
        const y = baseY - pos * targetH + 10;
        return `<g transform="translate(${x} ${y}) scale(${k})"><line x1="0" y1="-10" x2="0" y2="-4" stroke="#5E8F43" stroke-width="2"/><circle r="7" fill="${WARM.yellow}" stroke="#D9A21C" stroke-width="2"/></g>`;
      })
      .join('');
  }

  // העציץ עם פרצוף
  const happy = !d.over || t < 0.6; // בחריגה: מחייך בהתחלה ונהיה מודאג כשהעלים נובלים
  const blink = happy && t > 0.8 && t < 0.86;
  const face = happy
    ? (blink
        ? `<path d="M ${cx - 20} 186 q 5 3 10 0 M ${cx + 10} 186 q 5 3 10 0" stroke="#5A2E1E" stroke-width="2.5" fill="none" stroke-linecap="round"/>`
        : `<ellipse cx="${cx - 15}" cy="185" rx="3.6" ry="4.6" fill="#5A2E1E"/><ellipse cx="${cx + 15}" cy="185" rx="3.6" ry="4.6" fill="#5A2E1E"/>` +
          `<circle cx="${cx - 14}" cy="183.5" r="1.3" fill="#fff"/><circle cx="${cx + 16}" cy="183.5" r="1.3" fill="#fff"/>`) +
      `<path d="M ${cx - 7} 194 q 7 7 14 0" stroke="#5A2E1E" stroke-width="2.5" fill="none" stroke-linecap="round"/>`
    : `<ellipse cx="${cx - 15}" cy="186" rx="3.4" ry="4.2" fill="#5A2E1E"/><ellipse cx="${cx + 15}" cy="186" rx="3.4" ry="4.2" fill="#5A2E1E"/>` +
      `<path d="M ${cx - 23} 179 l 11 -4 M ${cx + 23} 179 l -11 -4" stroke="#5A2E1E" stroke-width="2.2" stroke-linecap="round"/>` +
      `<ellipse cx="${cx}" cy="198" rx="4" ry="3.2" fill="#5A2E1E"/>` +
      `<path d="M ${cx + 40} ${172 + wilt * 6} q 5 8 0 11 q -5 -3 0 -11 Z" fill="#9FD3F5" opacity="${wilt}"/>`;
  const pot =
    `<ellipse cx="${cx}" cy="214" rx="66" ry="8" fill="#5C5FE0" opacity=".55"/>` +
    `<path d="M ${cx - 52} 164 L ${cx - 40} 212 Q ${cx} 218 ${cx + 40} 212 L ${cx + 52} 164 Z" fill="url(#potBody)"/>` +
    `<rect x="${cx - 60}" y="150" width="120" height="18" rx="8" fill="#F07A5F"/>` +
    `<ellipse cx="${cx}" cy="152" rx="54" ry="6" fill="#7A4A35"/>` +
    face +
    `<circle cx="${cx - 26}" cy="194" r="6" fill="#FF9DB0" opacity=".7"/><circle cx="${cx + 26}" cy="194" r="6" fill="#FF9DB0" opacity=".7"/>`;

  const cup = stem + leaves + fruits + flower + pot + coin + sparkle;

  // ---- טקסט ----
  const right = 566;
  const l1 = enter(t, 0.02, 0.22);
  const l2 = enter(t, 0.12, 0.34);
  const l3 = enter(t, 0.24, 0.46);
  const l4 = enter(t, 0.4, 0.62);

  let title: string;
  let amount: number;
  let sub: string;
  const count = easeOut(t / 0.62);
  if (!d.hasBudget) {
    title = 'הוצאת החודש';
    amount = d.spent * count;
    sub = `עד ${d.dateLabel}`;
  } else if (d.over) {
    title = 'חרגת מהתקציב ב-';
    amount = Math.abs(d.left) * count;
    sub = `${Math.round(d.usedPct * count)}% מתוך ${shekel0(d.budget)}`;
  } else {
    title = 'נשארו לך החודש';
    amount = d.budget - (d.budget - d.left) * count; // סופר לאחור מהתקציב אל מה שנשאר
    sub = d.daysLeft > 0 ? `כ-${shekel0(d.perDayLeft)} ליום · עוד ${d.daysLeft} ימים` : `${d.usedPct}% מתוך ${shekel0(d.budget)}`;
  }
  const amountText = shekel0(amount);
  const finalText = shekel0(!d.hasBudget ? d.spent : d.over ? Math.abs(d.left) : d.left);
  // רוחב משוער של הסכום בגופן Assistant 800, גודל 46
  const digits = finalText.replace(/[^\d]/g, '').length;
  const commas = (finalText.match(/,/g) ?? []).length;
  const boxW = 48 + digits * 25 + commas * 11 + 30;
  const boxColor = d.over ? WARM.coral : '#ffffff';
  const amountColor = d.over ? '#ffffff' : WARM.periwinkle;

  const text =
    `<g opacity="${l1.opacity}" transform="translate(0 ${l1.dy})"><text x="${right}" y="50" direction="ltr" text-anchor="end" font-family="${TEXT_FONT}" font-weight="700" font-size="19" fill="#ffffff" opacity=".88">Daily Keep · ${esc(d.dateLabel)}</text></g>` +
    `<g opacity="${l2.opacity}" transform="translate(0 ${l2.dy})"><text x="${right}" y="102" direction="rtl" text-anchor="start" font-family="${DISPLAY_FONT}" font-size="40" fill="#ffffff">${esc(title)}</text></g>` +
    `<g opacity="${l3.opacity}" transform="translate(0 ${l3.dy})"><rect x="${right - boxW}" y="116" width="${boxW}" height="60" rx="10" fill="${boxColor}"/>` +
    `<text x="${right - 20}" y="162" direction="rtl" text-anchor="start" font-family="${TEXT_FONT}" font-weight="800" font-size="46" fill="${amountColor}">${esc(amountText)}</text></g>` +
    `<g opacity="${l4.opacity}" transform="translate(0 ${l4.dy})"><text x="${right}" y="210" direction="rtl" text-anchor="start" font-family="${TEXT_FONT}" font-weight="700" font-size="20" fill="#ffffff">${esc(sub)}</text></g>`;

  // אחוז ליד העציץ
  const badgeK = d.hasBudget ? easeOut((t - 0.5) / 0.15) : 0;
  const badge = badgeK
    ? `<g opacity="${badgeK}"><rect x="${cx + 66}" y="112" width="62" height="30" rx="15" fill="${d.over ? WARM.coral : WARM.highlight}"/>` +
      `<text x="${cx + 97}" y="133" text-anchor="middle" font-family="${TEXT_FONT}" font-weight="800" font-size="18" fill="${d.over ? '#ffffff' : WARM.brown}">${Math.round(d.usedPct * count)}%</text></g>`
    : '';

  // קישוטים: עיגולים רכים ונקודות צבעוניות
  const deco =
    `<circle cx="40" cy="-10" r="90" fill="${WARM.periwinkleLight}"/>` +
    `<circle cx="590" cy="250" r="70" fill="${WARM.periwinkleLight}"/>` +
    `<circle cx="300" cy="34" r="5" fill="${WARM.yellow}"/>` +
    `<circle cx="262" cy="214" r="6" fill="${WARM.coral}"/>` +
    `<circle cx="36" cy="200" r="5" fill="${WARM.pink}"/>` +
    `<circle cx="248" cy="78" r="3.5" fill="#ffffff" opacity=".7"/>`;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<defs>` +
    `<linearGradient id="potBody" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#D94A33"/><stop offset=".4" stop-color="${WARM.coral}"/><stop offset="1" stop-color="#C9412C"/></linearGradient>` +
    `</defs>` +
    `<rect width="${W}" height="${H}" fill="${WARM.periwinkle}"/>` +
    deco +
    cup +
    badge +
    text +
    `</svg>`
  );
}

/** כל הפריימים של הבאנר, עם משך התצוגה של כל אחד (במילישניות) */
export function bannerFrames(d: BannerData, count = 30): { svg: string; delay: number }[] {
  const frames: { svg: string; delay: number }[] = [];
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    frames.push({ svg: bannerFrameSvg(d, t), delay: i === count - 1 ? 4000 : 70 });
  }
  return frames;
}

/** גל בתחתית המייל עם נקודות צבעוניות, כמו בעיצוב המקורי */
export function waveFooterSvg(width = 600, height = 60): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<rect width="${width}" height="${height}" fill="${WARM.cream}"/>` +
    `<path d="M0 30 C 60 14, 120 44, 180 30 S 300 14, 360 30 S 480 44, 540 30 S 600 20, 600 24 L600 ${height} L0 ${height} Z" fill="#F3E6D3"/>` +
    `<circle cx="120" cy="18" r="6" fill="${WARM.pink}"/>` +
    `<circle cx="300" cy="44" r="4" fill="${WARM.coral}"/>` +
    `<circle cx="470" cy="16" r="5" fill="${WARM.yellow}"/>` +
    `<circle cx="540" cy="46" r="3.5" fill="${WARM.periwinkle}"/>` +
    `</svg>`
  );
}
