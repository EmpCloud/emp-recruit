// ============================================================================
// MEETING ROUTES
//
// OAuth "Sign in with Google/Microsoft/Zoom" + create meeting for an interview.
// Mounted at /api/v1/meetings.
//   GET  /connections                 (auth) provider status for the org
//   GET  /oauth/:provider/start       (auth) -> returns consent URL to redirect to
//   GET  /oauth/:provider/callback    (public) provider redirects here
//   DELETE /connections/:provider     (auth) disconnect
//   POST /interviews/:id/meeting      (auth) create meeting link for interview
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { authenticate, authorize } from "../middleware/auth.middleware";
import { sendSuccess } from "../../utils/response";
import { config } from "../../config";
import * as meetings from "../../services/meetings/meeting.service";

const router = Router();

const CONNECT_ROLES = ["super_admin", "org_admin", "hr_admin", "hr_manager"] as const;

// --- Provider connection status (auth) --------------------------------------
router.get("/connections", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    return sendSuccess(res, await meetings.listConnections(req.user!.empcloudOrgId));
  } catch (err) {
    next(err);
  }
});

// --- Begin OAuth (auth) → returns the consent URL --------------------------
router.get(
  "/oauth/:provider/start",
  authenticate,
  authorize(...CONNECT_ROLES),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const url = await meetings.beginOAuth(
        req.user!.empcloudOrgId,
        req.user!.empcloudUserId,
        String(req.params.provider),
        (req.query.redirect_after as string) || undefined,
      );
      return sendSuccess(res, { authUrl: url });
    } catch (err) {
      next(err);
    }
  },
);

// --- OAuth callback (PUBLIC — provider redirects the browser here) ----------
router.get("/oauth/:provider/callback", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const code = req.query.code as string;
    const state = req.query.state as string;
    const errParam = req.query.error as string;
    const appBase = process.env.PUBLIC_APP_URL || config.cors.origin || "http://localhost:5179";

    if (errParam) {
      return res.redirect(`${appBase}/settings?meeting_error=${encodeURIComponent(errParam)}`);
    }
    if (!code || !state) {
      return res.redirect(`${appBase}/settings?meeting_error=missing_code`);
    }
    const { redirectAfter } = await meetings.completeOAuth(String(req.params.provider), code, state);
    const dest = redirectAfter || `${appBase}/settings?meeting_connected=${String(req.params.provider)}`;
    return res.redirect(dest);
  } catch (err) {
    next(err);
  }
});

// --- Disconnect (auth) ------------------------------------------------------
router.delete(
  "/connections/:provider",
  authenticate,
  authorize(...CONNECT_ROLES),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await meetings.disconnect(req.user!.empcloudOrgId, String(req.params.provider));
      return sendSuccess(res, { ok: true });
    } catch (err) {
      next(err);
    }
  },
);

// --- Create a meeting link for an interview (auth) --------------------------
router.post(
  "/interviews/:id/meeting",
  authenticate,
  authorize(...CONNECT_ROLES),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await meetings.createMeetingForInterview(
        req.user!.empcloudOrgId,
        String(req.params.id),
        (req.body || {}).provider,
        (req.body || {}).attendee_emails,
      );
      return sendSuccess(res, result, 201);
    } catch (err) {
      next(err);
    }
  },
);

export { router as meetingRoutes };
