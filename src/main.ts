/**
 * Daily Keep - גרסת ענן אישית.
 * רץ כל בוקר בחשבון הגיטהאב של המשתמש: מושך עסקאות, בונה את המייל (אותו עיצוב כמו בתוכנה למחשב) ושולח.
 * פרטי הכניסה לכרטיסים נשמרים רק בהגדרות הסודיות של החשבון של המשתמש.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import moment from 'moment';
import { createScraper, CompanyTypes } from 'israeli-bank-scrapers';
import { type EnrichedTransaction } from './commonTypes';
import { buildMime, type Attachment, type InlineImage } from './engine/mime';
import { buildDailySummary, monthDetailsFileName, renderDailySummaryEmail, renderMonthDetailsPage, type DailySummarySettings } from './engine/summary';
import { closeRenderer, htmlToPdf, svgFramesToGif, svgToPng } from './render';

const FOOTER_CREDIT = 'נבנה ע"י חוי קוסובסקי - מקדמת עסקים ומשרדים · 053-3139477';
const PREVIEW = process.argv.includes('--preview');

interface Settings {
  email: string;
  monthlyBudget: number;
  cardNames?: Record<string, string>;
  fixedCharges?: DailySummarySettings['fixedCharges'];
  monthPeriod?: DailySummarySettings['monthPeriod'];
  daysBack?: number;
}

// כל ההגדרות הסודיות מגיעות יחד מקובץ ההפעלה, כך שאפשר להוסיף שמות חדשים בלי לשנות אותו
let allSecrets: Record<string, string> = {};
try {
  allSecrets = JSON.parse(process.env.ALL_SECRETS || '{}');
} catch {
  allSecrets = {};
}
const env = (name: string) => (process.env[name] || allSecrets[name] || '').trim();

/** אילו חשבונות למשוך: לפי ההגדרות הסודיות שהמשתמש מילא */
function accountsFromEnv() {
  const list: { company: CompanyTypes; credentials: Record<string, string> }[] = [];
  // לכל חברה אפשר עד שלושה משתמשים: MAX_..., MAX2_..., MAX3_... (למשל כרטיסים של שני בני זוג)
  const add = (company: CompanyTypes, fields: Record<string, string>) => {
    for (const n of ['', '2', '3']) {
      const credentials: Record<string, string> = {};
      for (const [key, envName] of Object.entries(fields)) credentials[key] = env(envName.replace(/^([A-Z]+)_/, `$1${n}_`));
      if (Object.values(credentials).every(Boolean)) list.push({ company, credentials });
    }
  };
  add(CompanyTypes.max, { username: 'MAX_USERNAME', password: 'MAX_PASSWORD' });
  add(CompanyTypes.visaCal, { username: 'CAL_USERNAME', password: 'CAL_PASSWORD' });
  add(CompanyTypes.isracard, { id: 'ISRACARD_ID', card6Digits: 'ISRACARD_CARD6', password: 'ISRACARD_PASSWORD' });
  add(CompanyTypes.amex, { id: 'AMEX_ID', card6Digits: 'AMEX_CARD6', password: 'AMEX_PASSWORD' });
  add(CompanyTypes.hapoalim, { userCode: 'HAPOALIM_USERCODE', password: 'HAPOALIM_PASSWORD' });
  add(CompanyTypes.leumi, { username: 'LEUMI_USERNAME', password: 'LEUMI_PASSWORD' });
  add(CompanyTypes.discount, { id: 'DISCOUNT_ID', password: 'DISCOUNT_PASSWORD', num: 'DISCOUNT_NUM' });
  add(CompanyTypes.mizrahi, { username: 'MIZRAHI_USERNAME', password: 'MIZRAHI_PASSWORD' });
  return list;
}

// חברות שחוסמות כניסה משרתים בחו"ל, ולכן עוברות דרך כתובת ישראלית (אם הוגדרה PROXY_URL)
const NEEDS_ISRAELI_ADDRESS = new Set<CompanyTypes>([CompanyTypes.isracard, CompanyTypes.amex]);

/** PROXY_URL בצורה http://user:pass@host:port */
function proxyFromEnv() {
  const raw = env('PROXY_URL');
  if (!raw) return null;
  try {
    const u = new URL(raw.includes('://') ? raw : `http://${raw}`);
    return {
      server: `${u.protocol}//${u.hostname}:${u.port || '3128'}`,
      username: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
    };
  } catch {
    console.log('הכתובת ב-PROXY_URL לא תקינה, ממשיכים בלעדיה');
    return null;
  }
}

async function scrapeAll(daysBack: number) {
  const accounts = accountsFromEnv();
  if (!accounts.length) throw new Error('לא הוגדרו פרטי כניסה לאף כרטיס. ראו את ההוראות בקובץ README');
  const startDate = moment().subtract(daysBack, 'days').startOf('day').toDate();
  const all: EnrichedTransaction[] = [];
  const failures: string[] = [];
  for (const { company, credentials } of accounts) {
    const proxy = NEEDS_ISRAELI_ADDRESS.has(company) ? proxyFromEnv() : null;
    console.log(`מושך עסקאות מ-${company}${proxy ? ' (דרך כתובת ישראלית)' : ''}...`);
    const scraper = createScraper({
      companyId: company,
      startDate,
      combineInstallments: false,
      showBrowser: false,
      executablePath: process.env.CHROME_PATH || undefined,
      args: ['--no-sandbox', '--disable-setuid-sandbox', ...(proxy ? [`--proxy-server=${proxy.server}`] : [])],
      preparePage: proxy?.username
        ? async (page) => {
            await page.authenticate({ username: proxy.username, password: proxy.password });
          }
        : undefined,
      timeout: 120000,
    });
    try {
      const result = await scraper.scrape(credentials as never);
      if (!result.success) {
        failures.push(`${company}: ${result.errorType} ${result.errorMessage ?? ''}`);
        continue;
      }
      for (const acc of result.accounts ?? []) {
        for (const t of acc.txns) {
          all.push({
            ...t,
            accountNumber: acc.accountNumber,
            hash: `${t.date}_${t.chargedAmount}_${t.description}_${t.memo ?? ''}_${company}_${acc.accountNumber}`,
          });
        }
      }
      console.log(`  ${company}: הצליח`);
    } catch (e) {
      failures.push(`${company}: ${(e as Error).message}`);
    }
  }
  return { transactions: all, failures };
}

