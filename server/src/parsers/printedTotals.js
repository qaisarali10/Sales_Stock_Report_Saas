// Detects report footers that print sale and closing value totals. The totals
// are used only to verify parsed rows (see totals.js); rows are never adjusted.
function numbers(value) {
  return (String(value || '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
}

function lastMatch(lines, pattern) {
  return [...lines].reverse().find((line) => pattern.test(line.text));
}

export function inferPrintedTotals(lines) {
  const text = lines.map((line) => line.text).join('\n');
  const netSale = lastMatch(lines, /\bNet Sale(?:s)? Value\s*:/i);
  const closing = lastMatch(lines, /\bClosing Stock Value\s*:/i);
  if (netSale && closing) {
    if (netSale === closing) {
      const values = numbers(netSale.text);
      if (values.length >= 2) return { sale: values.at(-2), close: values.at(-1) };
    }
    return { sale: numbers(netSale.text).at(-1), close: numbers(closing.text).at(-1) };
  }

  const companyGrand = lastMatch(lines, /Grand Totals Of Companies/i);
  if (companyGrand) {
    const values = numbers(companyGrand.text);
    if (values.length >= 6) return { sale: values.at(-4), close: values.at(-1) };
  }

  const grand = lastMatch(lines, /\bGRAND TOTAL\b/i);
  const values = numbers(grand?.text);
  if (/MEDICHAIN DISTRIBUTION|GENERAL TOTAL/i.test(text) && values.length >= 15) {
    return { sale: values[6], close: values.at(-1) };
  }
  if (/Net Sales Value\s+Balance Value/i.test(text) && values.length >= 6) {
    return { sale: values.at(-4), close: values.at(-3) };
  }
  if (/Item Description Opening Purchase Total Sale Return Closing/i.test(text) && values.length >= 4) {
    return { sale: values.at(-2), close: values.at(-1) };
  }

  const simpleTotal = lastMatch(lines, /^Total:/i);
  const simpleValues = numbers(simpleTotal?.text);
  if (simpleValues.length >= 3 && simpleValues.length <= 5) {
    return { sale: simpleValues.at(-2), close: simpleValues.at(-1) };
  }
  return null;
}
