// Wire protocol shared by both server flavors and the browser client. Non-sensitive glue: no
// cancellation concepts live here, so there is no vanilla/canc twin of this file.

/** Client -> server. */
export type ClientMessage =
 | { type: 'start'; jobId: string }
 | { type: 'cancel'; jobId: string };

/** Server -> client. */
export type ServerMessage =
 | { type: 'progress'; jobId: string; percent: number }
 | { type: 'done'; jobId: string }
 | { type: 'canceled'; jobId: string };

export function parseClientMessage(raw: string): ClientMessage | undefined {
 try {
 const value = JSON.parse(raw) as ClientMessage;
 if (value && (value.type === 'start' || value.type === 'cancel') && typeof value.jobId === 'string') {
 return value;
 }
 } catch {
 // Ignore malformed frames.
 }
 return undefined;
}
