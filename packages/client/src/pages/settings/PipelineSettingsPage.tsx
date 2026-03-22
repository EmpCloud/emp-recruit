import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  Plus,
  GripVertical,
  Trash2,
  Save,
  X,
} from "lucide-react";
import { apiGet, apiPost, apiPut, apiDelete } from "@/api/client";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

interface PipelineStage {
  id: string;
  name: string;
  slug: string;
  color: string;
  sort_order: number;
  is_default: boolean;
  is_active: boolean;
}

export function PipelineSettingsPage() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", color: "#6B7280" });
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const stagesQuery = useQuery({
    queryKey: ["pipeline-stages"],
    queryFn: async () => {
      const res = await apiGet<PipelineStage[]>("/pipeline/stages");
      return res.data || [];
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof form) => apiPost("/pipeline/stages", data),
    onSuccess: () => {
      toast.success("Stage created");
      queryClient.invalidateQueries({ queryKey: ["pipeline-stages"] });
      setShowCreate(false);
      setForm({ name: "", color: "#6B7280" });
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message || "Failed to create stage"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/pipeline/stages/${id}`),
    onSuccess: () => {
      toast.success("Stage deleted");
      queryClient.invalidateQueries({ queryKey: ["pipeline-stages"] });
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message || "Failed to delete stage"),
  });

  const reorderMutation = useMutation({
    mutationFn: (items: Array<{ id: string; sort_order: number }>) =>
      apiPut("/pipeline/stages/reorder", items),
    onSuccess: () => {
      toast.success("Stages reordered");
      queryClient.invalidateQueries({ queryKey: ["pipeline-stages"] });
    },
    onError: () => toast.error("Failed to reorder stages"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<PipelineStage> }) =>
      apiPut(`/pipeline/stages/${id}`, data),
    onSuccess: () => {
      toast.success("Stage updated");
      queryClient.invalidateQueries({ queryKey: ["pipeline-stages"] });
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message || "Failed to update stage"),
  });

  const stages = stagesQuery.data || [];

  function handleDragStart(idx: number) {
    setDragIdx(idx);
  }

  function handleDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) return;

    const reordered = [...stages];
    const [removed] = reordered.splice(dragIdx, 1);
    reordered.splice(idx, 0, removed);

    // Optimistically update
    queryClient.setQueryData(["pipeline-stages"], reordered);
    setDragIdx(idx);
  }

  function handleDragEnd() {
    if (dragIdx === null) return;
    setDragIdx(null);

    const items = stages.map((s, idx) => ({ id: s.id, sort_order: idx }));
    // Only reorder if stages have real IDs (not default- prefixed)
    const hasRealIds = items.every((i) => !i.id.startsWith("default-"));
    if (hasRealIds) {
      reorderMutation.mutate(items);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    createMutation.mutate(form);
  }

  if (stagesQuery.isLoading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Pipeline Stages</h2>
          <p className="mt-1 text-sm text-gray-500">
            Customize the stages in your recruitment pipeline. Drag to reorder.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          {showCreate ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showCreate ? "Cancel" : "Add Stage"}
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="text-base font-semibold text-gray-900">Add Custom Stage</h3>
          <form onSubmit={handleSubmit} className="mt-4 flex items-end gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700">Stage Name *</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Technical Test"
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Color</label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="color"
                  value={form.color}
                  onChange={(e) => setForm((p) => ({ ...p, color: e.target.value }))}
                  className="h-10 w-12 cursor-pointer rounded border border-gray-300"
                />
                <input
                  type="text"
                  value={form.color}
                  onChange={(e) => setForm((p) => ({ ...p, color: e.target.value }))}
                  className="block w-24 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {createMutation.isPending ? "Adding..." : "Add"}
            </button>
          </form>
        </div>
      )}

      {/* Stage list */}
      <div className="space-y-2">
        {stages.map((stage, idx) => (
          <div
            key={stage.id}
            draggable
            onDragStart={() => handleDragStart(idx)}
            onDragOver={(e) => handleDragOver(e, idx)}
            onDragEnd={handleDragEnd}
            className={cn(
              "flex items-center gap-3 rounded-xl border bg-white p-4 shadow-sm transition-all",
              dragIdx === idx ? "border-brand-400 shadow-md" : "border-gray-200",
            )}
          >
            <div className="cursor-grab text-gray-400 hover:text-gray-600">
              <GripVertical className="h-5 w-5" />
            </div>

            <div
              className="h-6 w-6 rounded-full border border-gray-200 flex-shrink-0"
              style={{ backgroundColor: stage.color }}
            />

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-900">{stage.name}</span>
                <span className="text-xs text-gray-400 font-mono">{stage.slug}</span>
                {stage.is_default && (
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                    Default
                  </span>
                )}
              </div>
            </div>

            {/* Color picker inline */}
            <input
              type="color"
              value={stage.color}
              onChange={(e) => {
                if (!stage.id.startsWith("default-")) {
                  updateMutation.mutate({ id: stage.id, data: { color: e.target.value } });
                }
              }}
              className="h-8 w-10 cursor-pointer rounded border border-gray-200"
              title="Change color"
            />

            {!stage.is_default && (
              <button
                onClick={() => deleteMutation.mutate(stage.id)}
                disabled={deleteMutation.isPending}
                className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                title="Delete stage"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
      </div>

      {stages.length === 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
          <p className="text-sm text-gray-500">
            Using default pipeline stages. Add a custom stage to start customizing.
          </p>
        </div>
      )}
    </div>
  );
}
