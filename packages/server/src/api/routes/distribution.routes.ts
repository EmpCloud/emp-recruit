// ============================================================================
// JOB DISTRIBUTION ROUTES
// Publish a job to external portals. Mounted at /api/v1/distribution.
//   GET  /portals                      (auth) available portals + modes
//   GET  /jobs/:jobId                   (auth) distribution status for a job
//   POST /jobs/:jobId/publish           (auth) publish/prepare to a portal
//   POST /jobs/:jobId/mark-posted       (auth) confirm an assisted post went live
//   GET  /portals/:portal/credentials   (auth) is a portal connected? (masked)
//   PUT  /portals/:portal/credentials   (auth) save API credentials for a portal
//   DELETE /portals/:portal/credentials (auth) disconnect a portal
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { authenticate, authorize } from "../middleware/auth.middleware";
import { sendSuccess } from "../../utils/response";
import * as distribution from "../../services/distribution/distribution.service";

const router = Router();
const ROLES = ["super_admin", "org_admin", "hr_admin", "hr_manager"] as const;

router.use(authenticate, authorize(...ROLES));

router.get("/portals", async (req: Request, res: Response, next: NextFunction) => {
  try {
    return sendSuccess(res, await distribution.listPortals(req.user!.empcloudOrgId));
  } catch (err) {
    next(err);
  }
});

router.get("/jobs/:jobId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    return sendSuccess(res, await distribution.listForJob(req.user!.empcloudOrgId, String(req.params.jobId)));
  } catch (err) {
    next(err);
  }
});

router.post("/jobs/:jobId/publish", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await distribution.publish(
      req.user!.empcloudOrgId,
      String(req.params.jobId),
      String((req.body || {}).portal),
      req.user!.empcloudUserId,
    );
    return sendSuccess(res, result, 201);
  } catch (err) {
    next(err);
  }
});

router.post("/jobs/:jobId/mark-posted", async (req: Request, res: Response, next: NextFunction) => {
  try {
    await distribution.markPosted(
      req.user!.empcloudOrgId,
      String(req.params.jobId),
      String((req.body || {}).portal),
      (req.body || {}).external_url,
    );
    return sendSuccess(res, { ok: true });
  } catch (err) {
    next(err);
  }
});

// --- Per-portal API credentials (Settings → Job Portals) --------------------
router.get("/portals/:portal/credentials", async (req: Request, res: Response, next: NextFunction) => {
  try {
    return sendSuccess(res, await distribution.getCredentialsStatus(req.user!.empcloudOrgId, String(req.params.portal)));
  } catch (err) {
    next(err);
  }
});

router.put("/portals/:portal/credentials", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await distribution.saveCredentials(
      req.user!.empcloudOrgId,
      String(req.params.portal),
      (req.body || {}).credentials || req.body || {},
    );
    return sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

router.delete("/portals/:portal/credentials", async (req: Request, res: Response, next: NextFunction) => {
  try {
    await distribution.deleteCredentials(req.user!.empcloudOrgId, String(req.params.portal));
    return sendSuccess(res, { ok: true });
  } catch (err) {
    next(err);
  }
});

export { router as distributionRoutes };
