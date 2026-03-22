// ============================================================================
// AUTH ROUTES
// POST /login, POST /register, POST /refresh-token
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import * as authService from "../../services/auth/auth.service";
import { sendSuccess } from "../../utils/response";
import { ValidationError } from "../../utils/errors";

const router = Router();

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------
const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

const registerSchema = z.object({
  orgName: z.string().min(2, "Organization name is required"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  country: z.string().optional(),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
});

const ssoSchema = z.object({
  token: z.string().min(1, "SSO token is required"),
});

// ---------------------------------------------------------------------------
// POST /login
// ---------------------------------------------------------------------------
router.post("/login", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      const details: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join(".");
        details[key] = details[key] || [];
        details[key].push(issue.message);
      }
      throw new ValidationError("Invalid input", details);
    }

    const result = await authService.login(parsed.data.email, parsed.data.password);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /register
// ---------------------------------------------------------------------------
router.post("/register", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      const details: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join(".");
        details[key] = details[key] || [];
        details[key].push(issue.message);
      }
      throw new ValidationError("Invalid input", details);
    }

    const result = await authService.register(parsed.data);
    sendSuccess(res, result, 201);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /sso — exchange EMP Cloud SSO token for Recruit tokens
// ---------------------------------------------------------------------------
router.post("/sso", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = ssoSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError("SSO token is required");
    }

    const result = await authService.ssoLogin(parsed.data.token);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /refresh-token
// ---------------------------------------------------------------------------
router.post("/refresh-token", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = refreshSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError("Refresh token is required");
    }

    const tokens = await authService.refreshToken(parsed.data.refreshToken);
    sendSuccess(res, tokens);
  } catch (err) {
    next(err);
  }
});

export { router as authRoutes };
