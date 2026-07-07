// ============================================================================
// JOB DISTRIBUTION PROVIDER INTERFACE
//
// Common shape for publishing a job to an external board. Two families:
//   - "assisted" providers (Naukri): no public post API, so we PREPARE a
//     pre-filled submission the recruiter completes in one click. publish()
//     returns { mode: "assisted", prefillUrl, payload }.
//   - "api" providers (LinkedIn/Indeed/Apna once granted): publish() posts via
//     their API and returns { mode: "api", externalId, externalUrl }.
// ============================================================================

export type PortalKey = "naukri" | "linkedin" | "indeed" | "apna";

export interface JobToPublish {
  id: string;
  title: string;
  description: string;
  requirements?: string;
  location?: string;
  employmentType?: string;
  experienceMin?: number;
  experienceMax?: number;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  skills?: string[];
  organizationName?: string;
  applyUrl?: string; // public apply link back into our portal
}

export interface PublishResult {
  mode: "assisted" | "api" | "unavailable";
  // assisted:
  prefillUrl?: string; // deep link that opens the portal's post form pre-filled
  payload?: Record<string, any>; // full field map the recruiter can copy-paste
  instructions?: string;
  // api:
  externalId?: string;
  externalUrl?: string;
  // unavailable:
  reason?: string;
}

export interface IDistributionProvider {
  readonly portal: PortalKey;
  readonly displayName: string;
  /** "assisted" (recruiter completes), "api" (auto), or "unavailable". */
  mode(orgCredentials?: Record<string, any> | null): "assisted" | "api" | "unavailable";
  publish(job: JobToPublish, orgCredentials?: Record<string, any> | null): Promise<PublishResult>;
}
