import { lazy } from "react";
import { Route } from "react-router-dom";

const OnboardingListPage = lazy(() =>
  import("@/pages/onboarding/OnboardingListPage").then((m) => ({ default: m.OnboardingListPage })),
);
const OnboardingDetailPage = lazy(() =>
  import("@/pages/onboarding/OnboardingDetailPage").then((m) => ({ default: m.OnboardingDetailPage })),
);
const OnboardingTemplatesPage = lazy(() =>
  import("@/pages/onboarding/OnboardingTemplatesPage").then((m) => ({ default: m.OnboardingTemplatesPage })),
);

export const onboardingRoutes = (
  <>
    <Route path="/onboarding" element={<OnboardingListPage />} />
    <Route path="/onboarding/templates" element={<OnboardingTemplatesPage />} />
    <Route path="/onboarding/:id" element={<OnboardingDetailPage />} />
  </>
);
