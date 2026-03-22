// ============================================================================
// PIPELINE STAGE ROUTES
// GET    /stages          — Get stages for org
// POST   /stages          — Create custom stage (admin)
// PUT    /stages/:id      — Update stage
// DELETE /stages/:id      — Delete stage
// PUT    /stages/reorder  — Reorder stages
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { authenticate, authorize } from "../middleware/auth.middleware";
import { sendSuccess } from "../../utils/response";
import * as pipelineService from "../../services/pipeline/pipeline.service";

const router = Router();

router.use(authenticate);

// GET /stages — Get stages for org
router.get(
  "/stages",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const stages = await pipelineService.getOrgStages(orgId);
      sendSuccess(res, stages);
    } catch (err) {
      next(err);
    }
  },
);

// PUT /stages/reorder — Reorder stages (must be before /:id to avoid route conflict)
router.put(
  "/stages/reorder",
  authorize("super_admin", "org_admin", "hr_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const stages = await pipelineService.reorderStages(orgId, req.body);
      sendSuccess(res, stages);
    } catch (err) {
      next(err);
    }
  },
);

// POST /stages — Create custom stage (admin)
router.post(
  "/stages",
  authorize("super_admin", "org_admin", "hr_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const stage = await pipelineService.createStage(orgId, req.body);
      sendSuccess(res, stage, 201);
    } catch (err) {
      next(err);
    }
  },
);

// PUT /stages/:id — Update stage
router.put(
  "/stages/:id",
  authorize("super_admin", "org_admin", "hr_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const stage = await pipelineService.updateStage(orgId, req.params.id, req.body);
      sendSuccess(res, stage);
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /stages/:id — Delete stage
router.delete(
  "/stages/:id",
  authorize("super_admin", "org_admin", "hr_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      await pipelineService.deleteStage(orgId, req.params.id);
      sendSuccess(res, { deleted: true });
    } catch (err) {
      next(err);
    }
  },
);

export { router as pipelineRoutes };
