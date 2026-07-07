// ============================================================================
// RECALL.AI NOTETAKER PROVIDER
//
// Sends a bot into Google Meet / Teams / Zoom, records, and transcribes. Recall
// is the standard API that supports programmatic bot-join across all three.
//
// Env: RECALL_API_KEY, RECALL_REGION (default "us-east-1")
// Docs shape (v1): POST /api/v1/bot with { meeting_url, bot_name,
//   transcription_options, real_time_transcription/webhook }.
// ============================================================================

import {
  INotetakerProvider,
  SendBotInput,
  SendBotResult,
  TranscriptResult,
  NotetakerError,
} from "./provider.interface";

function base(): string {
  const region = process.env.RECALL_REGION || "us-east-1";
  return `https://${region}.recall.ai/api/v1`;
}

function headers(): Record<string, string> {
  return {
    authorization: `Token ${process.env.RECALL_API_KEY}`,
    "content-type": "application/json",
  };
}

export class RecallProvider implements INotetakerProvider {
  readonly provider = "recall";

  isConfigured(): boolean {
    return !!process.env.RECALL_API_KEY;
  }

  async sendBot(input: SendBotInput): Promise<SendBotResult> {
    const res = await fetch(`${base()}/bot`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        meeting_url: input.meetingUrl,
        bot_name: input.botName || "EMP Recruit Notetaker",
        transcription_options: { provider: "meeting_captions" },
        // Recall posts status changes here; we react on "done".
        ...(input.webhookUrl ? { webhook_url: input.webhookUrl } : {}),
      }),
    });
    if (!res.ok) throw new NotetakerError(`Recall sendBot failed ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const j: any = await res.json();
    return { botId: j.id, status: j.status_changes?.slice(-1)?.[0]?.code || "requested" };
  }

  async getTranscript(botId: string): Promise<TranscriptResult> {
    const res = await fetch(`${base()}/bot/${botId}/transcript`, { headers: headers() });
    if (!res.ok) throw new NotetakerError(`Recall getTranscript failed ${res.status}`);
    const segments = (await res.json()) as any[];
    // Recall returns an array of { speaker, words: [{ text, start_timestamp }] }.
    const text = segments
      .map((s) => `${s.speaker || "Speaker"}: ${(s.words || []).map((w: any) => w.text).join(" ")}`)
      .join("\n");
    const lastWord = segments.at(-1)?.words?.at(-1);
    return {
      text,
      structured: segments,
      durationSeconds: lastWord?.end_timestamp ? Math.round(lastWord.end_timestamp) : undefined,
    };
  }

  parseWebhook(body: any): { botId: string; status: string; ready: boolean } {
    // Recall webhook: { event, data: { bot_id, status: { code } } }
    const botId = body?.data?.bot_id || body?.bot_id;
    const status = body?.data?.status?.code || body?.event || "unknown";
    const ready = status === "done" || status === "call_ended" || status === "analysis_done";
    return { botId, status, ready };
  }

  async removeBot(botId: string): Promise<void> {
    await fetch(`${base()}/bot/${botId}/leave_call`, { method: "POST", headers: headers() }).catch(() => {});
  }
}
