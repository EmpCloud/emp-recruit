// ============================================================================
// ASSESSMENT TEMPLATES — recruiter-facing management of psychometric /
// skills assessment templates. Backend: /api/v1/assessments/templates.
// Create a template (name, type, time limit, questions), list, and view.
// ============================================================================

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Loader2, ClipboardList, Clock, Trash2, X, GripVertical, FileQuestion, Sparkles,
} from "lucide-react";
import { apiGet, apiPost } from "@/api/client";
import { cn, aiErrorMessage } from "@/lib/utils";
import toast from "react-hot-toast";
import type { AssessmentTemplate, AssessmentQuestion } from "@emp-recruit/shared";

const TYPE_META: Record<string, { label: string; cls: string }> = {
  behavioral: { label: "Behavioral", cls: "bg-blue-50 text-blue-700" },
  cognitive: { label: "Cognitive", cls: "bg-purple-50 text-purple-700" },
  personality: { label: "Personality", cls: "bg-emerald-50 text-emerald-700" },
  situational: { label: "Situational", cls: "bg-amber-50 text-amber-700" },
};

const QUESTION_TYPES = [
  { value: "multiple_choice", label: "Multiple choice" },
  { value: "true_false", label: "True / False" },
  { value: "scale", label: "Scale (1-5)" },
  { value: "text", label: "Free text" },
] as const;

