// ============================================================================
// NOTETAKER ROUTES — AI interview assistant. Mounted at /api/v1/notetaker.
//   POST /interviews/:id/dispatch        (auth) send the bot into the meeting
//   GET  /interviews/:id                 (auth) session status + AI evaluation
//   POST /interviews/:id/evaluate        (auth) evaluate a pasted transcript
//   GET  /status                         (auth) is the notetaker configured?
//   POST /webhook                        (public) vendor posts events here
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { authenticate, authorize } from "../middleware/auth.middleware";
import { sendSuccess } from "../../utils/response";
import * as notetaker from "../../services/notetaker/notetaker.service";

const router = Router();
const ROLES = ["super_admin", "org_admin", "hr_admin", "hr_manager"] as const;

// --- Public webhook (vendor → us). MUST be before the auth guard. -----------
router.post("/webhook", async (req: Request, res: Response) => {
  try {
    await notetaker.handleWebhook(req.body || {});
  } catch {
    /* swallow — never make the vendor retry-storm on our error */
  }
  // Always 200 so the vendor considers delivery successful.
  return res.status(200).json({ received: true });
});

// --- Authenticated routes ---------------------------------------------------
router.get("/status", authenticate, async (_req: Request, res: Response) => {
  return sendSuccess(res, { configured: notetaker.isConfigured() });
});

router.post(
  "/interviews/:id/dispatch",
  authenticate,
  authorize(...ROLES),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await notetaker.dispatchBot(req.user!.empcloudOrgId, String(req.params.id));
      return sendSuccess(res, result, 201);
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  "/interviews/:id",
  authenticate,
  authorize(...ROLES),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      return sendSuccess(res, await notetaker.getSession(req.user!.empcloudOrgId, String(req.params.id)));
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  "/interviews/:id/evaluate",
  authenticate,
  authorize(...ROLES),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await notetaker.evaluateManualTranscript(
        req.user!.empcloudOrgId,
        String(req.params.id),
        (req.body || {}).transcript,
      );
      return sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  },
);

export { router as notetakerRoutes };
