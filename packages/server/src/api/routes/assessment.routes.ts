// ============================================================================
// PSYCHOMETRIC ASSESSMENT ROUTES
// POST /templates               — Create assessment template (HR)
// GET  /templates               — List templates
// GET  /templates/:id           — Get template
// POST /invite                  — Invite candidate (HR)
// GET  /take/:token             — Get assessment (PUBLIC — starts it)
// POST /submit/:token           — Submit assessment (PUBLIC)
// GET  /candidate/:candidateId  — List assessments for a candidate
// GET  /:id/results             — Get assessment results
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { authenticate, authorize } from "../middleware/auth.middleware";
import { sendSuccess } from "../../utils/response";
import { ValidationError } from "../../utils/errors";
import * as assessmentService from "../../services/assessment/assessment.service";
import {
  createAssessmentTemplateSchema,
  inviteCandidateAssessmentSchema,
  submitAssessmentSchema,
} from "@emp-recruit/shared";

const router = Router();

// ---------------------------------------------------------------------------
// PUBLIC routes (no auth — accessed via token)
// ---------------------------------------------------------------------------

// GET /take/:token — Get assessment questions (PUBLIC — starts the assessment)
router.get(
  "/take/:token",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await assessmentService.getAssessmentByToken(String(req.params.token));
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  },
);

// POST /submit/:token — Submit assessment answers (PUBLIC)
router.post(
  "/submit/:token",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = submitAssessmentSchema.safeParse(req.body);
      if (!parsed.success) {
        const details: Record<string, string[]> = {};
        for (const issue of parsed.error.issues) {
          const key = issue.path.join(".");
          details[key] = details[key] || [];
          details[key].push(issue.message);
        }
        throw new ValidationError("Invalid input", details);
      }

      const result = await assessmentService.submitAssessment(
        String(req.params.token),
        parsed.data.answers,
      );
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// AUTHENTICATED routes (HR/Admin)
// ---------------------------------------------------------------------------

// POST /templates — Create assessment template
router.post(
  "/templates",
  authenticate,
  authorize("super_admin", "org_admin", "hr_admin", "hr_manager"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = createAssessmentTemplateSchema.safeParse(req.body);
      if (!parsed.success) {
        const details: Record<string, string[]> = {};
        for (const issue of parsed.error.issues) {
          const key = issue.path.join(".");
          details[key] = details[key] || [];
          details[key].push(issue.message);
        }
        throw new ValidationError("Invalid input", details);
      }

      const orgId = req.user!.empcloudOrgId;
      const result = await assessmentService.createTemplate(orgId, parsed.data);
      sendSuccess(res, result, 201);
    } catch (err) {
      next(err);
    }
  },
);

// GET /templates — List templates
router.get(
  "/templates",
  authenticate,
  authorize("super_admin", "org_admin", "hr_admin", "hr_manager"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const { assessment_type } = req.query;
      const result = await assessmentService.listTemplates(orgId, {
        assessment_type: assessment_type as any,
      });
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  },
);

// GET /templates/:id — Get single template
router.get(
  "/templates/:id",
  authenticate,
  authorize("super_admin", "org_admin", "hr_admin", "hr_manager"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const result = await assessmentService.getTemplate(orgId, String(req.params.id));
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  },
);

// POST /invite — Invite candidate to take assessment
router.post(
  "/invite",
  authenticate,
  authorize("super_admin", "org_admin", "hr_admin", "hr_manager"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = inviteCandidateAssessmentSchema.safeParse(req.body);
      if (!parsed.success) {
        const details: Record<string, string[]> = {};
        for (const issue of parsed.error.issues) {
          const key = issue.path.join(".");
          details[key] = details[key] || [];
          details[key].push(issue.message);
        }
        throw new ValidationError("Invalid input", details);
      }

      const orgId = req.user!.empcloudOrgId;
      const result = await assessmentService.inviteCandidate(orgId, parsed.data);
      sendSuccess(res, result, 201);
    } catch (err) {
      next(err);
    }
  },
);

// GET /candidate/:candidateId — List assessments for a candidate
router.get(
  "/candidate/:candidateId",
  authenticate,
  authorize("super_admin", "org_admin", "hr_admin", "hr_manager"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const result = await assessmentService.listCandidateAssessments(
        orgId,
        String(req.params.candidateId),
      );
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  },
);

// GET /:id/results — Get assessment results
router.get(
  "/:id/results",
  authenticate,
  authorize("super_admin", "org_admin", "hr_admin", "hr_manager"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const result = await assessmentService.getAssessmentResults(orgId, String(req.params.id));
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  },
);

export { router as assessmentRoutes };
