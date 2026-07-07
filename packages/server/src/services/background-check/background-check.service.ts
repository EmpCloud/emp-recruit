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

  // Third-party providers (checkr/sterling/hireright) require a real API
  // integration + credentials. When those aren't configured we leave the check
  // 'pending' with an honest note — we NEVER fabricate a random result. A
  // 'manual' check also stays pending: the recruiter records the real outcome
  // via updateCheckResult (the UI). If a provider IS configured, we dispatch the
  // real request (integration point below).
  if (data.provider !== "manual") {
    dispatchProviderRequest(id, orgId, data.provider, requestId).catch((err) => {
      logger.error(`Background check provider dispatch failed for ${id}:`, err);
    });
  }

  logger.info(
    `Background check initiated: ${id} (${data.check_type}) via ${data.provider} for candidate ${data.candidate_id}`,
  );

  return record;
}

/**
 * Dispatch a real request to a third-party background-check provider. Requires
 * the provider's API credentials (e.g. BGCHECK_CHECKR_API_KEY). Without them we
 * do NOT complete the check with fake data — we record an honest "awaiting
 * provider configuration" note and leave it pending so a human can follow up.
 * The provider's real webhook (POST /background-checks/webhook, future) would
 * later complete the check with the genuine result.
 */
async function dispatchProviderRequest(
  checkId: string,
  _orgId: number,
  provider: string,
  _requestId: string,
): Promise<void> {
  const db = getDB();
  const apiKey = process.env[`BGCHECK_${provider.toUpperCase()}_API_KEY`];

  if (!apiKey) {
    // No integration configured — be honest, don't fake a result.
    await db.update<BackgroundCheck>("background_checks", checkId, {
      status: "pending",
      result_details: JSON.stringify({
        provider,
        note:
          `${provider} integration is not configured on the server. Add BGCHECK_${provider.toUpperCase()}_API_KEY ` +
          `to enable automated checks, or use a Manual check and record the result yourself.`,
      }),
    } as any);
    logger.warn(`Background check ${checkId}: ${provider} not configured — left pending (no fake result).`);
    return;
  }

  // A configured provider would be called here (Checkr/Sterling/HireRight REST
  // API), and its webhook would complete the check with the real result. Until a
  // specific provider client is implemented we mark it in_progress honestly.
  await db.update<BackgroundCheck>("background_checks", checkId, {
    status: "in_progress",
    result_details: JSON.stringify({ provider, note: "Awaiting provider result via webhook." }),
  } as any);
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
