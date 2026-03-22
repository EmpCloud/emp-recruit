// ============================================================================
// CANDIDATE COMPARISON ROUTES
// POST /compare — Compare 2-5 candidates side-by-side
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { authenticate, authorize } from "../middleware/auth.middleware";
import { sendSuccess } from "../../utils/response";
import * as comparisonService from "../../services/comparison/comparison.service";

const router = Router();

router.use(authenticate, authorize("super_admin", "org_admin", "hr_admin", "hr_manager"));

// POST /compare — Compare candidates
router.post(
  "/compare",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const { applicationIds } = req.body;
      const comparison = await comparisonService.compareCandidates(orgId, applicationIds);
      sendSuccess(res, comparison);
    } catch (err) {
      next(err);
    }
  },
);

export { router as comparisonRoutes };
