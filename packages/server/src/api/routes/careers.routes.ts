// ============================================================================
// CAREERS ROUTES (Public Portal)
//
// Cross-org public job board + apply flow. Mounted at /api/v1/careers.
//   GET  /jobs                 public: list all orgs' published jobs
//   GET  /jobs/:idOrSlug       public: job detail
//   POST /jobs/:jobId/apply    (candidate auth) apply + resume (multipart)
//   GET  /my/applications      (candidate auth) my applications across orgs
//   GET  /resume/:id           (candidate auth OR recruiter) stream resume bytes
//
// Resume uploads use multer MEMORY storage (buffer) — the bytes go straight
// into MySQL via resume-store.service, never to local disk.
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import { sendSuccess, sendPaginated } from "../../utils/response";
import { ValidationError } from "../../utils/errors";
import { authenticateCandidate } from "../middleware/candidate-auth.middleware";
import * as careers from "../../services/portal/careers.service";
import { getResumeContentForAccount } from "../../services/portal/resume-store.service";

const router = Router();

// In-memory upload → buffer → MySQL BLOB. 8 MB cap mirrors resume-store.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

// ---------------------------------------------------------------------------
// Public job board (no auth)
// ---------------------------------------------------------------------------
router.get("/jobs", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await careers.listPublicJobs({
      page: req.query.page ? Number(req.query.page) : 1,
      perPage: req.query.per_page ? Number(req.query.per_page) : 10,
      search: req.query.search as string | undefined,
      location: req.query.location as string | undefined,
      employmentType: req.query.employment_type as string | undefined,
      organizationId: req.query.organization_id ? Number(req.query.organization_id) : undefined,
    });
    return sendPaginated(res, result.data, result.total, result.page, result.perPage);
  } catch (err) {
    next(err);
  }
});

router.get("/jobs/:idOrSlug", async (req: Request, res: Response, next: NextFunction) => {
  try {
    return sendSuccess(res, await careers.getPublicJob(String(req.params.idOrSlug)));
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Apply (candidate auth) — multipart: resume file + { cover_letter?, use_default? }
// ---------------------------------------------------------------------------
router.post(
  "/jobs/:jobId/apply",
  authenticateCandidate,
  upload.single("resume"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const file = (req as any).file as Express.Multer.File | undefined;
      const useDefault = String((req.body || {}).use_default_resume) === "true";
      if (!file && !useDefault) {
        throw new ValidationError("Attach a resume, or set use_default_resume=true");
      }
      const result = await careers.apply({
        accountId: req.candidateAccount!.id,
        jobId: String(req.params.jobId),
        coverLetter: (req.body || {}).cover_letter,
        resume: file
          ? { buffer: file.buffer, fileName: file.originalname, mimeType: file.mimetype }
          : null,
        useDefaultResume: useDefault,
      });
      return sendSuccess(res, result, 201);
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// My applications (candidate auth)
// ---------------------------------------------------------------------------
router.get("/my/applications", authenticateCandidate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    return sendSuccess(res, await careers.myApplications(req.candidateAccount!.id));
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Resume download/preview (candidate auth) — streams the BLOB from MySQL.
// ---------------------------------------------------------------------------
router.get("/resume/:id", authenticateCandidate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Ownership-scoped: a candidate may only fetch a resume that belongs to their
    // own account (prevents IDOR / enumerating other candidates' resumes).
    const accountId = req.candidateAccount!.id;
    const { fileName, mimeType, content } = await getResumeContentForAccount(String(req.params.id), accountId);
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Content-Disposition", `inline; filename="${fileName.replace(/"/g, "")}"`);
    return res.send(content);
  } catch (err) {
    next(err);
  }
});

export { router as careersRoutes };
