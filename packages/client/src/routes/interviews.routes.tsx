import { lazyWithRetry } from "@/lib/lazyWithRetry";
import { Route } from "react-router-dom";

const InterviewListPage = lazyWithRetry(() =>
  import("@/pages/interviews/InterviewListPage").then((m) => ({ default: m.InterviewListPage })),
);
const InterviewDetailPage = lazyWithRetry(() =>
  import("@/pages/interviews/InterviewDetailPage").then((m) => ({ default: m.InterviewDetailPage })),
);
const InterviewSchedulePage = lazyWithRetry(() =>
  import("@/pages/interviews/InterviewSchedulePage").then((m) => ({ default: m.InterviewSchedulePage })),
);
const InterviewFeedbackPage = lazyWithRetry(() =>
  import("@/pages/interviews/InterviewFeedbackPage").then((m) => ({ default: m.InterviewFeedbackPage })),
);
const MyInterviewsPage = lazyWithRetry(() =>
  import("@/pages/interviews/MyInterviewsPage").then((m) => ({ default: m.MyInterviewsPage })),
);

export const interviewRoutes = (
  <>
    {/* Panelist-facing — available to any role */}
    <Route path="/my-interviews" element={<MyInterviewsPage />} />
    <Route path="/interviews" element={<InterviewListPage />} />
    <Route path="/interviews/schedule" element={<InterviewSchedulePage />} />
    <Route path="/interviews/:id" element={<InterviewDetailPage />} />
    <Route path="/interviews/:id/feedback" element={<InterviewFeedbackPage />} />
  </>
);
