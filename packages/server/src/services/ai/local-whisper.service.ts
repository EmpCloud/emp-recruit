// ============================================================================
// LOCAL WHISPER — free, offline speech-to-text using transformers.js (ONNX
// Whisper). No API key, no C++ build. The model is downloaded once on first use
// and cached under node_modules/.cache. Audio is decoded to 16kHz mono PCM with
// the bundled ffmpeg binary (ffmpeg-static) so ANY audio/video format works.
//
// This is intentionally lazy-loaded: the (~40-150MB) model + onnxruntime are
// only pulled in when transcription is actually requested, so normal server
// startup stays fast.
// ============================================================================

import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import os from "os";
import path from "path";
import { logger } from "../../utils/logger";

const execFileAsync = promisify(execFile);

// Which Whisper model to run. "tiny"/"base" are fast + small; "small" is more
// accurate. Overridable via LOCAL_WHISPER_MODEL. Default to base.en for a good
// speed/quality balance on English interviews.
const MODEL_ID = process.env.LOCAL_WHISPER_MODEL || "Xenova/whisper-base.en";

let pipelinePromise: Promise<any> | null = null;

async function getPipeline(): Promise<any> {
  if (!pipelinePromise) {
    logger.info(`Local Whisper: loading model ${MODEL_ID} (first run downloads it)…`);
    pipelinePromise = (async () => {
      const { pipeline } = await import("@huggingface/transformers");
      return pipeline("automatic-speech-recognition", MODEL_ID);
    })();
  }
  return pipelinePromise;
}

// Decode any media file to 16kHz mono Float32 PCM using bundled ffmpeg.
async function decodeToPcm(filePath: string): Promise<Float32Array> {
  const ffmpegStatic = (await import("ffmpeg-static")).default as unknown as string;
  const tmpWav = path.join(os.tmpdir(), `whisper-${Date.now()}-${Math.random().toString(36).slice(2)}.f32`);
  try {
    // -f f32le → raw 32-bit float little-endian; -ar 16000 → 16kHz; -ac 1 → mono.
    await execFileAsync(ffmpegStatic, [
      "-i", filePath,
      "-f", "f32le",
      "-ar", "16000",
      "-ac", "1",
      "-y", tmpWav,
    ]);
    const buf = await fs.promises.readFile(tmpWav);
    // Reinterpret the raw bytes as Float32.
    return new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.length / 4));
  } finally {
    fs.promises.unlink(tmpWav).catch(() => {});
  }
}

export async function transcribeLocally(filePath: string): Promise<string> {
  if (!fs.existsSync(filePath)) throw new Error(`Recording file not found at ${filePath}`);

  const audio = await decodeToPcm(filePath);
  const transcriber = await getPipeline();

  // chunk_length_s + stride let it handle long recordings; return_timestamps
  // gives us segment times to build a readable, timestamped transcript.
  const result: any = await transcriber(audio, {
    chunk_length_s: 30,
    stride_length_s: 5,
    return_timestamps: true,
  });

  if (Array.isArray(result?.chunks) && result.chunks.length) {
    return result.chunks
      .map((c: any) => {
        const start = Array.isArray(c.timestamp) ? c.timestamp[0] : 0;
        return `[${fmtTs(start || 0)}] ${String(c.text || "").trim()}`;
      })
      .join("\n");
  }
  const text = String(result?.text || "").trim();
  if (!text) throw new Error("Local transcription returned empty text");
  return text;
}

function fmtTs(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds || 0));
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

// Local Whisper is always "available" (no key needed) unless explicitly disabled.
export function isLocalWhisperEnabled(): boolean {
  return process.env.LOCAL_WHISPER_DISABLED !== "true";
}
