export type TenderSource = 'CPPP' | 'IREPS';
export type Relevance = 'HIGH' | 'MEDIUM' | 'LOW';
export type ScrapeStatus = 'running' | 'completed' | 'failed' | 'partial';

export interface Tender {
  id?: string;
  tender_id: string;
  source: TenderSource;
  title: string;
  reference_no?: string | null;
  organisation: string;
  org_chain?: string | null;
  department?: string | null;
  zone?: string | null;
  division?: string | null;
  published_date?: string | null;
  closing_date?: string | null;
  opening_date?: string | null;
  estimated_value?: string | null;
  emd_amount?: string | null;
  tender_type?: string | null;
  tender_category?: string | null;
  matched_keywords: string[];
  relevance: Relevance;
  detail_link?: string | null;
  scraped_at?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Keyword {
  id: string;
  keyword: string;
  category: 'default' | 'custom';
  is_active: boolean;
  created_at: string;
}

export interface ScrapeLog {
  id: string;
  source: TenderSource | 'BOTH';
  status: ScrapeStatus;
  started_at: string;
  completed_at: string | null;
  total_scraped: number;
  matched_count: number;
  new_count: number;
  orgs_scraped: number;
  orgs_total: number;
  error_message: string | null;
  errors: Array<{ org?: string; zone?: string; error: string }>;
  duration_seconds: number | null;
}

export interface CPPPOrg {
  sno: number;
  name: string;
  count: number;
  link: string;
}

export interface CPPPTenderRaw {
  organisation: string;
  title: string;
  referenceNo: string;
  tenderId: string;
  publishedDate: string;
  closingDate: string;
  openingDate: string;
  orgChain: string;
  detailLink: string;
  source: 'CPPP';
}

export interface IREPSTenderRaw {
  tenderId: string;
  title: string;
  referenceNo: string;
  department: string;
  zone: string;
  division?: string;
  estimatedValue?: string;
  publishedDate: string;
  closingDate: string;
  openingDate?: string;
  tenderType?: string;
  detailLink?: string;
  source: 'IREPS';
}

export interface CPPPInitResponse {
  sessionId: string;
  orgs: CPPPOrg[];
  totalOrgs: number;
  totalTenders: number;
}

export interface CPPPScrapeOrgResponse {
  tenders: CPPPTenderRaw[];
  matchedCount: number;
  savedCount: number;
}

export interface IREPSZone {
  id: string;
  name: string;
}

export interface ApiError {
  success: false;
  error: string;
  code?: 'SESSION_EXPIRED' | 'NETWORK_ERROR' | 'PARSE_ERROR' | 'RATE_LIMITED' | 'BAD_REQUEST' | 'UNAUTHORIZED';
}
