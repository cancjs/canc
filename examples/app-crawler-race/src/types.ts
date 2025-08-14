// Shared, flavor-free types for the site-health crawl.

/** The outcome of one crawl: every page visited, and the broken (404) links found. */
export interface CrawlReport {
 visited: string[];
 broken: string[];
}
