// placeholder, see example task

export interface Profile {
 id: string;
 name: string;
}

// Stands in for a network round trip. Resolves after `ms`, honoring an optional abort signal.
export function loadProfile(id: string, ms: number, signal?: AbortSignal): Promise<Profile> {
 return new Promise((resolve, reject) => {
 const timer = setTimeout(() => resolve({ id, name: 'Ada' }), ms);
 if (signal) {
 signal.addEventListener('abort', () => {
 clearTimeout(timer);
 reject(new DOMException('Aborted', 'AbortError'));
 });
 }
 });
}
