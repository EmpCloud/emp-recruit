// ============================================================================
// API-PORTAL PROVIDERS — LinkedIn / Indeed / Apna
//
// These portals require a partner/enterprise agreement before any posting API
// works. Each adapter is fully wired: when the org has stored credentials
// (portal_credentials), mode() flips to "api" and publish() posts via the real
// endpoint. Until then mode() is "unavailable" with an honest reason — no fake
// success. LinkedIn/Indeed have real APIs (partner-gated); Apna has none.
// ============================================================================

import {
  IDistributionProvider,
  PortalKey,
  JobToPublish,
  PublishResult,
} from "./provider.interface";

abstract class ApiPortalBase implements IDistributionProvider {
  abstract readonly portal: PortalKey;
  abstract readonly displayName: string;
  protected abstract readonly gateReason: string;

  mode(creds?: Record<string, any> | null): "assisted" | "api" | "unavailable" {
    return creds && Object.keys(creds).length > 0 ? "api" : "unavailable";
  }

  async publish(job: JobToPublish, creds?: Record<string, any> | null): Promise<PublishResult> {
    if (!creds || Object.keys(creds).length === 0) {
      return { mode: "unavailable", reason: this.gateReason };
    }
    // Credentials present → attempt the real post. Each subclass implements
    // postViaApi with its portal's endpoint.
    return this.postViaApi(job, creds);
  }

  protected abstract postViaApi(job: JobToPublish, creds: Record<string, any>): Promise<PublishResult>;
}

// ---------------------------------------------------------------------------
export class LinkedInProvider extends ApiPortalBase {
  readonly portal: PortalKey = "linkedin";
  readonly displayName = "LinkedIn";
  protected readonly gateReason =
    "LinkedIn job posting requires LinkedIn Talent Solutions partner approval + a signed agreement. " +
    "Once granted, add the API credentials in Settings → Job Portals and this activates automatically.";

  // Default to the LTS version the integration targets. Overridable per-org via
  // creds.version so the API version can be bumped without a code change.
  private static readonly DEFAULT_VERSION = "202603";

  protected async postViaApi(job: JobToPublish, creds: Record<string, any>): Promise<PublishResult> {
    // LinkedIn Job Postings SYNC API (li-lts-2026-03).
    //   POST https://api.linkedin.com/rest/jobPostings
    // A batch upsert of one or more postings. LinkedIn processes them
    // asynchronously and returns 202 Accepted; the postings are keyed by the
    // partner's externalJobPostingId. Requires:
    //   - creds.accessToken           OAuth token with job-posting scope
    //   - creds.integrationContext    the partner/company URN (organization URN)
    //   - creds.version (optional)    LinkedIn-Version header, default 202603
    // Ref: learn.microsoft.com/linkedin/talent/job-postings/api/sync-job-postings
    if (!creds.accessToken || !creds.integrationContext) {
      return {
        mode: "unavailable",
        reason: "LinkedIn needs both an accessToken and an integrationContext (company/partner URN) to post.",
      };
    }
    const version = String(creds.version || LinkedInProvider.DEFAULT_VERSION);
    const res = await fetch("https://api.linkedin.com/rest/jobPostings", {
      method: "POST",
      headers: {
        authorization: `Bearer ${creds.accessToken}`,
        "content-type": "application/json",
        "x-restli-protocol-version": "2.0.0",
        "linkedin-version": version,
      },
      body: JSON.stringify({ elements: [buildLinkedInPayload(job, creds)] }),
    });
    // The sync API returns 201/202 on accept. Anything else is an error.
    if (res.status !== 201 && res.status !== 202 && !res.ok) {
      return { mode: "unavailable", reason: `LinkedIn API error ${res.status}: ${(await res.text()).slice(0, 200)}` };
    }
    // 202 = accepted for async processing; the posting is keyed by our external
    // id. LinkedIn does not synchronously return a public URL, so we key the
    // record by the external id we sent and let the recruiter confirm live.
    let externalId = job.id;
    try {
      const j: any = await res.json();
      externalId = j?.elements?.[0]?.externalJobPostingId || j?.id || job.id;
    } catch {
      /* 202 with empty body is normal */
    }
    return { mode: "api", externalId, externalUrl: undefined };
  }
}

