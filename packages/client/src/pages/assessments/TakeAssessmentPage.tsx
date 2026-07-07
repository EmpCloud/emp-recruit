// ============================================================================
// TAKE ASSESSMENT (PUBLIC) — a candidate opens this via an invite link with a
// token. No auth. Backend: GET /assessments/take/:token, POST /submit/:token.
// ============================================================================

import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Loader2, CheckCircle2, Clock, ArrowRight, ArrowLeft } from "lucide-react";
import axios from "axios";

const API = "/api/v1/assessments";

interface Question {
  question: string;
  options: string[];
  type: "multiple_choice" | "true_false" | "scale" | "text";
}
interface TakeData {
  template: { name: string; description: string | null; assessment_type: string; time_limit_minutes: number | null };
  questions: Question[];
  status?: string;
}

export function TakeAssessmentPage() {
  const { token } = useParams<{ token: string }>();
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["take-assessment", token],
    queryFn: async () => {
      const res = await axios.get(`${API}/take/${token}`);
      return (res.data?.data || res.data) as TakeData;
    },
    enabled: !!token,
    retry: false,
  });

  const questions = data?.questions || [];

  // Start the countdown once loaded.
  useEffect(() => {
    if (data?.template.time_limit_minutes && secondsLeft === null) {
      setSecondsLeft(data.template.time_limit_minutes * 60);
    }
  }, [data, secondsLeft]);

  const submitMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        answers: questions.map((_, idx) => ({
          question_index: idx,
          answer: answers[idx] || "",
        })).filter((a) => a.answer !== ""),
      };
      const res = await axios.post(`${API}/submit/${token}`, payload);
      return res.data?.data || res.data;
    },
    onSuccess: () => setSubmitted(true),
  });

  // Countdown tick + auto-submit at zero.
  useEffect(() => {
    if (secondsLeft === null || submitted) return;
    if (secondsLeft <= 0) { submitMutation.mutate(); return; }
    const t = setTimeout(() => setSecondsLeft((s) => (s === null ? null : s - 1)), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft, submitted]);

  if (isLoading) {
    return <Centered><Loader2 className="h-8 w-8 animate-spin text-brand-600" /></Centered>;
  }
  if (isError || !data) {
    return (
      <Centered>
        <div className="text-center">
          <p className="text-lg font-medium text-gray-900">This assessment link is invalid or has expired.</p>
          <p className="mt-1 text-sm text-gray-500">Please contact the recruiter for a new invitation.</p>
        </div>
      </Centered>
    );
  }
  if (data.status === "completed" || submitted) {
    return (
      <Centered>
        <div className="text-center">
          <CheckCircle2 className="mx-auto mb-3 h-14 w-14 text-emerald-500" />
          <h1 className="text-xl font-bold text-gray-900">Assessment submitted</h1>
          <p className="mt-1 text-sm text-gray-500">Thank you — your responses have been recorded. You can close this window.</p>
        </div>
      </Centered>
    );
  }

  const q = questions[current];
  const answered = Object.keys(answers).length;
  const progress = Math.round((answered / questions.length) * 100);
  const isLast = current === questions.length - 1;

  function setAnswer(v: string) { setAnswers((a) => ({ ...a, [current]: v })); }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="mx-auto max-w-2xl px-4">
        {/* Header */}
        <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">{data.template.name}</h1>
              {data.template.description && <p className="mt-1 text-sm text-gray-500">{data.template.description}</p>}
            </div>
            {secondsLeft !== null && (
              <div className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold ${secondsLeft < 60 ? "bg-red-50 text-red-700" : "bg-gray-100 text-gray-700"}`}>
                <Clock className="h-4 w-4" /> {fmtTime(secondsLeft)}
              </div>
            )}
          </div>
          <div className="mt-4">
            <div className="mb-1 flex justify-between text-xs text-gray-500">
              <span>Question {current + 1} of {questions.length}</span>
              <span>{answered}/{questions.length} answered</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
              <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>

        {/* Question */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6">
          <p className="mb-4 whitespace-pre-wrap text-base font-medium text-gray-900">{q.question}</p>
          <QuestionInput q={q} value={answers[current] || ""} onChange={setAnswer} />

          <div className="mt-6 flex items-center justify-between">
            <button
              onClick={() => setCurrent((c) => Math.max(0, c - 1))}
              disabled={current === 0}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
            {isLast ? (
              <button
                onClick={() => submitMutation.mutate()}
                disabled={submitMutation.isPending}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-6 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {submitMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Submit
              </button>
            ) : (
              <button
                onClick={() => setCurrent((c) => Math.min(questions.length - 1, c + 1))}
                className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-6 py-2 text-sm font-semibold text-white hover:bg-brand-700"
              >
                Next <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function QuestionInput({ q, value, onChange }: { q: Question; value: string; onChange: (v: string) => void }) {
  if (q.type === "text") {
    // Coding/technical questions typically include an example like "Input:" /
    // "Output:" or code — use a monospace, tab-aware editor for those.
    const looksLikeCoding = /```|input:|output:|function |class |def |algorithm|complexity|write (a|the) (code|function|program)/i.test(q.question);
    return (
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          // Allow Tab to indent inside code answers instead of leaving the field.
          if (looksLikeCoding && e.key === "Tab") {
            e.preventDefault();
            const t = e.currentTarget;
            const s = t.selectionStart, en = t.selectionEnd;
            const next = value.slice(0, s) + "  " + value.slice(en);
            onChange(next);
            requestAnimationFrame(() => { t.selectionStart = t.selectionEnd = s + 2; });
          }
        }}
        rows={looksLikeCoding ? 12 : 5}
        placeholder={looksLikeCoding ? "Write your code / solution here…" : "Type your answer…"}
        spellCheck={!looksLikeCoding}
        className={
          looksLikeCoding
            ? "w-full rounded-lg border border-gray-300 bg-gray-900 px-3 py-2 font-mono text-sm text-gray-100 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
            : "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
        }
      />
    );
  }
  const options = q.type === "true_false" ? ["True", "False"]
    : q.type === "scale" ? ["1", "2", "3", "4", "5"]
    : q.options;
  return (
    <div className="space-y-2">
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={`flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm transition-colors ${
            value === opt ? "border-brand-400 bg-brand-50 text-brand-800" : "border-gray-200 hover:bg-gray-50 text-gray-700"
          }`}
        >
          <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${value === opt ? "border-brand-500 bg-brand-500" : "border-gray-300"}`}>
            {value === opt && <span className="h-2 w-2 rounded-full bg-white" />}
          </span>
          {opt}
        </button>
      ))}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">{children}</div>;
}
function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}
