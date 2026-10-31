import moment from 'moment';
import { type EnrichedTransaction } from '../commonTypes';
import { DISPLAY_FONT, fontFaceCss, TEXT_FONT } from './fonts';
import { LOGO_HEIGHT, LOGO_PNG_BASE64, LOGO_WIDTH } from './logoData';
import { BANNER_H, BANNER_W, type BannerData, bannerFrames, WARM, waveFooterSvg } from './banner';
import { donutSvg, monthBarsSvg, toSlices } from './charts';
import { type MonthPeriodSettings, periodFor, previousPeriod } from './period';
import { CARD_COMPANIES, collectStandingOrders, type FixedCharge, type StandingOrderItem } from './standingOrders';

/** הגדרות המייל היומי כפי שהמשתמש קבע אותן */
export interface DailySummarySettings {
  monthlyBudget: number;
  /** כינוי לכל כרטיס, לפי מספר החשבון/4 ספרות */
  cardNames: Record<string, string>;
  /** שורת קרדיט בתחתית המייל */
  footerCredit?: string;
  /** הוראות קבע שהמשתמש הוסיף ידנית */
  fixedCharges?: FixedCharge[];
  /** ממתי עד מתי נחשב החודש (לועזי/עברי, יום התחלה) */
  monthPeriod?: MonthPeriodSettings;
}

export interface CardTotal {
  cardKey: string;
  label: string;
  total: number;
  count: number;
}

export interface SummaryTransaction {
  date: string; // YYYY-MM-DD
  amount: number; // שלילי = הוצאה, חיובי = זיכוי
  description: string;
  memo: string;
  category: string;
  cardLabel: string;
  pending: boolean;
  installments: boolean;
}

export interface DailySummary {
  yesterdayKey: string;
  yesterdayLabel: string;
  monthLabel: string;
  /** תאריכי החודש של התקציב, להצגה */
  periodFrom: string;
  periodTo: string;
  /** כל העסקאות של החודש עד אתמול, מהחדשה לישנה */
  monthRows: SummaryTransaction[];
  yesterday: SummaryTransaction[];
  yesterdayTotal: number;
  monthTotal: number;
  monthCount: number;
  monthRefunds: number;
  budget: number;
  budgetUsedPct: number;
  budgetLeft: number;
  daysLeftInMonth: number;
  perDayLeft: number;
  byCard: CardTotal[];
  byCategory: [string, number][];
  topMerchants: [string, number][];
  lastTransactionKey: string;
  standingOrders: StandingOrderItem[];
  /** סך הוצאות האשראי לכל חודש, עד 6 חודשים אחורה, כולל החודש הנוכחי */
  monthlyTotals: { key: string; label: string; total: number }[];
  standingChargedTotal: number;
  standingUpcomingTotal: number;
}

const COMPANY_NAMES: Record<string, string> = {
  max: 'מקס',
  isracard: 'ישראכרט',
  amex: 'אמריקן אקספרס',
  visaCal: 'כאל',
  leumi: 'לאומי',
  hapoalim: 'הפועלים',
  discount: 'דיסקונט',
  mizrahi: 'מזרחי טפחות',
  otsarHahayal: 'אוצר החייל',
  beinleumi: 'הבינלאומי',
  massad: 'מסד',
  yahav: 'יהב',
  mercantile: 'מרכנתיל',
  union: 'איגוד',
  beyahadBishvilha: 'ביחד בשבילך',
  behatsdaa: 'בהצדעה',
  oneZero: 'וואן זירו',
  pagi: 'פאג"י',
};

/** מוציא את שם החברה מתוך ה-hash, שבנוי כ: ..._companyId_accountNumber */
export function companyFromHash(hash: string, accountNumber: string): string {
  const suffix = `_${accountNumber}`;
  const withoutAccount = hash.endsWith(suffix) ? hash.slice(0, -suffix.length) : hash;
  const idx = withoutAccount.lastIndexOf('_');
  return idx >= 0 ? withoutAccount.slice(idx + 1) : '';
}

