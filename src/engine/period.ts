import moment from 'moment';

/** איך המשתמש מגדיר את "החודש" של התקציב */
export interface MonthPeriodSettings {
  /** לפי הלוח הלועזי או העברי */
  calendar: 'gregorian' | 'hebrew';
  /** היום בחודש שבו החודש מתחיל (לועזי: 1-28, עברי: 1-29). 1 = מתחילת החודש */
  startDay: number;
}

export const DEFAULT_PERIOD: MonthPeriodSettings = { calendar: 'gregorian', startDay: 1 };

export interface BudgetPeriod {
  start: moment.Moment; // תחילת היום הראשון
  end: moment.Moment; // סוף היום האחרון
  /** שם החודש לכותרות, למשל "אוקטובר 2026" או "חשוון תשפ״ז" או "10/10–09/11" */
  label: string;
  /** תווית קצרה לגרף העמודות */
  shortLabel: string;
  /** מזהה ייחודי לתקופה */
  key: string;
}

const GREG_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

export function normalizePeriod(p?: Partial<MonthPeriodSettings> | null): MonthPeriodSettings {
  const calendar = p?.calendar === 'hebrew' ? 'hebrew' : 'gregorian';
  const max = calendar === 'hebrew' ? 29 : 28;
  const day = Math.round(Number(p?.startDay) || 1);
  return { calendar, startDay: Math.min(max, Math.max(1, day)) };
}

// ---------- לוח עברי (דרך Intl, שקיים ב-Node וב-Electron) ----------

const hebNumFmt = new Intl.DateTimeFormat('en-u-ca-hebrew', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'UTC' });
const hebMonthFmt = new Intl.DateTimeFormat('he-u-ca-hebrew', { month: 'long', timeZone: 'UTC' });

const utc = (m: moment.Moment) => new Date(Date.UTC(m.year(), m.month(), m.date(), 12));

/** היום בחודש העברי (1-30) */
export function hebrewDay(m: moment.Moment): number {
  const part = hebNumFmt.formatToParts(utc(m)).find((p) => p.type === 'day');
  return Number(part?.value ?? 1);
}

/** שנה עברית באותיות, למשל 5787 → תשפ״ז */
export function hebrewYearLetters(year: number): string {
  let n = year % 1000;
  const hundreds = ['', 'ק', 'ר', 'ש', 'ת', 'תק', 'תר', 'תש', 'תת', 'תתק'];
  let s = hundreds[Math.floor(n / 100)];
  n %= 100;
  if (n === 15) s += 'טו';
  else if (n === 16) s += 'טז';
  else s += TENS_ALL[Math.floor(n / 10)] + ONES[n % 10];
  return s.length === 1 ? s + '׳' : s.slice(0, -1) + '״' + s.slice(-1);
}

function hebrewMonthName(m: moment.Moment, withYear: boolean): string {
  const name = hebMonthFmt.format(utc(m));
  if (!withYear) return name;
  const year = Number(hebNumFmt.formatToParts(utc(m)).find((p) => p.type === 'year')?.value);
  return year ? `${name} ${hebrewYearLetters(year)}` : name;
}

const ONES = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'];
const TENS = ['', 'י', 'כ', 'ל'];
const TENS_ALL = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'];
/** מספר בין 1 ל-30 באותיות: 1 → א׳, 15 → ט״ו */
export function hebrewDayLetters(n: number): string {
  if (n === 15) return 'ט״ו';
  if (n === 16) return 'ט״ז';
  const s = TENS[Math.floor(n / 10)] + ONES[n % 10];
  return s.length === 1 ? s + '׳' : s.slice(0, -1) + '״' + s.slice(-1);
}

/** בחודש עברי של 29 יום אין ל׳; יום שלא קיים נחשב כראש החודש הבא */
function isHebrewStart(m: moment.Moment, startDay: number): boolean {
  return hebrewDay(m) === startDay;
}

// ---------- חישוב התקופה ----------

/** התקופה (החודש של התקציב) שהתאריך הזה שייך אליה */
export function periodFor(date: moment.Moment, settings?: Partial<MonthPeriodSettings> | null): BudgetPeriod {
  const p = normalizePeriod(settings);
  const day = date.clone().startOf('day');

  if (p.calendar === 'gregorian') {
    const start = day.date() >= p.startDay ? day.clone().date(p.startDay) : day.clone().subtract(1, 'month').date(p.startDay);
    const end = start.clone().add(1, 'month').subtract(1, 'day').endOf('day');
    const whole = p.startDay === 1;
    return {
      start,
      end,
      label: whole ? `${GREG_MONTHS[start.month()]} ${start.year()}` : `${start.format('DD/MM')}–${end.format('DD/MM')}`,
      shortLabel: whole ? start.format('MM/YY') : start.format('DD/MM'),
      key: start.format('YYYY-MM-DD'),
    };
  }

  // עברי: הולכים אחורה עד היום שבו החודש מתחיל, וקדימה עד התחלת החודש הבא
  const start = day.clone();
  for (let i = 0; i < 40 && !isHebrewStart(start, p.startDay); i++) start.subtract(1, 'day');
  const next = start.clone().add(25, 'days');
  for (let i = 0; i < 15 && !isHebrewStart(next, p.startDay); i++) next.add(1, 'day');
  const end = next.clone().subtract(1, 'day').endOf('day');
  const whole = p.startDay === 1;
  return {
    start,
    end,
    label: whole
      ? hebrewMonthName(start, true)
      : `${hebrewDayLetters(p.startDay)} ${hebrewMonthName(start, false)} עד ${hebrewDayLetters(hebrewDay(end))} ${hebrewMonthName(end, false)}`,
    shortLabel: whole ? hebrewMonthName(start, false) : start.format('DD/MM'),
    key: start.format('YYYY-MM-DD'),
  };
}

/** התקופה הקודמת */
export function previousPeriod(period: BudgetPeriod, settings?: Partial<MonthPeriodSettings> | null): BudgetPeriod {
  return periodFor(period.start.clone().subtract(1, 'day'), settings);
}

/** תיאור קצר של החודש הנוכחי להצגה בתוכנה */
export function describeCurrentPeriod(settings?: Partial<MonthPeriodSettings> | null, now: Date = new Date()) {
  const p = periodFor(moment(now), settings);
  return { label: p.label, from: p.start.format('DD/MM/YYYY'), to: p.end.format('DD/MM/YYYY') };
}
