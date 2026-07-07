// ============================================================================
// TAKE SURVEY (PUBLIC) — a candidate opens this via a survey link with a token.
// No auth. Backend: GET /surveys/take/:token, POST /surveys/respond/:token.
// ============================================================================

import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Loader2, CheckCircle2 } from "lucide-react";
import axios from "axios";

const API = "/api/v1/surveys";

interface Question { key: string; label: string; type: "rating" | "text" }
interface TakeData {
  survey: { survey_type: string; status?: string };
  questions: Question[];
}

const SURVEY_TITLE: Record<string, string> = {
  post_interview: "Interview Experience Survey",
  post_offer: "Offer Experience Survey",
  post_rejection: "Candidate Feedback Survey",
};

export function TakeSurveyPage() {
  const { token } = useParams<{ token: string }>();
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["take-survey", token],
    queryFn: async () => {
      const res = await axios.get(`${API}/take/${token}`);
      return (res.data?.data || res.data) as TakeData;
    },
    enabled: !!token,
    retry: false,
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const responses = (data?.questions || []).map((q) =>
        q.type === "rating"
          ? { question_key: q.key, rating: ratings[q.key] }
          : { question_key: q.key, text_response: texts[q.key] || "" },
      ).filter((r) => ("rating" in r ? r.rating != null : (r.text_response || "").length > 0));
      const res = await axios.post(`${API}/respond/${token}`, { responses });
      return res.data;
    },
    onSuccess: () => setSubmitted(true),
  });

  if (isLoading) return <Centered><Loader2 className="h-8 w-8 animate-spin text-brand-600" /></Centered>;
  if (isError || !data) {
    return (
      <Centered>
        <div className="text-center">
          <p className="text-lg font-medium text-gray-900">This survey link is invalid or has expired.</p>
        </div>
      </Centered>
    );
  }
  if (data.survey.status === "completed" || submitted) {
    return (
      <Centered>
        <div className="text-center">
          <CheckCircle2 className="mx-auto mb-3 h-14 w-14 text-emerald-500" />
          <h1 className="text-xl font-bold text-gray-900">Thank you for your feedback!</h1>
          <p className="mt-1 text-sm text-gray-500">Your response has been recorded. You can close this window.</p>
        </div>
      </Centered>
    );
  }

  const title = SURVEY_TITLE[data.survey.survey_type] || "Feedback Survey";
  const allRated = data.questions.filter((q) => q.type === "rating").every((q) => ratings[q.key] != null);

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="mx-auto max-w-2xl px-4">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 sm:p-8">
          <h1 className="text-xl font-bold text-gray-900">{title}</h1>
          <p className="mt-1 text-sm text-gray-500">Your feedback helps us improve. It only takes a minute.</p>

          <div className="mt-6 space-y-6">
            {data.questions.map((q) => (
              <div key={q.key}>
                <label className="mb-2 block text-sm font-medium text-gray-900">{q.label}</label>
                {q.type === "rating" ? (
                  <div className="flex flex-wrap gap-1.5">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                      <button
                        key={n}
                        onClick={() => setRatings((r) => ({ ...r, [q.key]: n }))}
                        className={`h-9 w-9 rounded-lg border text-sm font-medium transition-colors ${
                          ratings[q.key] === n ? "border-brand-500 bg-brand-600 text-white" : "border-gray-300 text-gray-600 hover:bg-gray-50"
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                ) : (
                  <textarea
                    value={texts[q.key] || ""}
                    onChange={(e) => setTexts((t) => ({ ...t, [q.key]: e.target.value }))}
                    rows={3}
                    placeholder="Your answer…"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
                  />
                )}
              </div>
            ))}
          </div>

          <button
            onClick={() => submitMutation.mutate()}
            disabled={!allRated || submitMutation.isPending}
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {submitMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Submit feedback
          </button>
        </div>
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">{children}</div>;
}
