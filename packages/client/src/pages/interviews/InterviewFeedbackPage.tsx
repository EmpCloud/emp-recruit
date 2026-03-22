import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Star, ArrowLeft, Plus, Trash2, ThumbsUp, ThumbsDown } from "lucide-react";
import { apiGet, apiPost } from "@/api/client";
import { cn, formatDate } from "@/lib/utils";
import type { Interview, Recommendation } from "@emp-recruit/shared";

interface InterviewBrief {
  id: string;
  title: string;
  candidate_name: string;
  job_title: string;
  scheduled_at: string;
  round: number;
  type: string;
}

interface ScorecardItem {
  id: string;
  criteria: string;
  rating: number;
}

const RECOMMENDATIONS: { value: Recommendation; label: string; icon: typeof ThumbsUp; color: string }[] = [
  { value: "strong_yes" as Recommendation, label: "Strong Yes", icon: ThumbsUp, color: "border-green-500 bg-green-50 text-green-700" },
  { value: "yes" as Recommendation, label: "Yes", icon: ThumbsUp, color: "border-green-400 bg-green-50 text-green-600" },
  { value: "neutral" as Recommendation, label: "Neutral", icon: Star, color: "border-gray-400 bg-gray-50 text-gray-600" },
  { value: "no" as Recommendation, label: "No", icon: ThumbsDown, color: "border-red-400 bg-red-50 text-red-600" },
  { value: "strong_no" as Recommendation, label: "Strong No", icon: ThumbsDown, color: "border-red-500 bg-red-50 text-red-700" },
];

function StarSelector({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <button key={i} type="button" onClick={() => onChange(i)} className="p-0.5">
          <Star
            className={cn(
              "h-7 w-7 transition-colors",
              i <= value ? "fill-yellow-400 text-yellow-400" : "text-gray-300 hover:text-yellow-300",
            )}
          />
        </button>
      ))}
    </div>
  );
}

