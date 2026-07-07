// ============================================================================
// NAUKRI PROVIDER (Assisted post)
//
// Naukri has no public job-posting API for dashboard-only accounts. So this
// adapter PREPARES the post: it maps our job to Naukri's post-a-job fields and
// returns a pre-fill URL + a copy-paste payload. The recruiter clicks through
// to Naukri (already logged in), the fields are pre-filled where the URL
// supports it, and they hit submit. Zero ToS risk, no stored credentials.
//
// If Naukri enterprise/RMS API credentials are ever provided, swap mode() to
// "api" and implement the POST here — the rest of the pipeline is unchanged.
// ============================================================================

import {
  IDistributionProvider,
  PortalKey,
  JobToPublish,
  PublishResult,
} from "./provider.interface";

const NAUKRI_POST_URL = "https://www.naukri.com/recruit/postjob"; // recruiter post-a-job entry

export class NaukriProvider implements IDistributionProvider {
  readonly portal: PortalKey = "naukri";
  readonly displayName = "Naukri";

  mode(): "assisted" | "api" | "unavailable" {
    // Always assisted for dashboard-only accounts (no public post API).
    return "assisted";
  }

  async publish(job: JobToPublish): Promise<PublishResult> {
    // Map our fields to Naukri's expected inputs. Naukri's post form doesn't
    // accept a full query-string prefill for every field, so we do two things:
    //   1. Pre-fill what the URL reliably supports (keyword/title-ish params).
    //   2. Return the COMPLETE field map so the UI can show a copy-paste block
    //      for the fields the recruiter must fill (functional area, role, etc.).
    const expYears =
      job.experienceMin != null || job.experienceMax != null
        ? `${job.experienceMin ?? 0}-${job.experienceMax ?? job.experienceMin ?? 0} yrs`
        : "";
    const ctc =
      job.salaryMin || job.salaryMax
        ? `${job.salaryCurrency || "INR"} ${job.salaryMin ?? ""}${job.salaryMax ? " - " + job.salaryMax : ""}`
        : "";

    const payload = {
      jobTitle: job.title,
      jobDescription: stripHtml(job.description),
      keySkills: (job.skills || []).join(", "),
      location: job.location || "",
      experience: expYears,
      salary: ctc,
      employmentType: mapEmploymentType(job.employmentType),
      companyName: job.organizationName || "",
      requirements: stripHtml(job.requirements || ""),
      applyUrl: job.applyUrl || "",
    };

    // Best-effort prefill (title as the initial keyword). The recruiter lands on
    // Naukri's post form logged in; remaining fields are shown as copy-paste.
    const prefillUrl = `${NAUKRI_POST_URL}?title=${encodeURIComponent(job.title)}`;

    return {
      mode: "assisted",
      prefillUrl,
      payload,
      instructions:
        "Opens Naukri's Post a Job page. Sign in if prompted, paste the fields below into the form, and submit. " +
        "Naukri has no public posting API for standard accounts, so this one-click assisted flow is the supported path.",
    };
  }
}

function mapEmploymentType(t?: string): string {
  switch ((t || "").toLowerCase()) {
    case "full_time": return "Full Time, Permanent";
    case "part_time": return "Part Time";
    case "contract": return "Contractual";
    case "internship": return "Internship";
    default: return "Full Time, Permanent";
  }
}

function stripHtml(s: string): string {
  return String(s || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
