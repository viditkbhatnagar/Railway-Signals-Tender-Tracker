import * as cheerio from 'cheerio';
import { readFileSync } from 'node:fs';

const html = readFileSync('/tmp/cppp-orgs.html', 'utf8');
const $ = cheerio.load(html);

const ORG_HEADER_SIGNATURE = ['s.no', 'organisation name', 'tender count'];
const orgs = [];

$('table').each((_, table) => {
  const $t = $(table);
  const firstRow = $t.find('tr').first();
  const headers = firstRow
    .find('td, th')
    .map((__, el) => $(el).text().trim().toLowerCase())
    .get();

  const matches =
    headers.length >= 3 &&
    ORG_HEADER_SIGNATURE.every((h, i) => headers[i]?.includes(h.split(' ')[0] ?? ''));
  if (!matches) return;

  $t.find('tr').slice(1).each((__, row) => {
    const cells = $(row).find('td');
    if (cells.length < 3) return;
    const sno = $(cells[0]).text().trim();
    const name = $(cells[1]).text().trim();
    const countText = $(cells[2]).text().trim();
    const link = $(cells[2]).find('a').attr('href') || '';
    if (!/^\d+$/.test(sno) || !link) return;
    orgs.push({ sno: parseInt(sno, 10), name, count: parseInt(countText, 10) || 0, link });
  });
});

console.log(`Parsed ${orgs.length} orgs`);
console.log('Total tenders:', orgs.reduce((s, o) => s + o.count, 0));
console.log('First 5:', orgs.slice(0, 5).map((o) => ({ sno: o.sno, name: o.name.slice(0, 40), count: o.count })));
const ircon = orgs.find((o) => /IRCON International Limited/i.test(o.name));
console.log('IRCON:', ircon ? { sno: ircon.sno, name: ircon.name, count: ircon.count, linkStart: ircon.link.slice(0, 80) } : 'NOT FOUND');
