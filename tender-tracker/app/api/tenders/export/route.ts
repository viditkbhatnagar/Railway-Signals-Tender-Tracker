import { NextRequest } from 'next/server';
import ExcelJS from 'exceljs';
import { format } from 'date-fns';
import { queryTenders, type TenderQuery } from '@/lib/tender-queries';
import type { TenderSource, Relevance } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function parseSource(v: string | null): TenderQuery['source'] {
  return v === 'CPPP' || v === 'IREPS' ? (v as TenderSource) : 'all';
}
function parseRelevance(v: string | null): TenderQuery['relevance'] {
  return v === 'HIGH' || v === 'MEDIUM' || v === 'LOW' ? (v as Relevance) : 'all';
}
function parseStatus(v: string | null): TenderQuery['status'] {
  return v === 'active' || v === 'expired' || v === 'all' ? v : 'active';
}

export async function GET(req: NextRequest): Promise<Response> {
  const sp = req.nextUrl.searchParams;
  const { tenders } = await queryTenders({
    source: parseSource(sp.get('source')),
    relevance: parseRelevance(sp.get('relevance')),
    status: parseStatus(sp.get('status')),
    closingWithinDays: sp.get('closingWithin') ? parseInt(sp.get('closingWithin')!, 10) : undefined,
    search: sp.get('search') ?? undefined,
    sort: 'closingDate',
    limit: 5000,
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Railway S&T Tender Tracker';
  wb.created = new Date();
  const ws = wb.addWorksheet('Tenders');

  ws.columns = [
    { header: 'Relevance', key: 'relevance', width: 10 },
    { header: 'Source', key: 'source', width: 8 },
    { header: 'Title', key: 'title', width: 60 },
    { header: 'Reference No', key: 'reference_no', width: 28 },
    { header: 'Tender ID', key: 'tender_id', width: 24 },
    { header: 'Organisation', key: 'organisation', width: 30 },
    { header: 'Department', key: 'department', width: 18 },
    { header: 'Zone', key: 'zone', width: 18 },
    { header: 'Division', key: 'division', width: 14 },
    { header: 'Estimated Value', key: 'estimated_value', width: 18 },
    { header: 'Published', key: 'published_date', width: 20 },
    { header: 'Closing', key: 'closing_date', width: 20 },
    { header: 'Opening', key: 'opening_date', width: 20 },
    { header: 'Matched Keywords', key: 'matched_keywords', width: 36 },
    { header: 'Detail Link', key: 'detail_link', width: 26 },
  ];

  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE5E7EB' },
  };
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  for (const t of tenders) {
    const row = ws.addRow({
      relevance: t.relevance,
      source: t.source,
      title: t.title,
      reference_no: t.reference_no ?? '',
      tender_id: t.tender_id,
      organisation: t.organisation,
      department: t.department ?? '',
      zone: t.zone ?? '',
      division: t.division ?? '',
      estimated_value: t.estimated_value ?? '',
      published_date: t.published_date ? formatDate(t.published_date) : '',
      closing_date: t.closing_date ? formatDate(t.closing_date) : '',
      opening_date: t.opening_date ? formatDate(t.opening_date) : '',
      matched_keywords: (t.matched_keywords ?? []).join(', '),
      detail_link: t.detail_link ? { text: 'Open', hyperlink: t.detail_link } : '',
    });

    // Colour-code by relevance
    const colour =
      t.relevance === 'HIGH'
        ? 'FFFEE2E2'
        : t.relevance === 'MEDIUM'
          ? 'FFFEF3C7'
          : 'FFFFFFFF';
    row.getCell('relevance').fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: colour },
    };
    row.getCell('relevance').font = { bold: true };

    if (t.detail_link) {
      row.getCell('detail_link').font = { color: { argb: 'FF1D4ED8' }, underline: true };
    }

    // Wrap long titles
    row.getCell('title').alignment = { wrapText: true, vertical: 'top' };
  }

  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: ws.columns.length },
  };

  const buffer = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  const stamp = format(new Date(), 'yyyyMMdd-HHmm');
  const filename = `tenders-${stamp}.xlsx`;

  return new Response(buffer, {
    status: 200,
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(buffer.byteLength),
    },
  });
}

function formatDate(iso: string): string {
  try {
    return format(new Date(iso), 'dd-MMM-yyyy hh:mm a');
  } catch {
    return iso;
  }
}
