import { lazy } from "react";
import { Route } from "react-router-dom";

const CandidateListPage = lazy(() =>
  import("@/pages/candidates/CandidateListPage").then((m) => ({ default: m.CandidateListPage })),
);
const CandidateDetailPage = lazy(() =>
  import("@/pages/candidates/CandidateDetailPage").then((m) => ({ default: m.CandidateDetailPage })),
);
const CandidateCreatePage = lazy(() =>
  import("@/pages/candidates/CandidateCreatePage").then((m) => ({ default: m.CandidateCreatePage })),
);
const ComparisonPage = lazy(() =>
  import("@/pages/candidates/ComparisonPage").then((m) => ({ default: m.ComparisonPage })),
);

export const candidateRoutes = (
  <>
    <Route path="/candidates" element={<CandidateListPage />} />
    <Route path="/candidates/new" element={<CandidateCreatePage />} />
    <Route path="/candidates/compare" element={<ComparisonPage />} />
    <Route path="/candidates/:id" element={<CandidateDetailPage />} />
  </>
);
