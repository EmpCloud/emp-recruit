import { lazy } from "react";
import { Route } from "react-router-dom";

const PortalRequestPage = lazy(() =>
  import("@/pages/portal/PortalRequestPage").then((m) => ({ default: m.PortalRequestPage })),
);
const PortalDashboardPage = lazy(() =>
  import("@/pages/portal/PortalDashboardPage").then((m) => ({ default: m.PortalDashboardPage })),
);
const PortalApplicationDetailPage = lazy(() =>
  import("@/pages/portal/PortalApplicationDetailPage").then((m) => ({ default: m.PortalApplicationDetailPage })),
);
const PortalInterviewsPage = lazy(() =>
  import("@/pages/portal/PortalInterviewsPage").then((m) => ({ default: m.PortalInterviewsPage })),
);

export const portalRoutes = (
  <>
    <Route index element={<PortalRequestPage />} />
    <Route path="dashboard" element={<PortalDashboardPage />} />
    <Route path="applications/:id" element={<PortalApplicationDetailPage />} />
    <Route path="interviews" element={<PortalInterviewsPage />} />
  </>
);
