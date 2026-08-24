import "server-only";
import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { EmailSender } from "./adapter";

// Local dev stand-in — appends a line per "sent" email to a gitignored log
// file instead of actually sending, so lockout-alert behavior is
// verifiable (grep the log) without a real Resend account. Never used in
// production; the whole point of this file existing separately from
// adapter.ts is that it's the one thing that changes when real credentials
// arrive.
const LOG_DIR = join(process.cwd(), ".local-storage");
const LOG_PATH = join(LOG_DIR, "emails.log");

export const localEmailLog: EmailSender = {
  async send({ to, subject, body }) {
    await mkdir(LOG_DIR, { recursive: true });
    const line = JSON.stringify({ at: new Date().toISOString(), to, subject, body }) + "\n";
    await appendFile(LOG_PATH, line, "utf-8");
  },
};
