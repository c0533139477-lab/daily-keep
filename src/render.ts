/**
 * ציור הגרפים, הבאנר המונפש וקובץ ה-PDF בדפדפן נסתר (במקום החלון הנסתר של התוכנה למחשב).
 */
import gifenc from 'gifenc';
import { PNG } from 'pngjs';
import puppeteer, { type Browser } from 'puppeteer';
import { fontFaceCss } from './engine/fonts';

let browser: Browser | null = null;
async function getBrowser() {
  if (!browser) {
    browser = await puppeteer.launch({
      headless: true,
      executablePath: process.env.CHROME_PATH || undefined,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }
  return browser;
}

export async function closeRenderer() {
  if (browser) await browser.close();
  browser = null;
}

async function withPage<T>(width: number, height: number, scale: number, work: (draw: (svg: string) => Promise<Buffer>) => Promise<T>) {
  const page = await (await getBrowser()).newPage();
  try {
    await page.setViewport({ width, height, deviceScaleFactor: scale });
    await page.setContent(
      `<!doctype html><html><head><meta charset="utf-8"><style>${fontFaceCss()}html,body{margin:0;background:#fff;overflow:hidden}svg{display:block;width:${width}px;height:${height}px}</style></head><body><div id="f"></div></body></html>`,
    );
    await page.evaluate(async () => {
      await Promise.all([
        document.fonts.load("40px 'Secular One'"),
        document.fonts.load("700 20px 'Assistant'"),
        document.fonts.load("800 20px 'Assistant'"),
      ]);
      await document.fonts.ready;
    });
    const draw = async (svg: string) => {
      await page.evaluate((s) => {
        document.getElementById('f')!.innerHTML = s;
      }, svg);
      return (await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width, height } })) as Buffer;
    };
    return await work(draw);
  } finally {
    await page.close();
  }
}

export async function svgToPng(svg: string, width: number, height: number): Promise<Buffer> {
  return withPage(width, height, 2, (draw) => draw(svg));
}

export async function svgFramesToGif(frames: { svg: string; delay: number }[], width: number, height: number, scale = 1.5) {
  const pngs = await withPage(width, height, scale, async (draw) => {
    const list: Buffer[] = [];
    for (const f of frames) list.push(await draw(f.svg));
    return list;
  });
  const pixels = pngs.map((b) => PNG.sync.read(b));
  const W = pixels[0].width;
  const H = pixels[0].height;
  const rgba = pixels.map((p) => new Uint8Array(p.data));
  const sample = new Uint8Array(rgba[0].length * 2);
  sample.set(rgba[rgba.length - 1], 0);
  sample.set(rgba[Math.floor(rgba.length / 2)], rgba[0].length);
  const palette = gifenc.quantize(sample, 256);
  const gif = gifenc.GIFEncoder();
  rgba.forEach((px, i) => {
    const index = gifenc.applyPalette(px, palette);
    gif.writeFrame(index, W, H, i === 0 ? { palette, delay: frames[i].delay, repeat: 0 } : { delay: frames[i].delay });
  });
  gif.finish();
  return Buffer.from(gif.bytes());
}

export async function htmlToPdf(html: string): Promise<Buffer> {
  const page = await (await getBrowser()).newPage();
  try {
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    return Buffer.from(await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true }));
  } finally {
    await page.close();
  }
}
