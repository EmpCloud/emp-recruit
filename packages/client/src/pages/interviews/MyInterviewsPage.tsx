// ============================================================================
// MY INTERVIEWS — panelist-facing page listing the interviews the current user
// is assigned to conduct, with feedback status. Reachable from the sidebar by
// any role (including non-admin employees who are interview panelists).
// ============================================================================

import { useQuery } from "@tanstack/react-query";
import { ClipboardList, Loader2 } from "lucide-react";
import { apiGet } from "@/api/client";
import { MyPanelInterviews } from "@/components/MyPanelInterviews";

export function MyInterviewsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["my-panel-interviews"],
    queryFn: () => apiGet<any[]>("/interviews/my-panel"),
  });
  const count = ((data?.data as any) ?? []).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My interviews</h1>
        <p className="mt-1 text-sm text-gray-500">
          Interviews you're on the panel for. Open one to review the candidate and submit your feedback.
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-gray-400" /></div>
      ) : count === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 py-16 text-center">
          <ClipboardList className="mx-auto mb-3 h-10 w-10 text-gray-300" />
          <p className="text-sm text-gray-500">You have no interviews assigned yet.</p>
          <p className="mt-1 text-xs text-gray-400">When a recruiter adds you as a panelist, the interview appears here.</p>
        </div>
      ) : (
        <MyPanelInterviews />
      )}
    </div>
  );
}
