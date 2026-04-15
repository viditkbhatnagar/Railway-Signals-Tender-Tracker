import * as cheerio from 'cheerio';
import { readFileSync } from 'node:fs';

const html = readFileSync('/tmp/cppp-ircon.html', 'utf8');
const $ = cheerio.load(html);

const TOKENS = ['s.no', 'e-published', 'closing', 'opening', 'title and ref', 'organisation chain'];

function parseTitleCell(raw) {
  const parts = [];
  let depth = 0, buf = '';
  for (const ch of raw) {
    if (ch === '[') {
      if (depth === 0) buf = ''; else buf += ch;
      depth++;
    } else if (ch === ']') {
      depth--;
      if (depth === 0) { parts.push(buf.trim()); buf = ''; }
      else if (depth > 0) buf += ch;
    } else if (depth > 0) buf += ch;
  }
  return { title: parts[0] ?? '', referenceNo: parts[1] ?? '', tenderId: parts[2] ?? '' };
}

const candidates = [];
$('table').each((_, t) => {
  const $t = $(t);
  const first = $t.find('tr').first();
  const headers = first.find('td, th').map((__, el) => $(el).text().trim().toLowerCase()).get();
  if (headers.length < 5) return;
  if (TOKENS.every((n) => headers.some((h) => h.includes(n)))) candidates.push($t);
});
const innermost = candidates.filter(($t) =>
  !candidates.some(($other) => $other !== $t && $t.find($other).length > 0)
);
console.log(`candidates=${candidates.length} innermost=${innermost.length}`);

const tenders = [];
innermost.forEach(($table) => {
  const headers = $table.find('tr').first().find('td, th').map((__, el) => $(el).text().trim().toLowerCase()).get();
  const col = (n) => headers.findIndex((h) => h.includes(n));
  const iPub = col('e-published'), iClose = col('closing'), iOpen = col('opening'),
        iTitle = col('title and ref'), iChain = col('organisation chain');
  const rows = $table.children('tbody').length ? $table.children('tbody').children('tr') : $table.children('tr');
  rows.slice(1).each((__, row) => {
    const cells = $(row).children('td');
    if (cells.length < 5) return;
    const pub = iPub >= 0 ? $(cells[iPub]).text().trim() : '';
    const close = iClose >= 0 ? $(cells[iClose]).text().trim() : '';
    const open = iOpen >= 0 ? $(cells[iOpen]).text().trim() : '';
    const titleText = iTitle >= 0 ? $(cells[iTitle]).text().trim() : '';
    const chain = iChain >= 0 ? $(cells[iChain]).text().trim() : '';
    const parts = parseTitleCell(titleText);
    if (!parts.title && !parts.tenderId) return;
    tenders.push({ ...parts, pub, close, open, chain });
  });
});

console.log(`Parsed ${tenders.length} tenders`);
tenders.forEach((t, i) => {
  console.log(`\n[${i}] ${t.title.slice(0, 80)}`);
  console.log(`    ref=${t.referenceNo} | id=${t.tenderId}`);
  console.log(`    pub=${t.pub} | close=${t.close}`);
});
