import { type Transaction } from 'israeli-bank-scrapers/lib/transactions';

/** עסקה אחרי שהוספנו לה את מספר החשבון ומזהה ייחודי (כמו בתוכנה למחשב) */
export interface EnrichedTransaction extends Transaction {
  accountNumber: string;
  category?: string;
  hash: string;
}