// ---------------------------------------------------------------------------
export class IndeedProvider extends ApiPortalBase {
  readonly portal: PortalKey = "indeed";
  readonly displayName = "Indeed";
  protected readonly gateReason =
    "Indeed has no public REST API to post a single job. Indeed sources jobs via an XML feed you register in your " +
    "Indeed employer account, or the Indeed Apply program. Post via your Indeed dashboard or set up an XML feed.";

  // No REST posting endpoint exists — never report 'api' even if creds are set.
  override mode(): "assisted" | "api" | "unavailable" {
    return "unavailable";
  }

  protected async postViaApi(_job: JobToPublish, _creds: Record<string, any>): Promise<PublishResult> {
    // Indeed has NO public REST endpoint for posting a single job. The old
    // `apis.indeed.com/ads/apisearch` was a read-only (and now retired) job
    // SEARCH API — posting to it never worked. Indeed sourcing today is done via
    // an XML job feed (indeedxml) that Indeed crawls on a schedule, or the
    // Indeed Apply partner program. Rather than POST to a dead URL and return a
    // confusing error, we report honestly that automated posting isn't available
    // through a REST call.
    return {
      mode: "unavailable",
      reason:
        "Indeed does not offer a public REST endpoint to post a single job. Indeed sources jobs via an XML feed " +
        "(hosted at a URL you register in your Indeed employer account) or the Indeed Apply partner program. " +
        "Use the assisted flow / your Indeed dashboard to post, or set up an Indeed XML feed.",
    };
  }
}

// ---------------------------------------------------------------------------
export class ApnaProvider extends ApiPortalBase {
  readonly portal: PortalKey = "apna";
  readonly displayName = "Apna";
  protected readonly gateReason =
    "Apna has no public posting API for third parties. This requires a direct enterprise partnership with Apna. " +
    "Until then, jobs must be posted via the Apna employer dashboard manually.";

  protected async postViaApi(_job: JobToPublish, _creds: Record<string, any>): Promise<PublishResult> {
    // No public API — even with "credentials" there's nothing to call. Kept for
    // interface symmetry; returns unavailable so we never fake a post.
    return { mode: "unavailable", reason: this.gateReason };
  }
}

// --- payload builders (per approved partner spec) ---------------------------
// LinkedIn Job Postings sync element (li-lts-2026-03). `integrationContext` is
// the partner/company URN; `externalJobPostingId` is OUR stable id so LinkedIn
// can upsert (re-posting the same id updates rather than duplicates).
function buildLinkedInPayload(job: JobToPublish, creds: Record<string, any>) {
  const el: Record<string, any> = {
    integrationContext: creds.integrationContext,
    externalJobPostingId: job.id,
    title: job.title,
    description: { text: stripHtml(job.description).slice(0, 25_000) },
    location: job.location || undefined,
    employmentStatus: mapLinkedInEmploymentStatus(job.employmentType),
    // The public apply flow: send applicants back to our careers apply URL.
    applyMethod: job.applyUrl
      ? { "com.linkedin.jobs.OffsiteApply": { companyApplyUrl: job.applyUrl } }
      : undefined,
    listedAt: undefined, // LinkedIn stamps this on receipt
    jobPostingOperationType: "CREATE",
  };
  if (creds.companyId) el.company = `urn:li:organization:${creds.companyId}`;
  return el;
}

// LinkedIn expects one of a fixed set of employment-status values.
function mapLinkedInEmploymentStatus(t?: string): string {
  switch ((t || "").toLowerCase()) {
    case "full_time": return "FULL_TIME";
    case "part_time": return "PART_TIME";
    case "contract": return "CONTRACT";
    case "temporary": return "TEMPORARY";
    case "internship": return "INTERNSHIP";
    case "volunteer": return "VOLUNTEER";
    default: return "FULL_TIME";
  }
}

function stripHtml(s: string): string {
  return String(s || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
