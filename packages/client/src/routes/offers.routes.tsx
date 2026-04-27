import { lazy } from "react";
import { Route } from "react-router-dom";

const OfferListPage = lazy(() =>
  import("@/pages/offers/OfferListPage").then((m) => ({ default: m.OfferListPage })),
);
const OfferDetailPage = lazy(() =>
  import("@/pages/offers/OfferDetailPage").then((m) => ({ default: m.OfferDetailPage })),
);
const OfferCreatePage = lazy(() =>
  import("@/pages/offers/OfferCreatePage").then((m) => ({ default: m.OfferCreatePage })),
);
const OfferEditPage = lazy(() =>
  import("@/pages/offers/OfferEditPage").then((m) => ({ default: m.OfferEditPage })),
);
const OfferLetterTemplatePage = lazy(() =>
  import("@/pages/offers/OfferLetterTemplatePage").then((m) => ({ default: m.OfferLetterTemplatePage })),
);

export const offerRoutes = (
  <>
    <Route path="/offers" element={<OfferListPage />} />
    <Route path="/offers/new" element={<OfferCreatePage />} />
    <Route path="/offers/letter-templates" element={<OfferLetterTemplatePage />} />
    <Route path="/offers/:id/edit" element={<OfferEditPage />} />
    <Route path="/offers/:id" element={<OfferDetailPage />} />
  </>
);
