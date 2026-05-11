// ============================================================================
// ORGANIZATION ROUTES
// Read-only endpoints into the EmpCloud master DB for UI dropdowns etc.
// - GET /departments — list active departments for the current org
// - GET /locations   — list active locations for the current org
// - GET /users       — list active users for the current org (approver pickers)
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { authenticate } from "../middleware/auth.middleware";
import { getEmpCloudDB } from "../../db/empcloud";
import { sendSuccess } from "../../utils/response";

const router = Router();

router.use(authenticate);

// GET /departments — list departments for the caller's organization
router.get("/departments", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getEmpCloudDB();
    const rows = await db("organization_departments")
      .where({ organization_id: req.user!.empcloudOrgId, is_deleted: false })
      .select("id", "name")
      .orderBy("name", "asc");
    sendSuccess(res, rows);
  } catch (err) {
    next(err);
  }
});

// GET /locations — list locations for the caller's organization
router.get("/locations", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getEmpCloudDB();
    const rows = await db("organization_locations")
      .where({ organization_id: req.user!.empcloudOrgId, is_active: true })
      .select("id", "name", "address", "timezone")
      .orderBy("name", "asc");
    sendSuccess(res, rows);
  } catch (err) {
    next(err);
  }
});

// GET /users — list active users for the caller's organization.
// Used by approver pickers (offer approval, etc.).
//
// `?role=approver` restricts to management roles (super_admin, org_admin,
// hr_admin, hr_manager, manager) so the offer-approval picker doesn't
// surface every employee + candidate as a possible approver.
router.get("/users", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getEmpCloudDB();
    const roleFilter = (req.query.role as string | undefined) || "";
    let q = db("users")
      .where({ organization_id: req.user!.empcloudOrgId, status: 1 });
    if (roleFilter === "approver") {
      q = q.whereIn("role", ["super_admin", "org_admin", "hr_admin", "hr_manager", "manager"]);
    }
    const rows = await q
      .select("id", "first_name", "last_name", "email", "role", "designation")
      .orderBy("first_name", "asc");
    sendSuccess(res, rows);
  } catch (err) {
    next(err);
  }
});

export { router as organizationRoutes };
