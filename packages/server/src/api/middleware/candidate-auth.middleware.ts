// ============================================================================
// CANDIDATE AUTH MIDDLEWARE (Portal)
//
// Guards candidate-portal routes. Validates the candidate JWT (type:"candidate")
// and attaches req.candidate = { id, email }. Separate from the recruiter
// authenticate() middleware so the two token types never cross over.
// ============================================================================

import { Request, Response, NextFunction } from "express";
import { AppError } from "../../utils/errors";
import { verifyCandidateToken } from "../../services/portal/candidate-auth.service";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      // Distinct from the legacy `candidate` (magic-link portal). This is the
      // public OTP-portal account identity.
      candidateAccount?: { id: string; email: string };
    }
  }
}

export function authenticateCandidate(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return next(new AppError(401, "UNAUTHORIZED", "Sign in to continue"));
  }
  const token = header.slice(7);
  try {
    const payload = verifyCandidateToken(token);
    req.candidateAccount = { id: payload.sub, email: payload.email };
    next();
  } catch (err: any) {
    if (err?.name === "TokenExpiredError") {
      return next(new AppError(401, "TOKEN_EXPIRED", "Your session has expired — please sign in again"));
    }
    return next(new AppError(401, "INVALID_TOKEN", "Invalid session"));
  }
}