async function buildEmail(history: EnrichedTransaction[], settings: Settings) {
  const s: DailySummarySettings = {
    monthlyBudget: settings.monthlyBudget ?? 0,
    cardNames: settings.cardNames ?? {},
    fixedCharges: settings.fixedCharges ?? [],
    monthPeriod: settings.monthPeriod,
    footerCredit: FOOTER_CREDIT,
    updateNote: 'הנתונים מתעדכנים בכל בוקר.',
  };
  const summary = buildDailySummary(history, s);
  const { subject, html, images, animations, staticImages } = renderDailySummaryEmail(summary, s);
  const pngs: InlineImage[] = [...staticImages];
  for (const img of images) pngs.push({ cid: img.cid, png: await svgToPng(img.svg, img.width, img.height) });
  for (const a of animations) pngs.push({ cid: a.cid, png: await svgFramesToGif(a.frames, a.width, a.height), type: 'gif' });
  const attachments: Attachment[] = [];
  let finalHtml = html;
  if (summary.monthRows.length) {
    attachments.push({
      filename: monthDetailsFileName(summary),
      contentType: 'application/pdf',
      data: await htmlToPdf(renderMonthDetailsPage(summary, s)),
    });
  } else {
    finalHtml = finalHtml.replace(/<div style="text-align:center;margin-top:16px;"><span[^>]*>📎[^<]*<\/span><\/div>/, '');
  }
  return { subject, html: finalHtml, pngs, attachments };
}

/** שליחה מה-Gmail של המשתמש (אם חובר), או דרך שרת הבדיקה */
async function send(mime: string) {
  const raw = Buffer.from(mime, 'utf8').toString('base64url');
  if (env('GMAIL_REFRESH_TOKEN')) {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env('GMAIL_CLIENT_ID'),
        client_secret: env('GMAIL_CLIENT_SECRET'),
        refresh_token: env('GMAIL_REFRESH_TOKEN'),
        grant_type: 'refresh_token',
      }),
    });
    const token = (await tokenRes.json()) as { access_token?: string; error?: string };
    if (!token.access_token) throw new Error(`החיבור ל-Gmail נכשל: ${token.error ?? tokenRes.status}`);
    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw }),
    });
    if (!res.ok) throw new Error(`שליחת המייל נכשלה (${res.status}): ${await res.text()}`);
    return 'gmail';
  }
  if (env('RELAY_URL') && env('RELAY_TOKEN')) {
    const res = await fetch(env('RELAY_URL'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env('RELAY_TOKEN')}` },
      body: JSON.stringify({ raw }),
    });
    if (!res.ok) throw new Error(`שליחת המייל נכשלה (${res.status})`);
    return 'relay';
  }
  throw new Error('לא הוגדרה דרך לשליחת המייל');
}

async function main() {
  // בהרצה האוטומטית, כשכמה משתמשים עוברים דרך אותה כתובת ישראלית, מפזרים את שעת ההתחלה כדי שלא ייכנסו כולם יחד
  if (process.env.GITHUB_EVENT_NAME === 'schedule' && env('PROXY_URL')) {
    const ms = Math.floor(Math.random() * 8 * 60 * 1000);
    console.log(`ממתין ${Math.round(ms / 60000)} דקות לפני ההתחלה`);
    await new Promise((r) => setTimeout(r, ms));
  }
  const settings = JSON.parse(readFileSync('settings.json', 'utf8')) as Settings;
  let history: EnrichedTransaction[];
  let failures: string[] = [];
  if (PREVIEW && process.env.DEMO_HISTORY) {
    history = JSON.parse(readFileSync(process.env.DEMO_HISTORY, 'utf8'));
  } else {
    ({ transactions: history, failures } = await scrapeAll(settings.daysBack ?? 180));
  }
  console.log(`נמשכו ${history.length} עסקאות`);
  if (failures.length) console.log('בעיות במשיכה:\n' + failures.join('\n'));
  if (!history.length && failures.length) throw new Error('המשיכה נכשלה בכל החשבונות');

  const { subject, html, pngs, attachments } = await buildEmail(history, settings);
  await closeRenderer();
  const to = settings.email;
  const mime = buildMime({ from: to, to, subject, html, images: pngs, attachments });
  if (PREVIEW) {
    if (!existsSync('out')) mkdirSync('out');
    writeFileSync('out/preview.eml', mime);
    console.log('המייל נשמר ב-out/preview.eml');
    return;
  }
  const via = await send(mime);
  console.log(`המייל נשלח אל ${to} (${via})`);
}

main().catch(async (e) => {
  console.error('שגיאה:', (e as Error).message);
  await closeRenderer().catch(() => {});
  process.exit(1);
});
