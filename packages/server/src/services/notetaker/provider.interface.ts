// ============================================================================
// NOTETAKER PROVIDER INTERFACE
//
// A vendor-agnostic contract for sending a bot into a video meeting to record +
// transcribe. Recall.ai is the reference implementation (it supports Google
// Meet / Teams / Zoom bot-join). Swap in another vendor by implementing this.
// ============================================================================

export interface SendBotInput {
  meetingUrl: string;
  botName?: string;
  webhookUrl?: string; // where the vendor posts status/transcript events
}

export interface SendBotResult {
  botId: string;
  status: string;
}

export interface TranscriptResult {
  text: string;
  structured?: any; // speaker-labeled segments with timestamps
  durationSeconds?: number;
}

export interface INotetakerProvider {
  readonly provider: string;
  isConfigured(): boolean;

  /** Dispatch a bot to join + record the meeting. */
  sendBot(input: SendBotInput): Promise<SendBotResult>;

  /** Fetch the transcript for a completed bot session. */
  getTranscript(botId: string): Promise<TranscriptResult>;

  /** Parse an incoming webhook payload into a normalized event. */
  parseWebhook(body: any): { botId: string; status: string; ready: boolean };

  /** Remove/stop a bot (cleanup). */
  removeBot(botId: string): Promise<void>;
}

export class NotetakerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotetakerError";
  }
}