export function InterviewFeedbackPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // Form state
  const [recommendation, setRecommendation] = useState<Recommendation | "">("");
  const [overallScore, setOverallScore] = useState(0);
  const [technicalScore, setTechnicalScore] = useState(0);
  const [communicationScore, setCommunicationScore] = useState(0);
  const [culturalFitScore, setCulturalFitScore] = useState(0);
  const [strengths, setStrengths] = useState("");
  const [weaknesses, setWeaknesses] = useState("");
  const [notes, setNotes] = useState("");

  // Scorecard items (custom criteria)
  const [scorecardItems, setScorecardItems] = useState<ScorecardItem[]>([]);

  const { data: interview, isLoading } = useQuery({
    queryKey: ["interview-brief", id],
    queryFn: async () => {
      const res = await apiGet<InterviewBrief>(`/interviews/${id}`);
      return res.data!;
    },
    enabled: !!id,
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      // Build scorecard JSON from custom criteria items
      const scorecard = scorecardItems.length > 0
        ? scorecardItems.map((item) => ({ criteria: item.criteria, rating: item.rating }))
        : undefined;

      return apiPost(`/interviews/${id}/feedback`, {
        recommendation,
        overall_score: overallScore || undefined,
        technical_score: technicalScore || undefined,
        communication_score: communicationScore || undefined,
        cultural_fit_score: culturalFitScore || undefined,
        strengths: strengths || undefined,
        weaknesses: weaknesses || undefined,
        notes: scorecard
          ? `${notes ? notes + "\n\n" : ""}Scorecard:\n${scorecard.map((s) => `- ${s.criteria}: ${s.rating}/5`).join("\n")}`
          : notes || undefined,
      });
    },
    onSuccess: () => {
      navigate(`/interviews/${id}`);
    },
  });

  function addScorecardItem() {
    setScorecardItems((prev) => [
      ...prev,
      { id: crypto.randomUUID(), criteria: "", rating: 0 },
    ]);
  }

  function updateScorecardItem(itemId: string, field: "criteria" | "rating", value: string | number) {
    setScorecardItems((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, [field]: value } : item)),
    );
  }

  function removeScorecardItem(itemId: string) {
    setScorecardItems((prev) => prev.filter((item) => item.id !== itemId));
  }

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-gray-500">
        Loading...
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Back */}
      <button
        onClick={() => navigate(`/interviews/${id}`)}
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Interview
      </button>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Submit Feedback</h1>
        {interview && (
          <p className="mt-1 text-sm text-gray-500">
            {interview.candidate_name} &mdash; {interview.title} (Round {interview.round})
            &middot; {formatDate(interview.scheduled_at)}
          </p>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submitMutation.mutate();
        }}
        className="space-y-8"
      >
        {/* Recommendation */}
        <section className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">
            Recommendation <span className="text-red-500">*</span>
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {RECOMMENDATIONS.map((rec) => {
              const Icon = rec.icon;
              const isSelected = recommendation === rec.value;
              return (
                <button
                  key={rec.value}
                  type="button"
                  onClick={() => setRecommendation(rec.value)}
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-lg border-2 px-3 py-3 text-sm font-medium transition-all",
                    isSelected
                      ? `${rec.color} border-current ring-2 ring-current/20`
                      : "border-gray-200 bg-white text-gray-600 hover:border-gray-300",
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {rec.label}
                </button>
              );
            })}
          </div>
        </section>

        {/* Rating scores */}
        <section className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Ratings</h2>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Overall Rating
              </label>
              <StarSelector value={overallScore} onChange={setOverallScore} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Technical Skills
              </label>
              <StarSelector value={technicalScore} onChange={setTechnicalScore} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Communication
              </label>
              <StarSelector value={communicationScore} onChange={setCommunicationScore} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Cultural Fit
              </label>
              <StarSelector value={culturalFitScore} onChange={setCulturalFitScore} />
            </div>
          </div>
        </section>

        {/* Custom Scorecard */}
        <section className="rounded-lg border border-gray-200 bg-white p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900">
              Custom Scorecard
            </h2>
            <button
              type="button"
              onClick={addScorecardItem}
              className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              <Plus className="h-3.5 w-3.5" /> Add Criteria
            </button>
          </div>

          {scorecardItems.length === 0 ? (
            <p className="text-sm text-gray-500">
              No custom criteria added. Click "Add Criteria" to evaluate specific skills.
            </p>
          ) : (
            <div className="space-y-3">
              {scorecardItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 rounded-md border border-gray-100 bg-gray-50 p-3"
                >
                  <input
                    type="text"
                    value={item.criteria}
                    onChange={(e) => updateScorecardItem(item.id, "criteria", e.target.value)}
                    placeholder="e.g., Problem Solving, System Design..."
                    className="flex-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                  <div className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => updateScorecardItem(item.id, "rating", i)}
                        className="p-0.5"
                      >
                        <Star
                          className={cn(
                            "h-5 w-5 transition-colors",
                            i <= item.rating
                              ? "fill-yellow-400 text-yellow-400"
                              : "text-gray-300 hover:text-yellow-300",
                          )}
                        />
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeScorecardItem(item.id)}
                    className="p-1 text-gray-400 hover:text-red-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Written feedback */}
        <section className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
          <h2 className="text-base font-semibold text-gray-900">Written Feedback</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Strengths</label>
            <textarea
              value={strengths}
              onChange={(e) => setStrengths(e.target.value)}
              rows={4}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              placeholder="What stood out positively? Key skills, qualities, or accomplishments demonstrated..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Weaknesses</label>
            <textarea
              value={weaknesses}
              onChange={(e) => setWeaknesses(e.target.value)}
              rows={4}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              placeholder="Areas of concern, gaps in knowledge, red flags..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Additional Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              placeholder="Any other observations, follow-up questions, or suggestions for the next round..."
            />
          </div>
        </section>

        {/* Error */}
        {submitMutation.isError && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {(submitMutation.error as any)?.response?.data?.error?.message ||
              "Failed to submit feedback. Please try again."}
          </div>
        )}

        {/* Submit */}
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => navigate(`/interviews/${id}`)}
            className="rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!recommendation || submitMutation.isPending}
            className="rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitMutation.isPending ? "Submitting..." : "Submit Feedback"}
          </button>
        </div>
      </form>
    </div>
  );
}