export function cardKeyOf(t: EnrichedTransaction): string {
  return String(t.accountNumber ?? '');
}

export function defaultCardLabel(t: EnrichedTransaction): string {
  const company = companyFromHash(t.hash ?? '', String(t.accountNumber ?? ''));
  const companyName = COMPANY_NAMES[company] ?? company;
  const last4 = String(t.accountNumber ?? '').slice(-4);
  return [companyName, last4].filter(Boolean).join(' ') || 'כרטיס';
}

/** הסכום שירד בפועל מהכרטיס (בתשלומים: התשלום החודשי) */
function amountOf(t: EnrichedTransaction): number {
  const charged = Number(t.chargedAmount);
  if (!Number.isNaN(charged) && charged !== 0) return charged;
  const original = Number(t.originalAmount);
  return Number.isNaN(original) ? 0 : original;
}

const dayKey = (d: moment.Moment) => d.format('YYYY-MM-DD');
const dayLabel = (key: string) => (key ? moment(key, 'YYYY-MM-DD').format('DD/MM/YYYY') : '-');


/**
 * מחשב את הסיכום היומי מכל העסקאות השמורות.
 * now = הרגע שבו נשלח המייל (בדרך כלל בבוקר). "אתמול" = היום הקודם לפי שעון המחשב.
 */
export function buildDailySummary(
  allTransactions: EnrichedTransaction[],
  settings: DailySummarySettings,
  now: Date = new Date(),
): DailySummary {
  const today = moment(now).startOf('day');
  const yesterday = today.clone().subtract(1, 'day');
  const yKey = dayKey(yesterday);
  // החודש שנבדק הוא החודש של "אתמול", כך שבבוקר ה-1 בחודש מקבלים סיכום של החודש שהסתיים
  const period = periodFor(yesterday, settings.monthPeriod);
  const monthStart = period.start;
  const monthEnd = period.end;

  const rows: SummaryTransaction[] = [];
  const cardTotals = new Map<string, CardTotal>();
  let lastKey = '';

  // עסקאות מחשבון בנק לא נספרות כהוצאות אשראי (הן כוללות גם את התשלום לחברת האשראי),
  // מהן מזהים רק הוראות קבע
  const isCard = (t: EnrichedTransaction) =>
    CARD_COMPANIES.has(companyFromHash(t.hash ?? '', String(t.accountNumber ?? '')));
  const bankTxs = allTransactions.filter((t) => !isCard(t));
  const cardTxs = allTransactions.filter(isCard);
  const standingOrders = collectStandingOrders(bankTxs, settings.fixedCharges ?? [], yesterday.clone());
  const standingSum = (status: StandingOrderItem['status']) =>
    round2(standingOrders.filter((o) => o.status === status).reduce((sum, o) => sum + o.amount, 0));

  for (const t of cardTxs) {
    const d = moment(t.date);
    if (!d.isValid()) continue;
    const key = dayKey(d);
    if (key > lastKey) lastKey = key;

    const cardKey = cardKeyOf(t);
    const label = settings.cardNames[cardKey]?.trim() || defaultCardLabel(t);
    const amount = amountOf(t);
    const status = String(t.status ?? '').toLowerCase();
    const type = String(t.type ?? '').toLowerCase();

    const row: SummaryTransaction = {
      date: key,
      amount,
      description: String(t.description ?? '').trim(),
      memo: String(t.memo ?? '').trim(),
      category: String(t.category ?? '').trim() || 'ללא קטגוריה',
      cardLabel: label,
      pending: status === 'pending',
      installments: type === 'installments',
    };

    if (!d.isBefore(monthStart) && !d.isAfter(yesterday.clone().endOf('day'))) {
      rows.push(row);
      if (amount < 0) {
        const c = cardTotals.get(cardKey) ?? { cardKey, label, total: 0, count: 0 };
        c.total += Math.abs(amount);
        c.count += 1;
        cardTotals.set(cardKey, c);
      }
    }
  }

  const expenses = rows.filter((r) => r.amount < 0);
  const sum = (list: SummaryTransaction[]) => list.reduce((s, r) => s + Math.abs(r.amount), 0);
  const group = (field: 'category' | 'description') => {
    const g = new Map<string, number>();
    for (const r of expenses) g.set(r[field], (g.get(r[field]) ?? 0) + Math.abs(r.amount));
    return [...g.entries()].sort((a, b) => b[1] - a[1]);
  };

  const yesterdayRows = rows.filter((r) => r.date === yKey);
  const monthTotal = round2(sum(expenses));
  const budget = Math.max(0, Number(settings.monthlyBudget) || 0);
  const budgetLeft = round2(budget - monthTotal);
  // ימים שנותרו בחודש כולל היום
  const daysLeft = Math.max(0, monthEnd.clone().startOf('day').diff(today, 'days') + 1);

  return {
    yesterdayKey: yKey,
    yesterdayLabel: dayLabel(yKey),
    monthLabel: period.label,
    periodFrom: monthStart.format('DD/MM'),
    periodTo: monthEnd.format('DD/MM'),
    monthRows: [...rows].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    yesterday: yesterdayRows,
    yesterdayTotal: round2(sum(yesterdayRows.filter((r) => r.amount < 0))),
    monthTotal,
    monthCount: expenses.length,
    monthRefunds: round2(rows.filter((r) => r.amount > 0).reduce((s, r) => s + r.amount, 0)),
    budget,
    budgetUsedPct: budget > 0 ? Math.round((monthTotal / budget) * 100) : 0,
    budgetLeft,
    daysLeftInMonth: daysLeft,
    perDayLeft: daysLeft > 0 && budgetLeft > 0 ? round2(budgetLeft / daysLeft) : 0,
    byCard: [...cardTotals.values()].map((c) => ({ ...c, total: round2(c.total) })).sort((a, b) => b.total - a.total),
    byCategory: group('category'),
    topMerchants: group('description').slice(0, 5),
    lastTransactionKey: lastKey,
    monthlyTotals: monthlyTotals(cardTxs, yesterday, settings.monthPeriod),
    standingOrders,
    standingChargedTotal: standingSum('charged'),
    standingUpcomingTotal: standingSum('upcoming'),
  };
}

