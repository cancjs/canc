// Shared types and the usage log, used by both flavors. Nothing cancellation-specific lives here.

export interface ChatRequest {
 prompt: string;
}

export interface UsageEntry {
 prompt: string;
 tokens: number;
 canceled: boolean;
}

/** In-memory usage/billing log. A real app would persist this; here it proves what got billed. */
export class UsageLog {
 readonly entries: UsageEntry[] = [];

 record(entry: UsageEntry): void {
 this.entries.push(entry);
 }
}
