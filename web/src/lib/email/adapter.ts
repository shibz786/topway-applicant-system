import "server-only";

// Same adapter pattern as storage/adapter.ts and kv/adapter.ts. Today this
// resolves to a local stand-in that logs what would be sent instead of
// sending it. Set RESEND_API_KEY in .env and swap in a real Resend-backed
// implementation behind this same interface.
export interface EmailSender {
  send(input: { to: string; subject: string; body: string }): Promise<void>;
}

import { localEmailLog } from "./local-adapter";

export const email: EmailSender = localEmailLog;
