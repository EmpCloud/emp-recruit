import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Brain,
  Target,
  BarChart,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { apiGet, apiPost } from "@/api/client";
import toast from "react-hot-toast";
import type { CandidateScore } from "@emp-recruit/shared";
import { cn, aiErrorMessage } from "@/lib/utils";

const RECOMMENDATION_CONFIG: Record<
  string,
  { label: string; className: string; description: string }
> = {
  strong_match: {
    label: "Strong Match",
    className: "bg-green-100 text-green-800 border-green-200",
    description: "This candidate is an excellent fit for the position.",
  },
  good_match: {
    label: "Good Match",
    className: "bg-blue-100 text-blue-800 border-blue-200",
    description: "This candidate is a solid fit with most requirements met.",
  },
  partial_match: {
    label: "Partial Match",
    className: "bg-yellow-100 text-yellow-800 border-yellow-200",
    description: "This candidate meets some requirements but has gaps.",
  },
  weak_match: {
    label: "Weak Match",
    className: "bg-red-100 text-red-800 border-red-200",
    description: "This candidate does not meet most of the requirements.",
  },
};

function CircularProgress({
  score,
  size = 160,
  strokeWidth = 12,
}: {
  score: number;
  size?: number;
  strokeWidth?: number;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (score / 100) * circumference;

  const color =
    score >= 80
      ? "#16a34a"
      : score >= 50
        ? "#ca8a04"
        : "#dc2626";

  const bgColor =
    score >= 80
      ? "#dcfce7"
      : score >= 50
        ? "#fef9c3"
        : "#fef2f2";

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={bgColor}
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-4xl font-bold" style={{ color }}>
          {score}
        </span>
        <span className="text-sm text-gray-500">out of 100</span>
      </div>
    </div>
  );
}

