import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const NUMERIC_RUN = /^-?[\d.,]+(?:\s+-?[\d.,]+)+$/;

// Some PDFs store adjacent table cells as one text item ("4051 413202").
// Such an all-numeric item is split into one word per number, with positions
// estimated from the character offsets, so column-based parsers see each cell.
function splitNumericRun(item) {
  if (!NUMERIC_RUN.test(item.text)) return [item];
  const perChar = item.width / item.text.length;
  return [...item.text.matchAll(/\S+/g)].map((match) => ({
    ...item,
    text: match[0],
    x: item.x + match.index * perChar,
    width: match[0].length * perChar,
  }));
}

export async function extractPdfLines(buffer) {
  const document = await getDocument({ data: new Uint8Array(buffer), useSystemFonts: true }).promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const items = content.items
      .filter((item) => String(item.str || '').trim())
      .map((item) => ({ text: String(item.str).trim(), x: item.transform[4], y: item.transform[5], width: item.width || 0 }))
      .flatMap(splitNumericRun);
    const buckets = [];
    for (const item of items.sort((a, b) => b.y - a.y || a.x - b.x)) {
      const bucket = buckets.at(-1);
      if (!bucket || Math.abs(bucket.y - item.y) > 3.5) buckets.push({ y: item.y, words: [item] });
      else {
        bucket.words.push(item);
        bucket.y = bucket.words.reduce((sum, word) => sum + word.y, 0) / bucket.words.length;
      }
    }
    const lines = buckets
      .map(({ y, words }) => ({ page: pageNumber, y, words: words.sort((a, b) => a.x - b.x) }))
      .map((line) => ({ ...line, text: line.words.map((word) => word.text).join(' ') }));
    pages.push(...lines);
  }
  return pages;
}
