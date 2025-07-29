export interface ManifestEntry {
 url: string;
 status: 'saved' | 'aborted' | 'queued';
}

export interface Manifest {
 partial: boolean;
 entries: ManifestEntry[];
}
