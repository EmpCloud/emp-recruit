import { v4 as uuidv4 } from "uuid";
import { getDB } from "../../db/adapters";
import { NotFoundError, ConflictError, ValidationError } from "../../utils/errors";
import { safeOrderBy } from "../../utils/sort";
import type { JobPosting, JobStatus } from "@emp-recruit/shared";

// Allow-list for the ORDER BY in the raw-SQL job search path (injection guard).
const JOB_SORT_COLUMNS = [
  "created_at", "updated_at", "title", "department", "location", "status", "published_at", "closes_at",
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Server-side HTML cleaning for rich-text fields (description/requirements/
// benefits). Defense-in-depth against a client that sends polluted HTML: strip
// inline style/class/data-* attributes (Tailwind's --tw-* vars bloat the value
// and overflowed the TEXT column), remove script/style/iframe blocks and event
// handlers, and cap the length so a runaway payload can't silently break the
// INSERT. Returns clean, compact HTML.
const MAX_RICH_TEXT_BYTES = 60_000; // safely under MySQL TEXT's 65,535

function cleanRichText(html: string | null | undefined, fieldLabel: string): string | null {
  if (html == null) return null;
  let out = String(html)
    // drop dangerous blocks entirely (including content)
    .replace(/<(script|style|iframe|object|embed)[\s\S]*?<\/\1>/gi, "")
    // strip ALL inline style="" attributes (this is what carried the --tw-* junk)
    .replace(/\sstyle\s*=\s*("[^"]*"|'[^']*')/gi, "")
    // strip class / data-* attributes
    .replace(/\sclass\s*=\s*("[^"]*"|'[^']*')/gi, "")
    .replace(/\sdata-[\w-]+\s*=\s*("[^"]*"|'[^']*')/gi, "")
    // strip on*= event handlers
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    // neutralize javascript: urls
    .replace(/(href|src)\s*=\s*("javascript:[^"]*"|'javascript:[^']*')/gi, '$1="#"')
    .trim();

  if (Buffer.byteLength(out, "utf8") > MAX_RICH_TEXT_BYTES) {
    throw new ValidationError(
      `${fieldLabel} is too long. Please shorten it (limit ~${Math.round(MAX_RICH_TEXT_BYTES / 1000)}KB).`,
    );
  }
  return out || null;
}

// Coerce a date/ISO string into the `YYYY-MM-DD HH:MM:SS` literal MySQL's
// DATETIME/TIMESTAMP columns accept. The client sends full ISO strings
// (e.g. "2026-11-01T00:00:00.000Z"), which MySQL rejects with
// ER_TRUNCATED_WRONG_VALUE. Returns null for empty/invalid input.
function toMysqlDateTime(value: unknown): string | null {
  if (value == null || value === "") return null;
  const d = value instanceof Date ? value : new Date(String(value));
  if (isNaN(d.getTime())) return null;
  // Format in UTC to match how the timestamp was intended by the client.
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
  );
}

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
}

async function ensureUniqueSlug(orgId: number, baseSlug: string, excludeId?: string): Promise<string> {
  const db = getDB();
  let slug = baseSlug;
  let counter = 0;
  while (true) {
    const candidate = slug + (counter > 0 ? `-${counter}` : "");
    const rows = await db.raw<any[][]>(
      "SELECT id FROM job_postings WHERE organization_id = ? AND slug = ? LIMIT 1",
      [orgId, candidate],
    );
    const existing = rows[0]?.[0];
    if (!existing || (excludeId && existing.id === excludeId)) {
      return candidate;
    }
    counter++;
  }
}

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

export async function createJob(
  orgId: number,
  data: {
    title: string;
    department?: string;
    location?: string;
    employment_type?: string;
    experience_min?: number;
    experience_max?: number;
    salary_min?: number;
    salary_max?: number;
    salary_currency?: string;
    description: string;
    requirements?: string;
    benefits?: string;
    skills?: string[];
    hiring_manager_id?: number;
    max_applications?: number;
    closes_at?: string;
    remote_policy?: string;
    is_internal?: boolean;
  },
  createdBy: number,
): Promise<JobPosting> {
  const db = getDB();
  const slug = await ensureUniqueSlug(orgId, generateSlug(data.title));
  const id = uuidv4();

  const record: Record<string, any> = {
    id,
    organization_id: orgId,
    title: data.title,
    slug,
    department: data.department ?? null,
    location: data.location ?? null,
    employment_type: data.employment_type ?? "full_time",
    experience_min: data.experience_min ?? null,
    experience_max: data.experience_max ?? null,
    salary_min: data.salary_min ?? null,
    salary_max: data.salary_max ?? null,
    salary_currency: data.salary_currency ?? "INR",
    description: cleanRichText(data.description, "Description") ?? "",
    requirements: cleanRichText(data.requirements, "Requirements"),
    benefits: cleanRichText(data.benefits, "Benefits"),
    skills: data.skills ? JSON.stringify(data.skills) : null,
    status: "draft",
    hiring_manager_id: data.hiring_manager_id ?? null,
    max_applications: data.max_applications ?? null,
    closes_at: toMysqlDateTime(data.closes_at),
    remote_policy: data.remote_policy ?? "onsite",
    is_internal: data.is_internal ?? false,
    created_by: createdBy,
  };

  return db.create<JobPosting>("job_postings", record as any);
}

export async function updateJob(
  orgId: number,
  id: string,
  data: Record<string, any>,
): Promise<JobPosting> {
  const db = getDB();
  const existing = await db.findOne<JobPosting>("job_postings", { id, organization_id: orgId });
  if (!existing) throw new NotFoundError("Job", id);

  const updates: Record<string, any> = { ...data };
  if (data.skills && Array.isArray(data.skills)) {
    updates.skills = JSON.stringify(data.skills);
  }
  if (data.title && data.title !== existing.title) {
    updates.slug = await ensureUniqueSlug(orgId, generateSlug(data.title), id);
  }
  // Clean rich-text fields on update too (strips --tw-* style pollution, caps size).
  if ("description" in data) updates.description = cleanRichText(data.description, "Description") ?? "";
  if ("requirements" in data) updates.requirements = cleanRichText(data.requirements, "Requirements");
  if ("benefits" in data) updates.benefits = cleanRichText(data.benefits, "Benefits");
  // Coerce ISO date strings to MySQL DATETIME literals (the real crash: the
  // client's "2026-11-01T00:00:00.000Z" was rejected by the timestamp column).
  if ("closes_at" in data) updates.closes_at = toMysqlDateTime(data.closes_at);
  if ("published_at" in data) updates.published_at = toMysqlDateTime(data.published_at);

  return db.update<JobPosting>("job_postings", id, updates);
}

export async function listJobs(
  orgId: number,
  params: { page?: number; perPage?: number; status?: string; search?: string; sort?: string; order?: "asc" | "desc" },
): Promise<{ data: JobPosting[]; total: number; page: number; perPage: number }> {
  const db = getDB();
  const page = params.page ?? 1;
  const perPage = params.perPage ?? 20;

  const filters: Record<string, any> = { organization_id: orgId };
  if (params.status) filters.status = params.status;

  const result = await db.findMany<JobPosting>("job_postings", {
    page,
    limit: perPage,
    filters,
    sort: params.sort
      ? { field: params.sort, order: params.order ?? "desc" }
      : { field: "created_at", order: "desc" },
  });

  // If search is provided, we filter in raw query for LIKE
  if (params.search) {
    const search = `%${params.search}%`;
    const countRows = await db.raw<any[][]>(
      "SELECT COUNT(*) as total FROM job_postings WHERE organization_id = ? AND (title LIKE ? OR department LIKE ? OR location LIKE ?)",
      [orgId, search, search, search],
    );
    const total = Number(countRows[0]?.[0]?.total ?? 0);

    const offset = (page - 1) * perPage;
    let statusFilter = "";
    const queryParams: any[] = [orgId, search, search, search];
    if (params.status) {
      statusFilter = " AND status = ?";
      queryParams.push(params.status);
    }
    const orderBy = safeOrderBy(params.sort, params.order, JOB_SORT_COLUMNS, "created_at");
    const dataRows = await db.raw<any[][]>(
      `SELECT * FROM job_postings WHERE organization_id = ? AND (title LIKE ? OR department LIKE ? OR location LIKE ?)${statusFilter} ${orderBy} LIMIT ? OFFSET ?`,
      [...queryParams, perPage, offset],
    );

    return { data: dataRows[0] as JobPosting[], total, page, perPage };
  }

  return { data: result.data, total: result.total, page, perPage };
}

export async function getJob(orgId: number, id: string): Promise<JobPosting> {
  const db = getDB();
  const job = await db.findOne<JobPosting>("job_postings", { id, organization_id: orgId });
  if (!job) throw new NotFoundError("Job", id);
  return job;
}

export async function changeStatus(
  orgId: number,
  id: string,
  status: JobStatus,
): Promise<JobPosting> {
  const db = getDB();
  const existing = await db.findOne<JobPosting>("job_postings", { id, organization_id: orgId });
  if (!existing) throw new NotFoundError("Job", id);

  const updates: Record<string, any> = { status };
  if (status === "open" && !existing.published_at) {
    updates.published_at = toMysqlDateTime(new Date());
  }

  return db.update<JobPosting>("job_postings", id, updates);
}

export async function deleteJob(orgId: number, id: string): Promise<boolean> {
  const db = getDB();
  const existing = await db.findOne<JobPosting>("job_postings", { id, organization_id: orgId });
  if (!existing) throw new NotFoundError("Job", id);

  // Deleting a job CASCADE-deletes its applications (and their interviews,
  // offers, scores) plus referrals. Refuse if any applicant history exists —
  // the caller should Close the job instead to preserve that history.
  const appCount = await db.count("applications", { job_id: id, organization_id: orgId });
  if (appCount > 0) {
    throw new ConflictError(
      `This job has ${appCount} application${appCount === 1 ? "" : "s"} and cannot be deleted. ` +
        `Close the job instead to stop accepting applications while preserving candidate history.`,
    );
  }

  return db.delete("job_postings", id);
}

export async function getJobAnalytics(orgId: number, jobId: string) {
  const db = getDB();
  const job = await db.findOne<JobPosting>("job_postings", { id: jobId, organization_id: orgId });
  if (!job) throw new NotFoundError("Job", jobId);

  const totalApps = await db.count("applications", { job_id: jobId, organization_id: orgId });

  const stageRows = await db.raw<any[][]>(
    "SELECT stage, COUNT(*) as count FROM applications WHERE job_id = ? AND organization_id = ? GROUP BY stage",
    [jobId, orgId],
  );
  const stageDistribution: Record<string, number> = {};
  for (const row of (stageRows[0] || []) as any[]) {
    stageDistribution[row.stage] = Number(row.count);
  }

  return {
    job_id: jobId,
    total_applications: totalApps,
    stage_distribution: stageDistribution,
  };
}

export { generateSlug };
