import { lazyWithRetry } from "@/lib/lazyWithRetry";
import { Route } from "react-router-dom";

const AssessmentTemplatesPage = lazyWithRetry(() =>
  import("@/pages/assessments/AssessmentTemplatesPage").then((m) => ({ default: m.AssessmentTemplatesPage })),
);

// Authenticated (recruiter) assessment routes — rendered inside DashboardLayout.
export const assessmentRoutes = (
  <>
    <Route path="/assessments" element={<AssessmentTemplatesPage />} />
  </>
);
