// ============================================================================
// PORTAL AUTH MIDDLEWARE
// Verifies portal JWT tokens (separate from employee auth).
// Portal tokens are issued to candidates via magic link — no EmpCloud account
// is required.
// ============================================================================

import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../../config";
import { AppError } from "../../utils/errors";

export interface PortalCandidate {
  id: string;
  email: string;
  orgId: number;
}

declare global {
  namespace Express {
    interface Request {
      candidate?: PortalCandidate;
    }
  }
}

const PORTAL_TOKEN_ISSUER = "emp-recruit-portal";

export function portalAuthenticate(req: Request, _res: Response, next: NextFunction) {
  // Accept token from Authorization header or query parameter
  const header = req.headers.authorization;
  const queryToken = req.query.token as string | undefined;

  if (!header?.startsWith("Bearer ") && !queryToken) {
    return next(new AppError(401, "UNAUTHORIZED", "Missing or invalid portal access token"));
  }

  const token = queryToken || header!.slice(7);

  try {
    const payload = jwt.verify(token, config.jwt.secret, {
      issuer: PORTAL_TOKEN_ISSUER,
    }) as any;

    // Validate that this is actually a portal token
    if (payload.type !== "portal") {
      return next(new AppError(401, "INVALID_TOKEN", "Invalid portal token"));
    }

    req.candidate = {
      id: payload.candidateId,
      email: payload.email,
      orgId: payload.orgId,
    };

    next();
  } catch (err: any) {
    if (err.name === "TokenExpiredError") {
      return next(
        new AppError(401, "TOKEN_EXPIRED", "Your portal access link has expired. Please request a new one."),
      );
    }
    return next(new AppError(401, "INVALID_TOKEN", "Invalid portal access token"));
  }
}
