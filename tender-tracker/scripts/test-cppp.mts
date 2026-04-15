import { fetchOrgListing, fetchOrgTenders, parseCPPPDate } from '../lib/cppp-scraper';

const t0 = Date.now();
const { orgs, totalTenders, jar } = await fetchOrgListing();
console.log(`Org listing OK: ${orgs.length} orgs, ${totalTenders} tenders (${Date.now() - t0}ms)`);
console.log(
  'First 3 orgs:',
  orgs.slice(0, 3).map((o) => ({ sno: o.sno, name: o.name, count: o.count }))
);

const ircon = orgs.find((o) => /IRCON International Limited/i.test(o.name));
const small = ircon ?? orgs.find((o) => o.count > 0 && o.count <= 5) ?? orgs[0];
console.log(`\nScraping: ${small.name} (count=${small.count})`);
const { tenders } = await fetchOrgTenders(small, jar);
console.log(`Got ${tenders.length} tenders`);
if (tenders.length > 0) {
  const t = tenders[0];
  console.log('First tender:', {
    title: t.title.slice(0, 80),
    refNo: t.referenceNo,
    tenderId: t.tenderId,
    pub: t.publishedDate,
    pubIso: parseCPPPDate(t.publishedDate),
    close: t.closingDate,
    orgChain: t.orgChain?.slice(0, 60),
  });
}
