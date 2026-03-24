// ============================================================================
// AI JOB DESCRIPTION GENERATOR ROUTES
// POST /generate-description — Generate a job description from basic inputs
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { authenticate, authorize } from "../middleware/auth.middleware";
import { sendSuccess } from "../../utils/response";
import { ValidationError } from "../../utils/errors";
import * as jdService from "../../services/job-description/job-description.service";
import { generateJobDescriptionSchema } from "@emp-recruit/shared";

const router = Router();

// POST /generate-description — Generate a job description
router.post(
  "/generate-description",
  authenticate,
  authorize("super_admin", "org_admin", "hr_admin", "hr_manager"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = generateJobDescriptionSchema.safeParse(req.body);
      if (!parsed.success) {
        const details: Record<string, string[]> = {};
        for (const issue of parsed.error.issues) {
          const key = issue.path.join(".");
          details[key] = details[key] || [];
          details[key].push(issue.message);
        }
        throw new ValidationError("Invalid input", details);
      }

      const result = await jdService.generateJobDescription(parsed.data);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  },
);

export { router as jobDescriptionRoutes };