function ProgressBar({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
}) {
  const color =
    value >= 80
      ? "bg-green-500"
      : value >= 50
        ? "bg-yellow-500"
        : "bg-red-500";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="inline-flex items-center gap-1.5 font-medium text-gray-700">
          {icon}
          {label}
        </span>
        <span className="font-semibold text-gray-900">{value}/100</span>
      </div>
      <div className="h-3 w-full rounded-full bg-gray-100">
        <div
          className={cn("h-3 rounded-full transition-all duration-700 ease-out", color)}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

export function ScoreReportPage() {
  const { appId } = useParams<{ appId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: scoreData, isLoading } = useQuery({
    queryKey: ["score-report", appId],
    queryFn: () => apiGet<CandidateScore & { status?: string; report_json?: string }>(`/scoring/applications/${appId}`),
    enabled: Boolean(appId),
    // Poll while the AI is still scoring in the background.
    refetchInterval: (q) => {
      const s: any = (q.state.data as any)?.data;
      return s?.status === "processing" ? 4000 : false;
    },
  });

  // Re-evaluate: kicks off a fresh AI scoring run in the background, then the
  // query above polls until it completes.
  const reevaluate = useMutation({
    mutationFn: () => apiPost(`/scoring/applications/${appId}/score`),
    onSuccess: () => {
      toast.success("Re-evaluating with AI… this can take up to a minute.");
      // Optimistically flip to processing so the spinner shows + polling starts.
      queryClient.setQueryData(["score-report", appId], (old: any) =>
        old?.data ? { ...old, data: { ...old.data, status: "processing" } } : old,
      );
      queryClient.invalidateQueries({ queryKey: ["score-report", appId] });
    },
    onError: (err: any) => toast.error(aiErrorMessage(err, "Couldn't start the evaluation. Please try again.")),
  });

  const score = scoreData?.data as any;

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
      </div>
    );
  }

  // AI scoring runs in the background (~30-90s with a reasoning model).
  if (score?.status === "processing") {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <div className="rounded-xl border border-gray-200 bg-white py-16 text-center">
          <Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-purple-600" />
          <h2 className="text-lg font-semibold text-gray-900">AI is evaluating this candidate…</h2>
          <p className="mt-1 text-sm text-gray-500">Reading the resume against the job. This can take up to a minute.</p>
        </div>
      </div>
    );
  }
  if (score?.status === "failed") {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <div className="rounded-xl border border-red-200 bg-red-50 py-12 text-center">
          <p className="font-medium text-red-800">AI scoring failed for this candidate.</p>
          <p className="mt-1 text-sm text-red-600">The AI provider may have been rate-limited. Try again.</p>
          <button
            onClick={() => reevaluate.mutate()}
            disabled={reevaluate.isPending}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {reevaluate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Re-evaluate
          </button>
        </div>
      </div>
    );
  }

  if (!score) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <div className="py-12 text-center">
          <Brain className="mx-auto h-12 w-12 text-gray-300" />
          <p className="mt-3 text-gray-500">
            No score report yet for this application.
          </p>
          <p className="text-sm text-gray-400 mt-1">
            Run an AI evaluation to score this candidate against the job.
          </p>
          <button
            onClick={() => reevaluate.mutate()}
            disabled={reevaluate.isPending}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {reevaluate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
            Evaluate with AI
          </button>
        </div>
      </div>
    );
  }

  let matchedSkills: string[] = [];
  try {
    matchedSkills = score.matched_skills
      ? Array.isArray(score.matched_skills)
        ? score.matched_skills
        : JSON.parse(score.matched_skills)
      : [];
  } catch { matchedSkills = []; }
  let missingSkills: string[] = [];
  try {
    missingSkills = score.missing_skills
      ? Array.isArray(score.missing_skills)
        ? score.missing_skills
        : JSON.parse(score.missing_skills)
      : [];
  } catch { missingSkills = []; }

  // Full AI reasoning ("why" behind the score).
  let report: any = {};
  try {
    report = score.report_json
      ? (typeof score.report_json === "string" ? JSON.parse(score.report_json) : score.report_json)
      : {};
  } catch { report = {}; }
  const strengths: string[] = Array.isArray(report.strengths) ? report.strengths : [];
  const concerns: string[] = Array.isArray(report.concerns) ? report.concerns : [];
  const usedAI: boolean = report.usedAI === true;
  const rec = RECOMMENDATION_CONFIG[score.recommendation];

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Back button */}
      <button
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>

      {/* Page title + re-evaluate */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Brain className="h-7 w-7 text-purple-600" />
          <h1 className="text-2xl font-bold text-gray-900">AI Score Report</h1>
        </div>
        <button
          onClick={() => reevaluate.mutate()}
          disabled={reevaluate.isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {reevaluate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Re-evaluate
        </button>
      </div>
      {score?.scored_at && (
        <p className="-mt-3 text-xs text-gray-400">
          Last evaluated {new Date(score.scored_at).toLocaleString()}
        </p>
      )}

      {/* Overall Score */}
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
        <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-6">
          Overall Match Score
        </h2>
        <CircularProgress score={score.overall_score} />

        {/* Recommendation badge */}
        {rec && (
          <div className="mt-6">
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-4 py-1.5 text-sm font-semibold",
                rec.className,
              )}
            >
              {rec.label}
            </span>
            <p className="mt-2 text-sm text-gray-500">{rec.description}</p>
          </div>
        )}
      </div>

      {/* Honest banner when this is a keyword (non-AI) score. */}
      {!usedAI && (score as any).ai_summary && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          This is a <strong>keyword-match</strong> score, not a full AI evaluation. Re-run <strong>AI Score</strong> from the pipeline
          to get an AI assessment with reasoning.
        </div>
      )}

      {/* AI assessment — the reasoned report: why this score. */}
      {((score as any).ai_summary || report.summary || strengths.length || concerns.length) && (
        <div className="space-y-4 rounded-xl border border-purple-100 bg-purple-50/40 p-6">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-purple-800">
            <Brain className="h-4 w-4" /> {usedAI ? "AI assessment" : "Assessment"}
          </h2>

          {(report.summary || (score as any).ai_summary) && (
            <p className="text-sm leading-relaxed text-gray-700">{report.summary || (score as any).ai_summary}</p>
          )}

          {/* Per-dimension reasoning — WHY each sub-score. */}
          {(report.skills_reasoning || report.experience_reasoning) && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {report.skills_reasoning && (
                <div className="rounded-lg border border-gray-100 bg-white p-3">
                  <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-gray-700"><Target className="h-3.5 w-3.5 text-purple-500" /> Why the skills score</div>
                  <p className="text-sm text-gray-600">{report.skills_reasoning}</p>
                </div>
              )}
              {report.experience_reasoning && (
                <div className="rounded-lg border border-gray-100 bg-white p-3">
                  <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-gray-700"><BarChart className="h-3.5 w-3.5 text-blue-500" /> Why the experience score</div>
                  <p className="text-sm text-gray-600">{report.experience_reasoning}</p>
                </div>
              )}
            </div>
          )}

          {/* Strengths + concerns — the "why high / why low". */}
          {(strengths.length > 0 || concerns.length > 0) && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {strengths.length > 0 && (
                <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 p-3">
                  <div className="mb-1.5 text-xs font-semibold text-emerald-700">Strengths</div>
                  <ul className="list-disc space-y-1 pl-4 text-sm text-gray-700">
                    {strengths.map((s, i) => <li key={i}>{s}</li>)}
                  </ul>
                </div>
              )}
              {concerns.length > 0 && (
                <div className="rounded-lg border border-red-100 bg-red-50/60 p-3">
                  <div className="mb-1.5 text-xs font-semibold text-red-700">Concerns / why the score is lower</div>
                  <ul className="list-disc space-y-1 pl-4 text-sm text-gray-700">
                    {concerns.map((c, i) => <li key={i}>{c}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Score Breakdown */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-6">
        <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider">
          Score Breakdown
        </h2>

        <ProgressBar
          label="Skills Match"
          value={score.skills_score}
          icon={<Target className="h-4 w-4 text-purple-500" />}
        />

        <ProgressBar
          label="Experience Match"
          value={score.experience_score}
          icon={<BarChart className="h-4 w-4 text-blue-500" />}
        />

        <p className="text-xs text-gray-400">
          Overall = Skills (60%) + Experience (40%)
        </p>
      </div>

      {/* Skills Analysis */}
      {(matchedSkills.length > 0 || missingSkills.length > 0) && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
          <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider">
            Skills Analysis
          </h2>

          {matchedSkills.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-green-700 mb-2">
                Matched Skills ({matchedSkills.length})
              </h3>
              <div className="flex flex-wrap gap-2">
                {matchedSkills.map((skill) => (
                  <span
                    key={skill}
                    className="inline-flex items-center rounded-full bg-green-50 border border-green-200 px-3 py-1 text-sm text-green-800"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}

          {missingSkills.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-red-700 mb-2">
                Missing Skills ({missingSkills.length})
              </h3>
              <div className="flex flex-wrap gap-2">
                {missingSkills.map((skill) => (
                  <span
                    key={skill}
                    className="inline-flex items-center rounded-full bg-red-50 border border-red-200 px-3 py-1 text-sm text-red-700"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Meta info */}
      <div className="text-xs text-gray-400 text-center pb-4">
        Scored at: {new Date(score.scored_at).toLocaleString()}
      </div>
    </div>
  );
}
