// ============================================================================
// MEDIA PROBE — extract the real duration (seconds) of an audio/video file using
// the bundled ffprobe binary (ffprobe-static, no system ffmpeg required).
// Returns null if probing fails so callers can degrade gracefully.
// ============================================================================

import { execFile } from "child_process";
import { promisify } from "util";
import { logger } from "../../utils/logger";

const execFileAsync = promisify(execFile);

export async function probeDurationSeconds(filePath: string): Promise<number | null> {
  try {
    // ffprobe-static exposes the platform binary path as its default export.
    const ffprobe = (await import("ffprobe-static")).default;
    const bin = ffprobe.path;
    const { stdout } = await execFileAsync(bin, [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      filePath,
    ]);
    const seconds = Math.round(parseFloat(String(stdout).trim()));
    return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
  } catch (err) {
    logger.warn(`ffprobe duration extraction failed for ${filePath}: ${(err as Error).message}`);
    return null;
  }
}
