import { Router, Request, Response, NextFunction } from "express";
import { authenticate, authorize } from "../middleware/auth.middleware";
import { sendSuccess } from "../../utils/response";
import { NotFoundError, ValidationError } from "../../utils/errors";
import { idParamSchema } from "@emp-recruit/shared";
import * as scoringService from "../../services/scoring/resume-scoring.service";

const router = Router();

// All scoring routes require authentication and HR roles
router.use(authenticate, authorize("super_admin", "org_admin", "hr_admin", "hr_manager"));

// POST /applications/:appId/score — score a single application
router.post(
  "/applications/:appId/score",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const appId = req.params.appId;
      if (!appId) throw new ValidationError("Application ID is required");

      const orgId = req.user!.empcloudOrgId;

      // Get the application to find candidate_id and job_id
      const { getDB } = await import("../../db/adapters");
      const db = getDB();
      const app = await db.findOne<any>("applications", {
        id: appId,
        organization_id: orgId,
      });
      if (!app) throw new NotFoundError("Application", appId);

      const result = await scoringService.scoreCandidate(
        orgId,
        app.candidate_id,
        app.job_id,
        appId,
      );

      return sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  },
);

// POST /jobs/:jobId/batch-score — score all applications for a job
router.post(
  "/jobs/:jobId/batch-score",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const jobId = req.params.jobId;
      if (!jobId) throw new ValidationError("Job ID is required");

      const orgId = req.user!.empcloudOrgId;
      const result = await scoringService.batchScoreCandidates(orgId, jobId);

      return sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  },
);

// GET /applications/:appId — get score report for an application
router.get(
  "/applications/:appId",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const appId = req.params.appId;
      if (!appId) throw new ValidationError("Application ID is required");

      const orgId = req.user!.empcloudOrgId;
      const score = await scoringService.getScoreReport(orgId, appId);

      if (!score) {
        throw new NotFoundError("Score report for application", appId);
      }

      return sendSuccess(res, score);
    } catch (err) {
      next(err);
    }
  },
);

// GET /jobs/:jobId/rankings — get all scored applications ranked by score
router.get(
  "/jobs/:jobId/rankings",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const jobId = req.params.jobId;
      if (!jobId) throw new ValidationError("Job ID is required");

      const orgId = req.user!.empcloudOrgId;
      const rankings = await scoringService.getJobRankings(orgId, jobId);

      return sendSuccess(res, rankings);
    } catch (err) {
      next(err);
    }
  },
);

export { router as scoringRoutes };
