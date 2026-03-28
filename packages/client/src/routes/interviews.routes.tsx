import { lazy } from "react";
import { Route } from "react-router-dom";

const InterviewListPage = lazy(() =>
  import("@/pages/interviews/InterviewListPage").then((m) => ({ default: m.InterviewListPage })),
);
const InterviewDetailPage = lazy(() =>
  import("@/pages/interviews/InterviewDetailPage").then((m) => ({ default: m.InterviewDetailPage })),
);
const InterviewSchedulePage = lazy(() =>
  import("@/pages/interviews/InterviewSchedulePage").then((m) => ({ default: m.InterviewSchedulePage })),
);
const InterviewFeedbackPage = lazy(() =>
  import("@/pages/interviews/InterviewFeedbackPage").then((m) => ({ default: m.InterviewFeedbackPage })),
);

export const interviewRoutes = (
  <>
    <Route path="/interviews" element={<InterviewListPage />} />
    <Route path="/interviews/schedule" element={<InterviewSchedulePage />} />
    <Route path="/interviews/:id" element={<InterviewDetailPage />} />
    <Route path="/interviews/:id/feedback" element={<InterviewFeedbackPage />} />
  </>
);
