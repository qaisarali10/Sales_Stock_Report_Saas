// "Stock Reference" report with Opening | Receipt Qty+Bon | Sale Qty+Bon |
// Return Qty+Bon | Net Sale Qty+Bon | Sale Value | Transfer In | Transfer Out |
// Close Qty | Closing Value columns (e.g. ASIF TRADERS BATKHELA).
//
// Every cell is always printed (zeros included), and the quantity of each
// Qty+Bon pair is printed with a trailing "+" (e.g. "37+", then "18" for its
// bonus on the next token), so fields are read by a fixed sequential order
// rather than by column position. Net Sale = Sale - Return (qty and bonus),
// and both Sale Value and Closing Value are that net/closing quantity x the
// row's own trade price — confirmed against real rows before use.
//
// The "Grand Totals" footer prints: Opening, Receipt, Sale, Return, Net Sale
// (this one is the sale VALUE total, confirmed against the summed rows),
// Transfer In, Transfer Out, Closing Value.
import { extractPdfLines } from './pdfText.js';
import { normalizeRow, numberValue } from './normalize.js';
import { expectTotal } from './totals.js';

const RATE = /^\d[\d,]*\.\d{2}$/;
const FIELD = /^-?\d[\d,]*(?:\.\d+)?\+?$/;
const FIELD_COUNT = 14; // Opn, Recv(2), Sale(2), Ret(2), Net(2), Value, TransIn, TransOut, CloseQty, CloseValue

export function isNetSaleTransferReport(lines) {
  return lines.some((line) => /^Description\b/.test(line.text.trim()) && /\bQty \+ Bon\b/.test(line.text) && /\bClose\b/.test(line.text));
}

export function parseNetSaleTransferLines(lines) {
  const rows = [];
  for (const line of lines) {
    if (/Total|Group\.|Company\./i.test(line.text)) continue;
    const words = line.words;
    const rateIndex = words.findIndex((word, index) => index >= 1 && RATE.test(word.text));
    if (rateIndex < 1) continue;
    const tail = words.slice(rateIndex + 1);
    if (tail.length !== FIELD_COUNT || !tail.every((word) => FIELD.test(word.text))) continue;
    const value = (index) => numberValue(tail[index].text.replace('+', ''));
    const sprice = numberValue(words[rateIndex].text);
    const netQty = value(7);
    const netBonus = value(8);
    const clqty = value(12);
    rows.push(normalizeRow({
      pafk: words.slice(0, rateIndex).map((word) => word.text).join(' '),
      sprice,
      sqty: netQty,
      sbonus: netBonus,
      salvalue: value(9),
      clqty,
      clbonus: 0,
      clvalue: value(13),
    }));
  }
  if (!rows.length) throw new Error('Stock reference report contains no recognized rows.');

  const footer = lines.findLast((line) => /^Grand Totals/i.test(line.text.trim()));
  if (footer) {
    const numbers = (footer.text.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
    // Opn, Receipt, Sale, Return, NetSale(=Sale Value), TransferIn, TransferOut, ClosingValue.
    if (numbers.length >= 8) {
      expectTotal(rows, 'salvalue', numbers[4]);
      expectTotal(rows, 'clvalue', numbers.at(-1));
    }
  }
  return rows;
}

export async function parseNetSaleTransferReport(buffer) {
  return parseNetSaleTransferLines(await extractPdfLines(buffer));
}
