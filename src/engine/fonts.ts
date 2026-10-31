// גופנים שמוטמעים בתמונות המייל (באנר, גרפים) ובקובץ ה-PDF, כדי שייראו אותו דבר בכל מחשב
import {
  assistantHeb700,
  assistantHeb800,
  assistantLat700,
  assistantLat800,
  secularHeb,
  secularLat,
} from './fontsData';

const face = (family: string, weight: number, url: string) =>
  `@font-face{font-family:'${family}';font-weight:${weight};font-style:normal;src:url(${url}) format('woff2');}`;

/** כותרות עגולות ובולטות */
export const DISPLAY_FONT = "'Secular One', Arial, sans-serif";
/** טקסט רגיל */
export const TEXT_FONT = "'Assistant', Arial, sans-serif";

export function fontFaceCss(): string {
  return (
    face('Secular One', 400, secularHeb) +
    face('Secular One', 400, secularLat) +
    face('Assistant', 700, assistantHeb700) +
    face('Assistant', 700, assistantLat700) +
    face('Assistant', 800, assistantHeb800) +
    face('Assistant', 800, assistantLat800)
  );
}