export function AssessmentTemplatesPage() {
  const [showCreate, setShowCreate] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["assessment-templates"],
    queryFn: () => apiGet<AssessmentTemplate[]>("/assessments/templates"),
  });
  const templates: AssessmentTemplate[] = (data?.data as any) ?? [];

  function questionCount(t: AssessmentTemplate): number {
    const q = typeof t.questions === "string" ? safeParse(t.questions) : t.questions;
    return Array.isArray(q) ? q.length : 0;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Assessments</h1>
          <p className="mt-1 text-sm text-gray-500">
            Create psychometric &amp; skills assessments, then invite candidates to take them.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" /> New template
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-gray-400" /></div>
      ) : templates.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 py-16 text-center">
          <ClipboardList className="mx-auto mb-3 h-10 w-10 text-gray-300" />
          <p className="text-sm text-gray-500">No assessment templates yet.</p>
          <button onClick={() => setShowCreate(true)} className="mt-2 text-sm font-medium text-brand-600 hover:underline">
            Create your first template
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => {
            const meta = TYPE_META[t.assessment_type] || { label: t.assessment_type, cls: "bg-gray-100 text-gray-600" };
            return (
              <div key={t.id} className="rounded-xl border border-gray-200 bg-white p-5">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-gray-900">{t.name}</h3>
                  <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-medium", meta.cls)}>{meta.label}</span>
                </div>
                {t.description && <p className="mb-3 line-clamp-2 text-sm text-gray-500">{t.description}</p>}
                <div className="flex items-center gap-4 text-xs text-gray-500">
                  <span className="inline-flex items-center gap-1"><FileQuestion className="h-3.5 w-3.5" />{questionCount(t)} questions</span>
                  {t.time_limit_minutes ? (
                    <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{t.time_limit_minutes} min</span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showCreate && <CreateTemplateModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}

function safeParse(s: string): any {
  try { return JSON.parse(s); } catch { return []; }
}

// ---------------------------------------------------------------------------
// Create template modal — with a questions builder.
// ---------------------------------------------------------------------------
type DraftQuestion = AssessmentQuestion & { _optionsText?: string };

function CreateTemplateModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<AssessmentQuestion["type"] extends never ? string : string>("behavioral");
  const [timeLimit, setTimeLimit] = useState("30");
  const [questions, setQuestions] = useState<DraftQuestion[]>([
    { question: "", options: [], type: "multiple_choice", correct_answer: null, _optionsText: "" },
  ]);

  // --- AI generation controls ---
  const [aiJobId, setAiJobId] = useState("");
  const [aiTopic, setAiTopic] = useState("");
  const [aiCount, setAiCount] = useState("10");
  const [aiDifficulty, setAiDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [aiQuestionType, setAiQuestionType] = useState<"multiple_choice" | "true_false" | "mixed">("multiple_choice");
  const [aiError, setAiError] = useState<string | null>(null);

  // Jobs to base the assessment on.
  const { data: jobsData } = useQuery({
    queryKey: ["jobs-for-assessment"],
    queryFn: () => apiGet<any>("/jobs", { perPage: 100 }),
  });
  const jobs: any[] = (jobsData?.data as any)?.data ?? [];

  const generateMutation = useMutation({
    mutationFn: () =>
      apiPost<any>("/assessments/generate", {
        job_id: aiJobId || undefined,
        topic: aiJobId ? undefined : aiTopic || undefined,
        assessment_type: type,
        num_questions: Number(aiCount) || 10,
        difficulty: aiDifficulty,
        question_type: aiQuestionType,
      }),
    onSuccess: (res: any) => {
      const gen = res?.data || res;
      if (gen?.name && !name) setName(gen.name);
      if (gen?.description && !description) setDescription(gen.description);
      const mapped: DraftQuestion[] = (gen.questions || []).map((q: any) => ({
        question: q.question,
        type: q.type,
        options: q.options || [],
        correct_answer: q.correct_answer || null,
        _optionsText: (q.options || []).join("\n"),
      }));
      if (mapped.length) setQuestions(mapped);
      setAiError(null);
      toast.success(`Generated ${mapped.length} questions — review and edit as needed.`);
    },
    onError: (err: any) => {
      const msg = aiErrorMessage(err, "Couldn't generate questions. Please try again.");
      setAiError(msg);
      toast.error(msg);
    },
  });

  const createMutation = useMutation({
    mutationFn: (payload: any) => apiPost("/assessments/templates", payload),
    onSuccess: () => {
      toast.success("Assessment template created");
      queryClient.invalidateQueries({ queryKey: ["assessment-templates"] });
      onClose();
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message || "Could not create template"),
  });

  function updateQ(i: number, patch: Partial<DraftQuestion>) {
    setQuestions((qs) => qs.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));
  }
  function addQuestion() {
    setQuestions((qs) => [...qs, { question: "", options: [], type: "multiple_choice", correct_answer: null, _optionsText: "" }]);
  }
  function removeQuestion(i: number) {
    setQuestions((qs) => qs.filter((_, idx) => idx !== i));
  }

  function submit() {
    if (name.trim().length < 2) { toast.error("Template name is required"); return; }
    const cleaned = questions
      .map((q) => {
        const options = q.type === "true_false"
          ? ["True", "False"]
          : q.type === "scale"
          ? ["1", "2", "3", "4", "5"]
          : (q._optionsText || "").split("\n").map((s) => s.trim()).filter(Boolean);
        return {
          question: q.question.trim(),
          type: q.type,
          options,
          correct_answer: q.correct_answer || null,
        };
      })
      .filter((q) => q.question.length > 0);

    if (cleaned.length === 0) { toast.error("Add at least one question"); return; }
    // Validate multiple_choice has options.
    for (const q of cleaned) {
      if (q.type === "multiple_choice" && q.options.length < 2) {
        toast.error(`"${q.question.slice(0, 30)}…" needs at least 2 options (one per line).`);
        return;
      }
    }

    createMutation.mutate({
      name: name.trim(),
      description: description.trim() || undefined,
      assessment_type: type,
      time_limit_minutes: timeLimit ? Number(timeLimit) : undefined,
      questions: cleaned,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <h3 className="text-base font-semibold text-gray-900">New assessment template</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium text-gray-700">Template name *</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Cognitive aptitude"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Type</label>
              <select value={type} onChange={(e) => setType(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm capitalize focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500">
                {Object.keys(TYPE_META).map((k) => <option key={k} value={k}>{TYPE_META[k].label}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Time limit (minutes)</label>
              <input type="number" min={1} max={480} value={timeLimit} onChange={(e) => setTimeLimit(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium text-gray-700">Description</label>
              <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
            </div>
          </div>

          {/* AI generation panel */}
          <div className="rounded-xl border border-brand-100 bg-brand-50/40 p-4">
            <div className="mb-3 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-brand-600" />
              <h4 className="text-sm font-semibold text-brand-800">Generate with AI</h4>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-gray-600">Base on a job (optional)</label>
                <select value={aiJobId} onChange={(e) => setAiJobId(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none">
                  <option value="">— No job (use a topic instead) —</option>
                  {jobs.map((j) => <option key={j.id} value={j.id}>{j.title}{j.department ? ` · ${j.department}` : ""}</option>)}
                </select>
              </div>
              {!aiJobId && (
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-gray-600">Or topic / skill</label>
                  <input value={aiTopic} onChange={(e) => setAiTopic(e.target.value)} placeholder="e.g. JavaScript fundamentals, SQL, Data structures"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none" />
                </div>
              )}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600"># Questions</label>
                <input type="number" min={1} max={30} value={aiCount} onChange={(e) => setAiCount(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Difficulty</label>
                <select value={aiDifficulty} onChange={(e) => setAiDifficulty(e.target.value as any)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm capitalize focus:border-brand-500 focus:outline-none">
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-gray-600">Question format</label>
                <select value={aiQuestionType} onChange={(e) => setAiQuestionType(e.target.value as any)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none">
                  <option value="multiple_choice">Multiple choice</option>
                  <option value="true_false">True / False</option>
                  <option value="mixed">Mixed</option>
                  <option value="coding">Coding / technical (written answers)</option>
                </select>
              </div>
            </div>
            {aiError && (
              <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <span className="mt-px">⚠️</span>
                <span>{aiError}</span>
              </div>
            )}
            <button
              onClick={() => { setAiError(null); generateMutation.mutate(); }}
              disabled={generateMutation.isPending || (!aiJobId && aiTopic.trim().length < 2)}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {generateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {generateMutation.isPending ? "Generating…" : aiError ? "Try again" : "Generate questions with AI"}
            </button>
            <p className="mt-1.5 text-xs text-gray-400">Fills the questions below — review and edit before creating.</p>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-gray-900">Questions ({questions.length})</h4>
              <button onClick={addQuestion} className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline">
                <Plus className="h-3.5 w-3.5" /> Add question
              </button>
            </div>

            <div className="space-y-3">
              {questions.map((q, i) => (
                <div key={i} className="rounded-lg border border-gray-200 p-3">
                  <div className="mb-2 flex items-start gap-2">
                    <GripVertical className="mt-2 h-4 w-4 shrink-0 text-gray-300" />
                    <input
                      value={q.question}
                      onChange={(e) => updateQ(i, { question: e.target.value })}
                      placeholder={`Question ${i + 1}`}
                      className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    />
                    <select
                      value={q.type}
                      onChange={(e) => updateQ(i, { type: e.target.value as any })}
                      className="shrink-0 rounded-lg border border-gray-300 px-2 py-2 text-xs focus:border-brand-500 focus:outline-none"
                    >
                      {QUESTION_TYPES.map((qt) => <option key={qt.value} value={qt.value}>{qt.label}</option>)}
                    </select>
                    {questions.length > 1 && (
                      <button onClick={() => removeQuestion(i)} className="mt-1 rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  {q.type === "multiple_choice" && (
                    <div className="ml-6">
                      <textarea
                        value={q._optionsText}
                        onChange={(e) => updateQ(i, { _optionsText: e.target.value })}
                        rows={3}
                        placeholder="One option per line"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                      />
                      <input
                        value={q.correct_answer || ""}
                        onChange={(e) => updateQ(i, { correct_answer: e.target.value })}
                        placeholder="Correct answer (optional — for scored assessments)"
                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:border-brand-500 focus:outline-none"
                      />
                    </div>
                  )}
                  {q.type === "true_false" && (
                    <div className="ml-6">
                      <select value={q.correct_answer || ""} onChange={(e) => updateQ(i, { correct_answer: e.target.value })}
                        className="rounded-lg border border-gray-300 px-2 py-1 text-xs focus:border-brand-500 focus:outline-none">
                        <option value="">No correct answer</option>
                        <option value="True">Correct: True</option>
                        <option value="False">Correct: False</option>
                      </select>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-4">
          <button onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
          <button onClick={submit} disabled={createMutation.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
            {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Create template
          </button>
        </div>
      </div>
    </div>
  );
}
