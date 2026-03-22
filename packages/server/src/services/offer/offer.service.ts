// ============================================================================
// OFFER SERVICE
// Business logic for offer management, approval workflow, and candidate response.
// ============================================================================

import { getDB } from "../../db/adapters";
import { NotFoundError, ValidationError, AppError } from "../../utils/errors";
import type { Offer, OfferApprover, OfferStatus } from "@emp-recruit/shared";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CreateOfferData {
  application_id: string;
  candidate_id: string;
  job_id: string;
  salary_amount: number;
  salary_currency: string;
  joining_date: string;
  expiry_date: string;
  job_title: string;
  department?: string;
  benefits?: string;
  notes?: string;
  created_by: number;
}

interface UpdateOfferData {
  salary_amount?: number;
  salary_currency?: string;
  joining_date?: string;
  expiry_date?: string;
  job_title?: string;
  department?: string;
  benefits?: string;
  notes?: string;
}

interface ListOffersParams {
  status?: OfferStatus;
  page?: number;
  limit?: number;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export async function createOffer(orgId: number, data: CreateOfferData): Promise<Offer> {
  const db = getDB();

  // Verify application belongs to this org
  const application = await db.findOne<any>("applications", {
    id: data.application_id,
    organization_id: orgId,
  });
  if (!application) {
    throw new NotFoundError("Application", data.application_id);
  }

  // Check no active offer exists for this application
  const existingOffer = await db.findOne<Offer>("offers", {
    application_id: data.application_id,
    organization_id: orgId,
  });
  if (existingOffer && !["declined", "revoked", "expired"].includes(existingOffer.status)) {
    throw new ValidationError("An active offer already exists for this application");
  }

  const offer = await db.create<Offer>("offers", {
    organization_id: orgId,
    application_id: data.application_id,
    candidate_id: data.candidate_id,
    job_id: data.job_id,
    status: "draft" as OfferStatus,
    salary_amount: data.salary_amount,
    salary_currency: data.salary_currency,
    joining_date: data.joining_date,
    expiry_date: data.expiry_date,
    job_title: data.job_title,
    department: data.department || null,
    benefits: data.benefits || null,
    notes: data.notes || null,
    created_by: data.created_by,
  });

  // Move application to offer stage
  await db.update("applications", data.application_id, { stage: "offer" });

  return offer;
}

export async function updateOffer(orgId: number, id: string, data: UpdateOfferData): Promise<Offer> {
  const db = getDB();

  const offer = await db.findOne<Offer>("offers", { id, organization_id: orgId });
  if (!offer) {
    throw new NotFoundError("Offer", id);
  }
  if (offer.status !== "draft") {
    throw new ValidationError("Only draft offers can be edited");
  }

  return db.update<Offer>("offers", id, data);
}

export async function getOffer(orgId: number, id: string): Promise<Offer & { approvers: OfferApprover[] }> {
  const db = getDB();

  const offer = await db.findOne<Offer>("offers", { id, organization_id: orgId });
  if (!offer) {
    throw new NotFoundError("Offer", id);
  }

  const approversResult = await db.findMany<OfferApprover>("offer_approvers", {
    filters: { offer_id: id },
    sort: { field: "order", order: "asc" },
    limit: 100,
  });

  return { ...offer, approvers: approversResult.data };
}

export async function listOffers(orgId: number, params: ListOffersParams) {
  const db = getDB();

  const filters: Record<string, any> = { organization_id: orgId };
  if (params.status) {
    filters.status = params.status;
  }

  const result = await db.findMany<Offer>("offers", {
    filters,
    page: params.page || 1,
    limit: params.limit || 20,
    sort: { field: "created_at", order: "desc" },
  });

  // Enrich with candidate and job info
  const enriched = await Promise.all(
    result.data.map(async (offer) => {
      const candidate = await db.findById<any>("candidates", offer.candidate_id);
      const job = await db.findById<any>("job_postings", offer.job_id);
      return {
        ...offer,
        candidate_name: candidate ? `${candidate.first_name} ${candidate.last_name}` : "Unknown",
        job_title_display: job?.title || offer.job_title,
      };
    }),
  );

  return {
    data: enriched,
    total: result.total,
    page: result.page,
    limit: result.limit,
    totalPages: result.totalPages,
  };
}

export async function submitForApproval(
  orgId: number,
  id: string,
  approverUserIds: number[],
): Promise<Offer> {
  const db = getDB();

  const offer = await db.findOne<Offer>("offers", { id, organization_id: orgId });
  if (!offer) {
    throw new NotFoundError("Offer", id);
  }
  if (offer.status !== "draft") {
    throw new ValidationError("Only draft offers can be submitted for approval");
  }
  if (!approverUserIds || approverUserIds.length === 0) {
    throw new ValidationError("At least one approver is required");
  }

  // Create approver records
  for (let i = 0; i < approverUserIds.length; i++) {
    await db.create<OfferApprover>("offer_approvers", {
      offer_id: id,
      user_id: approverUserIds[i],
      order: i + 1,
      status: "pending",
    });
  }

  return db.update<Offer>("offers", id, { status: "pending_approval" as OfferStatus });
}

export async function approve(
  orgId: number,
  offerId: string,
  userId: number,
  comment?: string,
): Promise<Offer> {
  const db = getDB();

  const offer = await db.findOne<Offer>("offers", { id: offerId, organization_id: orgId });
  if (!offer) {
    throw new NotFoundError("Offer", offerId);
  }
  if (offer.status !== "pending_approval") {
    throw new ValidationError("Offer is not pending approval");
  }

  // Find this user's approver record
  const approver = await db.findOne<OfferApprover>("offer_approvers", {
    offer_id: offerId,
    user_id: userId,
  });
  if (!approver) {
    throw new AppError(403, "FORBIDDEN", "You are not an approver for this offer");
  }
  if (approver.status !== "pending") {
    throw new ValidationError("You have already acted on this offer");
  }

  // Mark this approver as approved
  await db.update("offer_approvers", approver.id, {
    status: "approved",
    notes: comment || null,
    acted_at: new Date(),
  });

  // Check if all approvers have approved
  const pendingCount = await db.count("offer_approvers", {
    offer_id: offerId,
    status: "pending",
  });

  if (pendingCount === 0) {
    // All approved — mark offer as approved
    return db.update<Offer>("offers", offerId, {
      status: "approved" as OfferStatus,
      approved_by: userId,
      approved_at: new Date(),
    });
  }

  return db.findById<Offer>("offers", offerId) as Promise<Offer>;
}

export async function reject(
  orgId: number,
  offerId: string,
  userId: number,
  comment?: string,
): Promise<Offer> {
  const db = getDB();

  const offer = await db.findOne<Offer>("offers", { id: offerId, organization_id: orgId });
  if (!offer) {
    throw new NotFoundError("Offer", offerId);
  }
  if (offer.status !== "pending_approval") {
    throw new ValidationError("Offer is not pending approval");
  }

  const approver = await db.findOne<OfferApprover>("offer_approvers", {
    offer_id: offerId,
    user_id: userId,
  });
  if (!approver) {
    throw new AppError(403, "FORBIDDEN", "You are not an approver for this offer");
  }

  // Mark this approver as rejected
  await db.update("offer_approvers", approver.id, {
    status: "rejected",
    notes: comment || null,
    acted_at: new Date(),
  });

  // Mark entire offer as rejected (any single rejection rejects the offer)
  return db.update<Offer>("offers", offerId, { status: "draft" as OfferStatus });
}

export async function sendOffer(orgId: number, id: string): Promise<Offer> {
  const db = getDB();

  const offer = await db.findOne<Offer>("offers", { id, organization_id: orgId });
  if (!offer) {
    throw new NotFoundError("Offer", id);
  }
  if (offer.status !== "approved") {
    throw new ValidationError("Only approved offers can be sent");
  }

  return db.update<Offer>("offers", id, {
    status: "sent" as OfferStatus,
    sent_at: new Date(),
  });
}

export async function revokeOffer(orgId: number, id: string): Promise<Offer> {
  const db = getDB();

  const offer = await db.findOne<Offer>("offers", { id, organization_id: orgId });
  if (!offer) {
    throw new NotFoundError("Offer", id);
  }
  if (!["sent", "approved", "pending_approval"].includes(offer.status)) {
    throw new ValidationError("This offer cannot be revoked in its current status");
  }

  return db.update<Offer>("offers", id, { status: "revoked" as OfferStatus });
}

export async function acceptOffer(orgId: number, id: string, notes?: string): Promise<Offer> {
  const db = getDB();

  const offer = await db.findOne<Offer>("offers", { id, organization_id: orgId });
  if (!offer) {
    throw new NotFoundError("Offer", id);
  }
  if (offer.status !== "sent") {
    throw new ValidationError("Only sent offers can be accepted");
  }

  // Update offer
  const updated = await db.update<Offer>("offers", id, {
    status: "accepted" as OfferStatus,
    notes: notes || offer.notes,
    responded_at: new Date(),
  });

  // Move application to hired stage
  await db.update("applications", offer.application_id, { stage: "hired" });

  return updated;
}

export async function declineOffer(orgId: number, id: string, notes?: string): Promise<Offer> {
  const db = getDB();

  const offer = await db.findOne<Offer>("offers", { id, organization_id: orgId });
  if (!offer) {
    throw new NotFoundError("Offer", id);
  }
  if (offer.status !== "sent") {
    throw new ValidationError("Only sent offers can be declined");
  }

  return db.update<Offer>("offers", id, {
    status: "declined" as OfferStatus,
    notes: notes || offer.notes,
    responded_at: new Date(),
  });
}