function monthlyTotals(cardTxs: EnrichedTransaction[], ref: moment.Moment, periodSettings?: MonthPeriodSettings) {
  const current = periodFor(ref, periodSettings);
  const periods = [current];
  for (let i = 0; i < 5; i++) periods.unshift(previousPeriod(periods[0], periodSettings));
  const totals = new Map<string, number>();
  const refEnd = ref.clone().endOf('day');
  for (const t of cardTxs) {
    const d = moment(t.date);
    const amount = amountOf(t);
    if (!d.isValid() || amount >= 0 || d.isAfter(refEnd) || d.isBefore(periods[0].start)) continue;
    const p = periods.find((x) => !d.isBefore(x.start) && !d.isAfter(x.end));
    if (p) totals.set(p.key, (totals.get(p.key) ?? 0) + Math.abs(amount));
  }
  // חודש שההיסטוריה מתחילה באמצעו לא מוצג, כי הסכום שלו חלקי ומטעה
  const earliest = cardTxs.reduce<moment.Moment | null>((m, t) => {
    const d = moment(t.date);
    return d.isValid() && (!m || d.isBefore(m)) ? d : m;
  }, null);
  const months: { key: string; label: string; total: number }[] = [];
  periods.forEach((p, idx) => {
    const isCurrent = idx === periods.length - 1;
    if (!months.length && !totals.has(p.key) && !isCurrent) return; // לא מתחילים בחודשים בלי נתונים
    if (!isCurrent && earliest && earliest.isAfter(p.start.clone().add(4, 'days'))) return;
    months.push({ key: p.key, label: p.shortLabel, total: round2(totals.get(p.key) ?? 0) });
  });
  return months;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function formatShekel(n: number): string {
  const abs = Math.abs(n).toFixed(2);
  const [int, dec] = abs.split('.');
  return '₪' + int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + dec;
}

function esc(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface EmailImage {
  cid: string;
  svg: string;
  width: number;
  height: number;
}

/**
 * בונה נושא, HTML ותמונות למייל, בעיצוב חם בהשראת "יקיר לי":
 * באנר מונפש בראש, רקע שמנת, כותרות חומות, מדבקות צהובות ושורות עם עיגולים ממוספרים.
 * הגרפים והבאנר מצורפים כתמונות (cid:...), כי תוכנות מייל לא מציגות גרפים שמצוירים ב-HTML.
 */
export function renderDailySummaryEmail(s: DailySummary, settings: DailySummarySettings) {
  const hasBudget = s.budget > 0;
  const over = hasBudget && s.budgetLeft < 0;
  const warn = hasBudget && !over && s.budgetUsedPct >= 80;

  let subject = `הסיכום היומי ${s.yesterdayLabel}: אתמול ${formatShekel(s.yesterdayTotal)}`;
  if (hasBudget) {
    if (over) subject = `⚠️ חריגה של ${formatShekel(-s.budgetLeft)} מהתקציב · ` + subject;
    else {
      if (warn) subject = `שים לב: ${s.budgetUsedPct}% מהתקציב · ` + subject;
      subject += ` · נשארו ${formatShekel(s.budgetLeft)}`;
    }
  }

  const C = WARM;
  const TEXT = '#4A3F3A';
  const SOFT = '#9A7B6A';
  const font = 'font-family:Arial,Helvetica,sans-serif;';
  const shadow = 'box-shadow:0 6px 18px rgba(123,75,54,.10);';
  const NUM_COLORS = [C.coral, C.pink, C.blue, C.yellow];

  const images: EmailImage[] = [];
  const animations: { cid: string; frames: { svg: string; delay: number }[]; width: number; height: number }[] = [];

  const block = (inner: string, pad = '0 0 18px') => `<tr><td style="padding:${pad};">${inner}</td></tr>`;
  const whiteCard = (inner: string, extra = '') =>
    `<table role="presentation" width="100%" style="border-collapse:separate;background:#ffffff;border-radius:24px;${shadow}${extra}"><tr><td style="padding:20px 22px;">${inner}</td></tr></table>`;
  // כותרת חומה גדולה + מדבקה צהובה מתחתיה
  const heading = (text: string, label?: string) =>
    `<div style="font-size:24px;font-weight:bold;color:${C.brown};margin:6px 0 ${label ? 6 : 12}px;">` +
    `${text}</div>` +
    (label
      ? `<div style="margin:0 0 12px;"><span style="display:inline-block;background:${C.highlight};color:${C.brown};font-size:14px;font-weight:bold;border-radius:6px;padding:3px 12px;">${label}</span></div>`
      : '');
  const numCircle = (n: number) =>
    `<span style="display:inline-block;width:26px;height:26px;line-height:26px;border-radius:13px;background:${NUM_COLORS[(n - 1) % NUM_COLORS.length]};color:#ffffff;font-size:13px;font-weight:bold;text-align:center;">${n}</span>`;
  // שורה בצורת "גלולה" לבנה עם עיגול ממוספר
  const pill = (n: number, main: string, sub: string, amount: string, amountColor: string = C.brown) =>
    `<table role="presentation" width="100%" style="border-collapse:separate;background:#ffffff;border-radius:30px;${shadow}margin:0 0 10px;"><tr>` +
    `<td width="40" style="padding:10px 12px 10px 0;vertical-align:middle;">${numCircle(n)}</td>` +
    `<td style="padding:10px 4px;vertical-align:middle;font-size:15px;color:${TEXT};"><b>${main}</b>${sub ? `<div style="font-size:12px;color:${SOFT};margin-top:1px;">${sub}</div>` : ''}</td>` +
    `<td style="padding:10px 0 10px 18px;vertical-align:middle;text-align:left;white-space:nowrap;font-size:15px;font-weight:bold;color:${amountColor};">${amount}</td>` +
    `</tr></table>`;
  const chip = (label: string, value: string, bg = '#ffffff', color: string = C.brown) =>
    `<td style="padding:0 5px;vertical-align:top;"><div style="background:${bg};border-radius:20px;${shadow}padding:14px 10px;text-align:center;">` +
    `<div style="font-size:13px;color:${SOFT};">${label}</div>` +
    `<div style="font-size:21px;font-weight:bold;color:${color};margin-top:2px;white-space:nowrap;">${value}</div></div></td>`;

  // ---- באנר מונפש ----
  const bannerData: BannerData = {
    dateLabel: s.yesterdayLabel.slice(0, 5),
    hasBudget,
    over,
    budget: s.budget,
    spent: s.monthTotal,
    left: s.budgetLeft,
    usedPct: s.budgetUsedPct,
    perDayLeft: s.perDayLeft,
    daysLeft: s.daysLeftInMonth,
  };
  animations.push({ cid: 'banner', frames: bannerFrames(bannerData), width: BANNER_W, height: BANNER_H });
  const bannerAlt = !hasBudget
    ? `הוצאת ${formatShekel(s.monthTotal)} החודש`
    : over
      ? `חרגת מהתקציב ב-${formatShekel(-s.budgetLeft)}`
      : `נשארו לך ${formatShekel(s.budgetLeft)} החודש`;
  // הלוגו של Daily Keep בראש המייל
  const logo = block(
    `<div style="text-align:center;"><img src="cid:logo" width="260" height="${Math.round((260 * LOGO_HEIGHT) / LOGO_WIDTH)}" alt="Daily Keep - חוסכים כל יום מחדש" style="display:inline-block;width:260px;max-width:70%;height:auto;"></div>`,
    '0 0 10px',
  );
  const banner = block(
    `<img src="cid:banner" width="600" alt="${esc(bannerAlt)}" style="display:block;width:100%;max-width:600px;height:auto;border-radius:24px;background:${C.periwinkle};color:#ffffff;font-size:22px;font-weight:bold;">`,
  );

  // ---- תקציב / הוצאת / יתרה ----
  const budgetRow = hasBudget
    ? block(
        `<table role="presentation" width="100%" style="border-collapse:collapse;"><tr>` +
          chip('התקציב', formatShekel(s.budget)) +
          chip('הוצאת', formatShekel(s.monthTotal)) +
          (over
            ? chip('חריגה', formatShekel(-s.budgetLeft), '#FDE3DD', C.coral)
            : chip('יתרה', formatShekel(s.budgetLeft), C.highlight)) +
          `</tr></table>`,
        '0 0 12px',
      )
    : '';
  const statsRow = block(
    `<table role="presentation" width="100%" style="border-collapse:collapse;"><tr>` +
      chip('אתמול', formatShekel(s.yesterdayTotal) + `<div style="font-size:12px;color:${SOFT};font-weight:normal;">${s.yesterday.filter((r) => r.amount < 0).length} עסקאות</div>`) +
      chip(
        `מתחילת החודש (${s.periodFrom})`,
        formatShekel(s.monthTotal) + `<div style="font-size:12px;color:${SOFT};font-weight:normal;">${s.monthCount} עסקאות</div>`,
      ) +
      `</tr></table>` +
      (s.monthRows.length
        ? `<div style="text-align:center;margin-top:16px;"><span style="display:inline-block;background:${C.highlight};color:${C.brown};border-radius:8px;padding:6px 16px;font-size:14px;font-weight:bold;">📎 פירוט כל הוצאות החודש מצורף כקובץ בתחתית המייל</span></div>`
        : ''),
  );

  // ---- אתמול ----
  const yExpenses = s.yesterday;
  const yesterdayBlock = block(
    heading(
      'מה היה אתמול?',
      yExpenses.length ? `${yExpenses.filter((r) => r.amount < 0).length} עסקאות · ${formatShekel(s.yesterdayTotal)}` : 'יום בלי עסקאות',
    ) +
      (yExpenses.length
        ? yExpenses
            .map((r, i) =>
              pill(
                i + 1,
                esc(r.description) +
                  (r.installments ? ` <span style="color:${SOFT};font-size:12px;font-weight:normal;">· תשלום</span>` : '') +
                  (r.pending ? ` <span style="color:#C27700;font-size:12px;font-weight:normal;">· ממתינה</span>` : ''),
                esc(r.cardLabel) + (r.category ? ' · ' + esc(r.category) : ''),
                (r.amount > 0 ? '+' : '') + formatShekel(r.amount),
                r.amount > 0 ? '#3D8B5A' : C.brown,
              ),
            )
            .join('')
        : whiteCard(`<div style="font-size:15px;color:${SOFT};text-align:center;">לא היו עסקאות אתמול. יום רגוע ☕</div>`)),
  );

  // ---- פילוח לפי קטגוריות ----
  let breakdown = '';
  if (s.byCategory.length) {
    const slices = toSlices(s.byCategory);
    images.push({ cid: 'donut', svg: donutSvg(slices, s.monthTotal, 220), width: 220, height: 220 });
    const legend = slices
      .map(
        (sl) =>
          `<tr><td style="padding:5px 0;font-size:14px;color:${TEXT};"><span style="display:inline-block;width:10px;height:10px;border-radius:5px;background:${sl.color};margin-left:8px;"></span>${esc(sl.label)}</td>` +
          `<td style="padding:5px 0;font-size:14px;font-weight:bold;color:${C.brown};text-align:left;white-space:nowrap;">${formatShekel(sl.value)}</td></tr>`,
      )
      .join('');
    breakdown = block(
      heading('לאן הלך הכסף החודש?') +
        whiteCard(
          `<table role="presentation" width="100%" style="border-collapse:collapse;"><tr>` +
            `<td width="190" style="vertical-align:middle;text-align:center;"><img src="cid:donut" width="180" height="180" alt="פילוח לפי קטגוריות" style="display:block;margin:auto;"></td>` +
            `<td style="vertical-align:middle;padding-right:12px;"><table role="presentation" width="100%" style="border-collapse:collapse;">${legend}</table></td>` +
            `</tr></table>`,
        ),
    );
  }

  // ---- לפי כרטיס: כרטיסיות לבנות, שתיים בשורה ----
  let cards = '';
  if (s.byCard.length > 1) {
    const cells = s.byCard.map(
      (c, i) =>
        `<td width="50%" style="padding:0 5px 10px;vertical-align:top;"><div style="background:#ffffff;border-radius:22px;${shadow}padding:16px 18px;">` +
        `<div style="font-size:16px;font-weight:bold;color:${C.brown};">${esc(c.label)}</div>` +
        `<div style="font-size:22px;font-weight:bold;color:${NUM_COLORS[i % NUM_COLORS.length] === C.yellow ? C.brown : NUM_COLORS[i % NUM_COLORS.length]};margin-top:4px;">${formatShekel(c.total)}</div>` +
        `<div style="font-size:13px;color:${SOFT};">${c.count} עסקאות</div></div></td>`,
    );
    let rows = '';
    for (let i = 0; i < cells.length; i += 2) rows += `<tr>${cells[i]}${cells[i + 1] ?? '<td width="50%"></td>'}</tr>`;
    cards = block(heading('לפי כרטיס') + `<table role="presentation" width="100%" style="border-collapse:collapse;">${rows}</table>`);
  }

  // ---- החודשים האחרונים ----
  let months = '';
  if (s.monthlyTotals.length >= 2) {
    const bars = s.monthlyTotals.map((m, i, arr) => ({ label: m.label, total: m.total, current: i === arr.length - 1 }));
    images.push({ cid: 'bars', svg: monthBarsSvg(bars, 520, 200), width: 520, height: 200 });
    months = block(
      heading('החודשים האחרונים') +
        whiteCard(`<img src="cid:bars" width="100%" alt="הוצאות לפי חודש" style="display:block;max-width:520px;height:auto;margin:auto;">`),
    );
  }

  // ---- הוראות קבע ----
  const shortDate = (key: string) => moment(key, 'YYYY-MM-DD').format('DD/MM');
  const standing = s.standingOrders.length
    ? block(
        heading(
          'הוראות קבע החודש',
          `ירדו ${formatShekel(s.standingChargedTotal)}` + (s.standingUpcomingTotal > 0 ? ` · עוד צפויים ${formatShekel(s.standingUpcomingTotal)}` : ''),
        ) +
          s.standingOrders
            .map((o, i) =>
              pill(
                i + 1,
                esc(o.name),
                o.status === 'charged'
                  ? `<span style="background:#E3ECF6;color:${C.blue};border-radius:8px;padding:1px 8px;">ירד ${shortDate(o.date)}</span>`
                  : `<span style="background:#FFF1C9;color:#9A6B00;border-radius:8px;padding:1px 8px;">צפוי ${shortDate(o.date)}</span>`,
                formatShekel(o.amount),
              ),
            )
            .join(''),
      )
    : '';

  // ---- תחתית: גל עם נקודות ----
  images.push({ cid: 'wave', svg: waveFooterSvg(600, 60), width: 600, height: 60 });
  const footer =
    `<tr><td style="padding:4px 0 0;"><img src="cid:wave" width="600" alt="" style="display:block;width:100%;max-width:600px;height:auto;"></td></tr>` +
    `<tr><td style="padding:4px 10px 6px;text-align:center;font-size:12px;color:${SOFT};background:#F3E6D3;border-radius:0 0 24px 24px;">` +
    `העסקה האחרונה שנמשכה: ${dayLabel(s.lastTransactionKey)}. הנתונים מתעדכנים כשהמחשב דולק.` +
    (settings.footerCredit ? `<br><span style="color:${C.brown};font-weight:bold;">${esc(settings.footerCredit)}</span>` : '') +
    `</td></tr>`;

  const html =
    `<div dir="rtl" style="background:${C.cream};padding:18px 10px;${font}">` +
    `<table role="presentation" width="100%" style="max-width:600px;margin:auto;border-collapse:collapse;${font}color:${TEXT};line-height:1.45;" dir="rtl">` +
    logo +
    banner +
    budgetRow +
    statsRow +
    yesterdayBlock +
    breakdown +
    cards +
    months +
    standing +
    footer +
    `</table></div>`;

  // תמונות מוכנות (לא SVG) שמצרפים כמו שהן
  const staticImages = [{ cid: 'logo', png: Buffer.from(LOGO_PNG_BASE64, 'base64') }];
  return { subject, html, images, animations, staticImages };
}

/** שם הקובץ המצורף עם פירוט החודש */
export function monthDetailsFileName(s: DailySummary) {
  return `פירוט הוצאות ${s.periodFrom.replace('/', '.')}-${s.periodTo.replace('/', '.')}.pdf`;
}

/**
 * דף מלא עם כל עסקאות החודש לפי ימים. נשלח כקובץ PDF מצורף,
 * כך שהמייל עצמו נשאר קצר והפירוט נפתח רק למי שלוחץ עליו.
 */
export function renderMonthDetailsPage(s: DailySummary, settings: DailySummarySettings): string {
  const INK = '#1B1F3B';
  const SOFT = '#5B6280';
  const byDay = new Map<string, SummaryTransaction[]>();
  for (const r of s.monthRows) byDay.set(r.date, [...(byDay.get(r.date) ?? []), r]);
  const dayName = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  let body = '';
  for (const [date, list] of byDay) {
    const m = moment(date, 'YYYY-MM-DD');
    const dayTotal = list.filter((r) => r.amount < 0).reduce((sum, r) => sum + Math.abs(r.amount), 0);
    body += `<tr class="day"><td colspan="3">יום ${dayName[m.day()]} ${m.format('DD/MM/YYYY')}</td><td class="num">${formatShekel(dayTotal)}</td></tr>`;
    for (const r of list) {
      body +=
        `<tr><td>${esc(r.description)}${r.installments ? ' <span class="soft">· תשלום</span>' : ''}${r.pending ? ' <span class="warn">· ממתינה</span>' : ''}</td>` +
        `<td class="soft">${esc(r.category)}</td><td class="soft">${esc(r.cardLabel)}</td>` +
        `<td class="num${r.amount > 0 ? ' plus' : ''}">${r.amount > 0 ? '+' : ''}${formatShekel(r.amount)}</td></tr>`;
    }
  }
  const hasBudget = s.budget > 0;
  const balance = !hasBudget
    ? ''
    : s.budgetLeft < 0
      ? `<span class="over">חריגה של ${formatShekel(-s.budgetLeft)}</span>`
      : `<span class="left">נשארו ${formatShekel(s.budgetLeft)}</span>`;
  return (
    `<!doctype html><html dir="rtl" lang="he"><head><meta charset="utf-8"><style>${fontFaceCss()}` +
    `@page{size:A4;margin:14mm 12mm}body{font-family:${TEXT_FONT};font-weight:700;color:#4A3F3A;margin:0;font-size:12.5px;background:#fff}` +
    `h1{font-family:${DISPLAY_FONT};font-weight:400;font-size:30px;margin:0 0 6px;color:${WARM.brown}}` +
    `.sub{display:inline-block;background:${WARM.highlight};color:${WARM.brown};border-radius:6px;padding:2px 12px;font-size:13px;margin-bottom:16px}` +
    `.sum{display:flex;gap:10px;margin-bottom:18px}.box{flex:1;background:${WARM.cream};border-radius:16px;padding:10px 14px;box-shadow:0 4px 12px rgba(123,75,54,.10);color:#9A7B6A}` +
    `.box b{display:block;font-size:18px;margin-top:2px;color:${WARM.brown};font-weight:800}.over{color:${WARM.coral}!important}.left{color:${WARM.brown}}` +
    `table{width:100%;border-collapse:separate;border-spacing:0}td{padding:6px 6px;border-bottom:1px solid #EFE4D6;vertical-align:top}` +
    `tr.day td{background:${WARM.cream};color:${WARM.brown};font-family:${DISPLAY_FONT};font-weight:400;font-size:15px;border-bottom:none;padding-top:14px}` +
    `.num{text-align:left;white-space:nowrap;font-weight:800;color:${WARM.brown}}tr.day td.num{font-family:${TEXT_FONT};font-weight:800;font-size:14px}.plus{color:#3D8B5A}.soft{color:#9A7B6A;font-size:11.5px}.warn{color:#C27700;font-size:11.5px}` +
    `tr{page-break-inside:avoid}.foot{margin-top:16px;color:#9A7B6A;font-size:11px}` +
    `</style></head><body>` +
    `<img src="data:image/png;base64,${LOGO_PNG_BASE64}" alt="Daily Keep" style="height:52px;display:block;margin:0 0 10px auto;">` +
    `<h1>פירוט הוצאות החודש</h1>` +
    `<div class="sub">${esc(s.monthLabel)} · ${s.periodFrom}–${s.periodTo} · נכון ל-${s.yesterdayLabel}</div>` +
    `<div class="sum">` +
    `<div class="box">הוצאות<b>${formatShekel(s.monthTotal)}</b></div>` +
    `<div class="box">עסקאות<b>${s.monthCount}</b></div>` +
    (hasBudget ? `<div class="box">תקציב<b>${formatShekel(s.budget)}</b></div><div class="box">מצב<b>${balance}</b></div>` : '') +
    `</div>` +
    `<table>${body}</table>` +
    (settings.footerCredit ? `<div class="foot">${esc(settings.footerCredit)}</div>` : '') +
    `</body></html>`
  );
}
