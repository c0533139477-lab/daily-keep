import { randomBytes } from 'crypto';

export interface Attachment {
  filename: string;
  contentType: string;
  data: Buffer;
}

export interface InlineImage {
  cid: string;
  png: Buffer;
  /** ברירת מחדל: PNG */
  type?: 'png' | 'gif';
}

const encodeHeader = (value: string) => `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
const wrap = (b64: string) => b64.replace(/(.{76})/g, '$1\r\n');

/** בונה מייל MIME מלא: HTML + תמונות מוטמעות (cid) + קבצים מצורפים, כמחרוזת */
export function buildMime(opts: {
  from: string;
  to: string;
  subject: string;
  html: string;
  images: InlineImage[];
  attachments?: Attachment[];
}) {
  const boundary = 'sikum_' + randomBytes(8).toString('hex');
  const mixed = 'sikum_mix_' + randomBytes(8).toString('hex');
  const attachments = opts.attachments ?? [];
  const parts = [
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    wrap(Buffer.from(opts.html, 'utf8').toString('base64')),
    ...opts.images.flatMap((img) => [
      `--${boundary}`,
      `Content-Type: image/${img.type ?? 'png'}; name="${img.cid}.${img.type ?? 'png'}"`,
      'Content-Transfer-Encoding: base64',
      `Content-ID: <${img.cid}>`,
      `Content-Disposition: inline; filename="${img.cid}.${img.type ?? 'png'}"`,
      '',
      wrap(img.png.toString('base64')),
    ]),
    `--${boundary}--`,
    '',
  ];
  const headers = [
    `From: ${encodeHeader('Daily Keep')} <${opts.from}>`,
    `To: ${opts.to}`,
    `Subject: ${encodeHeader(opts.subject)}`,
    'MIME-Version: 1.0',
  ];
  if (!attachments.length) {
    return [...headers, `Content-Type: multipart/related; boundary="${boundary}"`, '', ...parts].join('\r\n');
  }
  // יש קבצים מצורפים: עוטפים את גוף המייל ב-multipart/mixed
  return [
    ...headers,
    `Content-Type: multipart/mixed; boundary="${mixed}"`,
    '',
    `--${mixed}`,
    `Content-Type: multipart/related; boundary="${boundary}"`,
    '',
    ...parts,
    ...attachments.flatMap((a) => [
      `--${mixed}`,
      `Content-Type: ${a.contentType}; name="${encodeHeader(a.filename)}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${encodeHeader(a.filename)}"; filename*=UTF-8''${encodeURIComponent(a.filename)}`,
      '',
      wrap(a.data.toString('base64')),
    ]),
    `--${mixed}--`,
    '',
  ].join('\r\n');
}
