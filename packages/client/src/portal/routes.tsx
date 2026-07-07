// ============================================================================
// CANDIDATE PORTAL ROUTES
// Cross-org public job board + candidate account. Mounted under /jobs-portal
// (distinct from the legacy per-org career microsite at /careers/:slug).
// ============================================================================

import { Route } from "react-router-dom";
import { lazyWithRetry } from "@/lib/lazyWithRetry";

const JobBoardPage = lazyWithRetry(() =>
  import("./pages/JobBoardPage").then((m) => ({ default: m.JobBoardPage })),
);
const JobDetailPage = lazyWithRetry(() =>
  import("./pages/JobDetailPage").then((m) => ({ default: m.JobDetailPage })),
);
const CandidateLoginPage = lazyWithRetry(() =>
  import("./pages/CandidateLoginPage").then((m) => ({ default: m.CandidateLoginPage })),
);
const MyApplicationsPage = lazyWithRetry(() =>
  import("./pages/MyApplicationsPage").then((m) => ({ default: m.MyApplicationsPage })),
);
const CandidateProfilePage = lazyWithRetry(() =>
  import("./pages/CandidateProfilePage").then((m) => ({ default: m.CandidateProfilePage })),
);

// These render inside <CandidatePortalLayout /> (see App.tsx).
export const candidatePortalRoutes = (
  <>
    <Route index element={<JobBoardPage />} />
    <Route path="login" element={<CandidateLoginPage />} />
    <Route path="jobs/:idOrSlug" element={<JobDetailPage />} />
    <Route path="applications" element={<MyApplicationsPage />} />
    <Route path="profile" element={<CandidateProfilePage />} />
  </>
);
