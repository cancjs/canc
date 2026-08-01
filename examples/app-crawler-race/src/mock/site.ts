// Per-example scaffolding: a small website served over the shared MockApi. Pretend this is a real
// site you are running a health check against. Every fetch runs through MockApi.respond, so it
// honors an AbortSignal and shows up in the call log with started/completed/aborted markers.
//
// The reader treats this as a black box. The teaching payload lives in src/crawl-*.ts.

import { type AbortSignalLike, MockApi } from '@shared/mock-api';

/** One fetched page: its own health plus the links found on it. */
export interface Page {
  url: string;
  /** HTTP-style status. 200 = healthy, 404 = a broken link the crawl should report. */
  status: number;
  /** Links found on the page, followed one level deeper. */
  links: string[];
}

// A depth-2 site: the home page links three sections, each section links a few leaf pages. Two leaf
// pages are broken (404). "about/team" is a slow page used to prove an in-flight fetch gets aborted.
const PAGES: Record<string, Omit<Page, 'url'>> = {
  '/': { status: 200, links: ['/products', '/about', '/blog'] },
  '/products': { status: 200, links: ['/products/widgets', '/products/gadgets', '/products/legacy'] },
  '/about': { status: 200, links: ['/about/team', '/about/careers'] },
  '/blog': { status: 200, links: ['/blog/launch', '/blog/hiring'] },
  '/products/widgets': { status: 200, links: [] },
  '/products/gadgets': { status: 200, links: [] },
  '/products/legacy': { status: 404, links: [] },
  '/about/team': { status: 200, links: [] },
  '/about/careers': { status: 404, links: [] },
  '/blog/launch': { status: 200, links: [] },
  '/blog/hiring': { status: 200, links: [] },
};

/** The page a crawl starts from. */
export const HOME_URL = '/';

/** Total pages in the site, so a test can assert a canceled crawl fetched fewer than all of them. */
export const TOTAL_PAGES = Object.keys(PAGES).length;

export interface SiteApi {
  /** Fetches one page. Unknown urls resolve to a 404 with no links. */
  fetchPage(url: string, signal?: AbortSignalLike): Promise<Page>;
}

/** Builds a site API bound to one MockApi call log. */
export function createSiteApi(api: MockApi): SiteApi {
  return {
    fetchPage(url, signal) {
      return api.respond('site.page', { url }, () => ({ url, ...(PAGES[url] ?? { status: 404, links: [] }) }), signal);
    },
  };
}
