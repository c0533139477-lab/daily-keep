import moment from 'moment';
import { type EnrichedTransaction } from '../commonTypes';

/** הוראת קבע שהמשתמש הוסיף ידנית */
export interface FixedCharge {
  id: string;
  name: string;
  amount: number; // סכום חיובי
  dayOfMonth: number; // 1-31
}

export interface StandingOrderItem {
  name: string;
  amount: number; // חיובי
  date: string; // YYYY-MM-DD, בפועל או צפוי
  status: 'charged' | 'upcoming';
  source: 'bank' | 'manual';
}

/** חברות כרטיסי אשראי. כל השאר נחשבים חשבונות בנק */
export const CARD_COMPANIES = new Set(['max', 'isracard', 'amex', 'visaCal', 'beyahadBishvilha', 'behatsdaa']);

/** חיובים בבנק שהם לא הוראת קבע: תשלום לחברת האשראי (כבר נספר בכרטיסים), מזומן, העברות */
const NOT_STANDING_ORDER =
  /מקס|max|ישראכרט|isracard|כאל|cal\b|ויזה|visa|אמריקן|amex|לאומי ?קארד|כרטיס|דיינרס|משיכ|כספומט|מזומן|העברה|העב'|ביט\b|bit\b|פייבוקס|paybox|צ'ק|שיק|עמל/i;
const STANDING_ORDER_WORDS = /הוראת ?קבע|הו["״']?ק|הרשא|חיוב קבוע/;

const normalize = (s: string) =>
  String(s ?? '')
    .replace(/\d{3,}/g, '') // מספרי אסמכתא משתנים
    .replace(/\s+/g, ' ')
    .trim();

/**
 * מזהה הוראות קבע מתוך עסקאות בנק:
 * חיוב שמכיל מילה כמו "הוראת קבע", או חיוב עם אותו תיאור שחוזר בשני חודשים שונים לפחות.
 * מחזיר את מה שכבר ירד החודש, ואת מה שירד בחודש שעבר ועוד לא ירד החודש (צפוי).
 */
export function detectBankStandingOrders(bankTxs: EnrichedTransaction[], today: moment.Moment): StandingOrderItem[] {
  const monthStart = today.clone().startOf('month');
  const debits = bankTxs
    .map((t) => ({ t, d: moment(t.date), amount: Number(t.chargedAmount) || Number(t.originalAmount) || 0 }))
    .filter(({ d, amount, t }) => d.isValid() && amount < 0 && !NOT_STANDING_ORDER.test(String(t.description ?? '')));

  const months = new Map<string, Set<string>>();
  for (const { t, d } of debits) {
    const key = normalize(t.description);
    if (!months.has(key)) months.set(key, new Set());
    months.get(key)!.add(d.format('YYYY-MM'));
  }
  const isStanding = (t: EnrichedTransaction) =>
    STANDING_ORDER_WORDS.test(`${t.description ?? ''} ${t.memo ?? ''}`) || (months.get(normalize(t.description))?.size ?? 0) >= 2;

  const items: StandingOrderItem[] = [];
  const chargedThisMonth = new Set<string>();
  for (const { t, d, amount } of debits) {
    if (!isStanding(t) || d.isBefore(monthStart) || d.isAfter(today.clone().endOf('day'))) continue;
    chargedThisMonth.add(normalize(t.description));
    items.push({
      name: normalize(t.description) || String(t.description ?? '').trim(),
      amount: Math.abs(amount),
      date: d.format('YYYY-MM-DD'),
      status: 'charged',
      source: 'bank',
    });
  }

  // צפויות: ירדו בחודש שעבר ועוד לא ירדו החודש
  const lastMonth = monthStart.clone().subtract(1, 'month');
  const seenUpcoming = new Set<string>();
  for (const { t, d, amount } of debits) {
    const key = normalize(t.description);
    if (!isStanding(t) || d.format('YYYY-MM') !== lastMonth.format('YYYY-MM')) continue;
    if (chargedThisMonth.has(key) || seenUpcoming.has(key)) continue;
    const expected = monthStart.clone().date(Math.min(d.date(), monthStart.daysInMonth()));
    if (expected.isBefore(today, 'day')) continue; // היה אמור לרדת כבר; כנראה בוטל או נדחה
    seenUpcoming.add(key);
    items.push({
      name: normalize(t.description) || String(t.description ?? '').trim(),
      amount: Math.abs(amount),
      date: expected.format('YYYY-MM-DD'),
      status: 'upcoming',
      source: 'bank',
    });
  }
  return items;
}

/** הוראות קבע ידניות לחודש הנוכחי. אם יש חיוב בנק תואם (סכום קרוב ותאריך קרוב), משתמשים בו */
export function manualStandingOrders(
  charges: FixedCharge[],
  bankItems: StandingOrderItem[],
  today: moment.Moment,
): StandingOrderItem[] {
  const monthStart = today.clone().startOf('month');
  const result: StandingOrderItem[] = [];
  for (const c of charges) {
    const amount = Math.abs(Number(c.amount) || 0);
    if (!c.name?.trim() || !amount) continue;
    const day = Math.min(Math.max(1, Math.round(c.dayOfMonth || 1)), monthStart.daysInMonth());
    const due = monthStart.clone().date(day);
    const match = bankItems.find(
      (b) => Math.abs(b.amount - amount) <= Math.max(5, amount * 0.1) && Math.abs(moment(b.date).diff(due, 'days')) <= 4,
    );
    if (match) continue; // כבר מופיע מהבנק
    result.push({
      name: c.name.trim(),
      amount,
      date: due.format('YYYY-MM-DD'),
      status: due.isAfter(today, 'day') ? 'upcoming' : 'charged',
      source: 'manual',
    });
  }
  return result;
}

export function collectStandingOrders(
  bankTxs: EnrichedTransaction[],
  manual: FixedCharge[],
  today: moment.Moment,
): StandingOrderItem[] {
  const bank = detectBankStandingOrders(bankTxs, today);
  return [...bank, ...manualStandingOrders(manual, bank, today)].sort((a, b) => a.date.localeCompare(b.date));
}

export const isBankTransaction = (t: EnrichedTransaction, companyOf: (t: EnrichedTransaction) => string) =>
  !CARD_COMPANIES.has(companyOf(t));
