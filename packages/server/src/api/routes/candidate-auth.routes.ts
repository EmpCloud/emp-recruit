// ============================================================================
// CANDIDATE AUTH ROUTES (Public Portal)
//
// Password-based auth. OTP is used only for email verification at sign-up.
// Mounted at /api/v1/candidate-auth.
//   POST  /register             { email, password, first_name, last_name?, phone? }  -> { token, account, dev_code? }
//   POST  /login                { email, password }                                  -> { token, account }
//   GET   /me                                                                        (auth) profile
//   PATCH /me                                                                         (auth) update profile
//   POST  /verify-email         { code }                                              (auth) verify email
//   POST  /resend-verification                                                        (auth) resend the code
//   POST  /set-password         { password }                                          (auth) change password
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { sendSuccess } from "../../utils/response";
import { authenticateCandidate } from "../middleware/candidate-auth.middleware";
import * as auth from "../../services/portal/candidate-auth.service";

const router = Router();

// --- Public -----------------------------------------------------------------
router.post("/register", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password, first_name, last_name, phone } = req.body || {};
    const result = await auth.register({ email, password, first_name, last_name, phone });
    return sendSuccess(res, result, 201);
  } catch (err) {
    next(err);
  }
});

router.post("/login", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body || {};
    const result = await auth.passwordLogin(email, password);
    return sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// --- Authenticated ----------------------------------------------------------
router.get("/me", authenticateCandidate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    return sendSuccess(res, await auth.getProfile(req.candidateAccount!.id));
  } catch (err) {
    next(err);
  }
});

router.patch("/me", authenticateCandidate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    return sendSuccess(res, await auth.updateProfile(req.candidateAccount!.id, req.body || {}));
  } catch (err) {
    next(err);
  }
});

router.post("/verify-email", authenticateCandidate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const account = await auth.verifyEmail(req.candidateAccount!.id, (req.body || {}).code);
    return sendSuccess(res, { account });
  } catch (err) {
    next(err);
  }
});

router.post("/resend-verification", authenticateCandidate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    return sendSuccess(res, await auth.resendVerification(req.candidateAccount!.id));
  } catch (err) {
    next(err);
  }
});

router.post("/set-password", authenticateCandidate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await auth.setPassword(req.candidateAccount!.id, (req.body || {}).password);
    return sendSuccess(res, { ok: true });
  } catch (err) {
    next(err);
  }
});

export { router as candidateAuthRoutes };
