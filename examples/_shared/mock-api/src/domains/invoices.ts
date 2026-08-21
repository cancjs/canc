import { clone, mulberry32 } from '@shared/util';

import { AbortSignalLike, MockApi } from '../core';

export interface Invoice {
  id: string;
  customer: string;
  total: number;
  paid: boolean;
  issuedAt: number;
}

export interface InvoiceLine {
  description: string;
  amount: number;
}

export interface InvoiceDetail {
  id: string;
  lines: InvoiceLine[];
  dueAt: number;
  pdfBytes: number[];
}

export interface InvoicesApi {
  list(signal?: AbortSignalLike): Promise<Invoice[]>;
  get(id: string, signal?: AbortSignalLike): Promise<Invoice>;
  search(filter: string, signal?: AbortSignalLike): Promise<Invoice[]>;
  detail(id: string, signal?: AbortSignalLike): Promise<InvoiceDetail>;
}

const CUSTOMER_NAMES = [
  'Acme Corp',
  'Globex',
  'Initech',
  'Umbrella Group',
  'Soylent Foods',
  'Stark Industries',
  'Wayne Enterprises',
  'Wonka Industries',
  'Cyberdyne Systems',
  'Hooli',
  'Massive Dynamic',
  'Gringotts',
  'Oscorp',
  'Tyrell Corp',
  'Aperture Science',
  'Black Mesa',
  'Weyland-Yutani',
  'Vandelay Industries',
  'Prestige Worldwide',
  'Dunder Mifflin',
  'Monsters Inc',
  'Pied Piper',
  'Bluth Company',
  'Sterling Cooper',
  'Nakatomi Trading',
  'Gekko and Co',
  'Duff Brewing',
  'Krusty Corp',
  'Spacely Sprockets',
  'Cogswell Cogs',
  'Contoso Ltd',
  'Fabrikam Inc',
  'Northwind Traders',
  'Adventure Works',
  'Big Kahuna Burger',
  'Los Pollos Hermanos',
  'Gustavo Fring Holdings',
  'Wonderland Trading',
  'Frobozz Magic',
  'Zorg Industries',
];

const INVOICE_COUNT = 5000;
const ISSUED_ANCHOR = Date.UTC(2024, 0, 1);
const ISSUED_SPREAD_DAYS = 730;
const DAY_MS = 86400000;
const DETAIL_LINE_MAX = 4;
const PDF_BYTE_LENGTH = 64;
const DETAIL_FAIL_RATE = 0.1;

// A fixed, non-generated row several examples depend on by exact id (see
// demo-chain-propagation). Kept out of the generated 5,000 and out of search's pool.
const AUDIT_INVOICE: Invoice = {
  id: 'audit-1',
  customer: 'System Audit',
  total: 0,
  paid: true,
  issuedAt: ISSUED_ANCHOR,
};

/** Small deterministic string hash (32-bit), used to derive a per-id detail seed. */
function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (Math.imul(31, h) + id.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

/**
 * Builds the base dataset once from the MockApi's seeded PRNG: 5,000 invoices with a customer,
 * total, paid flag and issue date. Heavier per-invoice detail (lines, due date, pdf bytes, and
 * the ~1-in-10 failure) is derived lazily per id in `detail`, from a seed captured here, so it
 * never needs a second full pass over the dataset.
 */
function generateInvoices(api: MockApi): { invoices: Invoice[]; detailSeedBase: number } {
  const invoices: Invoice[] = [];
  for (let i = 1; i <= INVOICE_COUNT; i++) {
    const id = `inv-${String(i).padStart(4, '0')}`;
    const customer = CUSTOMER_NAMES[Math.floor(api.random() * CUSTOMER_NAMES.length)];
    const total = Math.round((50 + api.random() * 9950) * 100) / 100;
    const paid = api.random() < 0.6;
    const issuedAt = ISSUED_ANCHOR + Math.floor(api.random() * ISSUED_SPREAD_DAYS) * DAY_MS;
    invoices.push({ id, customer, total, paid, issuedAt });
  }
  // One extra draw, captured once, seeds every per-id detail derivation below.
  const detailSeedBase = Math.floor(api.random() * 0xffffffff);
  return { invoices, detailSeedBase };
}

/** Derives the heavier detail payload for one invoice id, deterministic given the seed base. */
function buildDetail(invoice: Invoice, detailSeedBase: number): { detail: InvoiceDetail; fails: boolean } {
  const rand = mulberry32((detailSeedBase ^ hashId(invoice.id)) >>> 0);
  const lineCount = 1 + Math.floor(rand() * DETAIL_LINE_MAX);
  const lines: InvoiceLine[] = [];
  let remaining = invoice.total;
  for (let l = 0; l < lineCount; l++) {
    const share = l === lineCount - 1 ? remaining : Math.round(rand() * (remaining / (lineCount - l)) * 100) / 100;
    remaining = Math.round((remaining - share) * 100) / 100;
    lines.push({ description: `Line item ${l + 1}`, amount: share });
  }
  const dueAt = invoice.issuedAt + 30 * DAY_MS;
  const pdfBytes: number[] = [];
  for (let b = 0; b < PDF_BYTE_LENGTH; b++) pdfBytes.push(Math.floor(rand() * 256));
  const fails = rand() < DETAIL_FAIL_RATE;
  return { detail: { id: invoice.id, lines, dueAt, pdfBytes }, fails };
}

export function createInvoicesApi(api: MockApi): InvoicesApi {
  const { invoices: GENERATED, detailSeedBase } = generateInvoices(api);
  const ALL: Invoice[] = [...GENERATED, AUDIT_INVOICE];
  const BY_ID = new Map(ALL.map((invoice) => [invoice.id, invoice]));

  return {
    list: (signal) => api.respond('invoices.list', {}, () => clone(ALL), signal),
    get: (id, signal) =>
      api.respond(
        'invoices.get',
        { id },
        () => {
          const found = BY_ID.get(id);
          if (!found) throw new Error(`no invoice ${id}`);
          return clone(found);
        },
        signal,
      ),
    search: (filter, signal) =>
      api.respond(
        'invoices.search',
        { filter },
        () => {
          const needle = filter.trim().toLowerCase();
          const matches = needle ? GENERATED.filter((i) => i.customer.toLowerCase().includes(needle)) : GENERATED;
          return clone(matches);
        },
        signal,
      ),
    detail: (id, signal) =>
      api.respond(
        'invoices.detail',
        { id },
        () => {
          const invoice = BY_ID.get(id);
          if (!invoice) throw new Error(`no invoice ${id}`);
          const { detail, fails } = buildDetail(invoice, detailSeedBase);
          if (fails) throw new Error(`invoice detail temporarily unavailable: ${id}`);
          return clone(detail);
        },
        signal,
      ),
  };
}
