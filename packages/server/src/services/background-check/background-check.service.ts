// ============================================================================
// BACKGROUND CHECK SERVICE
// Manages background check initiation, status tracking, packages, and results.
// Simulates provider API calls — real integration can be plugged in later.
// ============================================================================

import { v4 as uuidv4 } from "uuid";
import { getDB } from "../../db/adapters";
import { NotFoundError, ValidationError } from "../../utils/errors";
import { logger } from "../../utils/logger";
import type {
  BackgroundCheck,
  BackgroundCheckPackage,
  BackgroundCheckProvider,
  BackgroundCheckType,
  BackgroundCheckStatus,
  BackgroundCheckResult,
} from "@emp-recruit/shared";

// ---------------------------------------------------------------------------
// Background Check Packages
// ---------------------------------------------------------------------------

export async function createPackage(
  orgId: number,
  data: {
    name: string;
    description?: string;
    checks_included: BackgroundCheckType[];
    provider: BackgroundCheckProvider;
    estimated_days?: number;
    cost?: number;
    is_default?: boolean;
  },
): Promise<BackgroundCheckPackage> {
  const db = getDB();
  const id = uuidv4();

  const record = await db.create<BackgroundCheckPackage>("background_check_packages", {
    id,
    organization_id: orgId,
    name: data.name,
    description: data.description || null,
    checks_included: JSON.stringify(data.checks_included),
    provider: data.provider,
    estimated_days: data.estimated_days ?? null,
    cost: data.cost ?? null,
    is_default: data.is_default ?? false,
    is_active: true,
  } as any);

  return record;
}

export async function listPackages(
  orgId: number,
): Promise<BackgroundCheckPackage[]> {
  const db = getDB();
  const result = await db.findMany<BackgroundCheckPackage>("background_check_packages", {
    filters: { organization_id: orgId, is_active: true },
    limit: 100,
  });
  return result.data;
}

// ---------------------------------------------------------------------------
// Initiate Background Check
// ---------------------------------------------------------------------------

/**
 * Initiate a background check for a candidate.
 * Creates the record and simulates an API call to the provider.
 */
export async function initiateCheck(
  orgId: number,
  data: {
    candidate_id: string;
    provider: BackgroundCheckProvider;
    check_type: BackgroundCheckType;
    initiated_by: number;
  },
): Promise<BackgroundCheck> {
  const db = getDB();

  // Verify candidate exists
  const candidate = await db.findOne<any>("candidates", {
    id: data.candidate_id,
    organization_id: orgId,
  });
  if (!candidate) throw new NotFoundError("Candidate", data.candidate_id);

  const id = uuidv4();

  // Simulate provider request ID
  const requestId = `${data.provider}_${Date.now()}_${uuidv4().slice(0, 8)}`;

  const record = await db.create<BackgroundCheck>("background_checks", {
    id,
    organization_id: orgId,
    candidate_id: data.candidate_id,
    provider: data.provider,
    check_type: data.check_type,
    status: "pending",
    request_id: requestId,
    result: null,
    result_details: null,
    initiated_by: data.initiated_by,
    requested_at: new Date(),
    completed_at: null,
    report_url: null,
  } as any);

  // Simulate async provider call — in production this would call the actual API
  simulateProviderCallback(id, orgId, data.provider).catch((err) => {
    logger.error(`Background check simulation failed for ${id}:`, err);
  });

  logger.info(
    `Background check initiated: ${id} (${data.check_type}) via ${data.provider} for candidate ${data.candidate_id}`,
  );

  return record;
}

/**
 * Simulates a provider completing the background check after a short delay.
 * In production, this would be replaced by a webhook handler from the provider.
 */
async function simulateProviderCallback(
  checkId: string,
  orgId: number,
  provider: string,
): Promise<void> {
  // Simulate 3–10 second delay
  const delay = 3000 + Math.random() * 7000;
  await new Promise((resolve) => setTimeout(resolve, delay));

  const db = getDB();

  // Move to in_progress first
  await db.update<BackgroundCheck>("background_checks", checkId, {
    status: "in_progress",
  } as any);

  // Simulate another delay for completion
  await new Promise((resolve) => setTimeout(resolve, 2000 + Math.random() * 5000));

  // Randomly assign a result (weighted towards "clear")
  const rand = Math.random();
  let result: BackgroundCheckResult;
  if (rand < 0.7) result = "clear";
  else if (rand < 0.85) result = "consider";
  else result = "adverse";

  const resultDetails: Record<string, any> = {
    provider,
    completed_at: new Date().toISOString(),
    result,
    summary:
      result === "clear"
        ? "No adverse findings detected."
        : result === "consider"
          ? "Minor discrepancies found. Manual review recommended."
          : "Adverse findings detected. Review required before proceeding.",
  };

  await db.update<BackgroundCheck>("background_checks", checkId, {
    status: "completed",
    result,
    result_details: JSON.stringify(resultDetails),
    completed_at: new Date(),
    report_url: `/reports/background-checks/${checkId}`,
  } as any);

  logger.info(`Background check completed: ${checkId} — result: ${result}`);
}

// ---------------------------------------------------------------------------
// Get / List
// ---------------------------------------------------------------------------

export async function getCheck(
  orgId: number,
  checkId: string,
): Promise<BackgroundCheck> {
  const db = getDB();
  const check = await db.findOne<BackgroundCheck>("background_checks", {
    id: checkId,
    organization_id: orgId,
  });
  if (!check) throw new NotFoundError("Background check", checkId);
  return check;
}

export async function listChecksForCandidate(
  orgId: number,
  candidateId: string,
): Promise<BackgroundCheck[]> {
  const db = getDB();
  const result = await db.findMany<BackgroundCheck>("background_checks", {
    filters: { organization_id: orgId, candidate_id: candidateId },
    sort: { field: "requested_at", order: "desc" },
    limit: 100,
  });
  return result.data;
}

export async function listAllChecks(
  orgId: number,
  options?: { status?: BackgroundCheckStatus; page?: number; limit?: number },
): Promise<{ data: BackgroundCheck[]; total: number; page: number; limit: number }> {
  const db = getDB();
  const filters: Record<string, any> = { organization_id: orgId };
  if (options?.status) filters.status = options.status;

  const result = await db.findMany<BackgroundCheck>("background_checks", {
    filters,
    sort: { field: "requested_at", order: "desc" },
    page: options?.page ?? 1,
    limit: options?.limit ?? 20,
  });

  return {
    data: result.data,
    total: result.total,
    page: result.page,
    limit: result.limit,
  };
}

// ---------------------------------------------------------------------------
// Update (manual checks)
// ---------------------------------------------------------------------------

export async function updateCheckResult(
  orgId: number,
  checkId: string,
  data: {
    result: BackgroundCheckResult;
    result_details?: Record<string, any>;
    report_url?: string;
  },
): Promise<BackgroundCheck> {
  const db = getDB();

  const check = await db.findOne<BackgroundCheck>("background_checks", {
    id: checkId,
    organization_id: orgId,
  });
  if (!check) throw new NotFoundError("Background check", checkId);

  if (check.provider !== "manual" && check.status === "completed") {
    throw new ValidationError("Only manual or non-completed checks can be updated");
  }

  const updated = await db.update<BackgroundCheck>("background_checks", checkId, {
    result: data.result,
    result_details: data.result_details ? JSON.stringify(data.result_details) : check.result_details,
    report_url: data.report_url ?? check.report_url,
    status: "completed",
    completed_at: new Date(),
  } as any);

  return updated;
}
