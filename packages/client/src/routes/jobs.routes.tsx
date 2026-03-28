import { lazy } from "react";
import { Route } from "react-router-dom";

const JobListPage = lazy(() =>
  import("@/pages/jobs/JobListPage").then((m) => ({ default: m.JobListPage })),
);
const JobDetailPage = lazy(() =>
  import("@/pages/jobs/JobDetailPage").then((m) => ({ default: m.JobDetailPage })),
);
const JobCreatePage = lazy(() =>
  import("@/pages/jobs/JobCreatePage").then((m) => ({ default: m.JobCreatePage })),
);
const JobEditPage = lazy(() =>
  import("@/pages/jobs/JobFormPage").then((m) => ({ default: m.JobFormPage })),
);
const JobPipelinePage = lazy(() =>
  import("@/pages/jobs/JobPipelinePage").then((m) => ({ default: m.JobPipelinePage })),
);

export const jobRoutes = (
  <>
    <Route path="/jobs" element={<JobListPage />} />
    <Route path="/jobs/new" element={<JobCreatePage />} />
    <Route path="/jobs/:id" element={<JobDetailPage />} />
    <Route path="/jobs/:id/edit" element={<JobEditPage />} />
    <Route path="/jobs/:id/pipeline" element={<JobPipelinePage />} />
  </>
);
