// Fake site to back up. Aux scaffolding only (not for copying) -- pretend this is a real site
// crawl + asset fetch. Every call honors an AbortSignal and logs started/aborted markers so the
// SIGINT spec can prove in-flight downloads were really aborted and queued ones never started.

export interface SitePage {
 url: string;
 assets: string[];
}

export interface CallRecord {
 url: string;
 status: 'started' | 'completed' | 'aborted';
}

export interface SiteApiOptions {
 latency?: number;
 jitter?: number;
 trace?: (line: string) => void;
}

/** Thrown/rejected when a download is aborted mid-latency. Shaped like a DOM AbortError. */
export class AbortError extends Error {
 override readonly name = 'AbortError';
 constructor(message = 'The operation was aborted') {
 super(message);
 }
}

const PAGES: SitePage[] = [
 { url: '/index.html', assets: ['/css/site.css', '/img/logo.png'] },
 { url: '/about.html', assets: ['/img/team.jpg'] },
 { url: '/blog/post-1.html', assets: ['/img/post-1-hero.jpg'] },
 { url: '/blog/post-2.html', assets: ['/img/post-2-hero.jpg'] },
];

export class SiteApi {
 readonly calls: CallRecord[] = [];
 private readonly latency: number;
 private readonly jitter: number;
 private readonly trace: (line: string) => void;

 constructor(options: SiteApiOptions = {}) {
 this.latency = options.latency ?? 30;
 this.jitter = options.jitter ?? 15;
 this.trace = options.trace ?? (() => {});
 }

 /** Full page list (the crawl step -- instant, no network in this mock). */
 crawl(): SitePage[] {
 return PAGES.map((p) => ({ url: p.url, assets: [...p.assets] }));
 }

 /** Downloads one URL (page or asset). Rejects with an AbortError the instant signal fires. */
 download(url: string, signal?: AbortSignal): Promise<string> {
 const record: CallRecord = { url, status: 'started' };
 this.calls.push(record);
 this.trace(`[site-api] GET ${url} started`);

 return new Promise<string>((resolve, reject) => {
 if (signal?.aborted) {
 record.status = 'aborted';
 this.trace(`[site-api] GET ${url} aborted`);
 reject(new AbortError());
 return;
 }

 const delay = Math.max(0, this.latency + Math.round((Math.random() * 2 - 1) * this.jitter));
 const timer = setTimeout(() => {
 signal?.removeEventListener('abort', onAbort);
 record.status = 'completed';
 this.trace(`[site-api] GET ${url} completed`);
 resolve(`content of ${url}`);
 }, delay);

 const onAbort = () => {
 clearTimeout(timer);
 record.status = 'aborted';
 this.trace(`[site-api] GET ${url} aborted`);
 reject(new AbortError());
 };

 signal?.addEventListener('abort', onAbort);
 });
 }
}

export function createSiteApi(options?: SiteApiOptions): SiteApi {
 return new SiteApi(options);
}
