import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ClipboardList,
  Plus,
  Pencil,
  Trash2,
  GripVertical,
  ChevronDown,
  ChevronRight,
  Save,
  X,
} from "lucide-react";
import { apiGet, apiPost, apiPut, apiDelete } from "@/api/client";
import type { OnboardingTemplate, OnboardingTemplateTask } from "@emp-recruit/shared";

type TemplateWithCount = OnboardingTemplate & { task_count: number };

interface TemplateFormData {
  name: string;
  description: string;
  department: string;
  is_default: boolean;
}

interface TaskFormData {
  title: string;
  description: string;
  category: string;
  assignee_role: string;
  due_days: number;
  order: number;
  is_required: boolean;
}

const EMPTY_TEMPLATE: TemplateFormData = { name: "", description: "", department: "", is_default: false };
const EMPTY_TASK: TaskFormData = { title: "", description: "", category: "general", assignee_role: "", due_days: 0, order: 1, is_required: true };

const CATEGORIES = ["general", "documentation", "it_setup", "training", "compliance", "orientation", "equipment"];

export function OnboardingTemplatesPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<string | null>(null);
  const [formData, setFormData] = useState<TemplateFormData>(EMPTY_TEMPLATE);
  const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null);
  const [showTaskForm, setShowTaskForm] = useState<string | null>(null);
  const [taskFormData, setTaskFormData] = useState<TaskFormData>(EMPTY_TASK);

  // Fetch templates
  const { data: templatesRes, isLoading } = useQuery({
    queryKey: ["onboarding-templates"],
    queryFn: () => apiGet<TemplateWithCount[]>("/onboarding/templates"),
  });
  const templates = templatesRes?.data || [];

  // Fetch tasks for expanded template
  const { data: tasksRes } = useQuery({
    queryKey: ["onboarding-template-tasks", expandedTemplate],
    queryFn: async () => {
      // We get tasks by fetching template detail which includes tasks via the list
      // Actually tasks come from a separate endpoint - we'll fetch them inline
      const res = await apiGet<OnboardingTemplateTask[]>(`/onboarding/templates/${expandedTemplate}/tasks`);
      return res;
    },
    enabled: !!expandedTemplate,
  });
  const tasks = tasksRes?.data || [];

  // Mutations
  const createTemplate = useMutation({
    mutationFn: (data: TemplateFormData) => apiPost("/onboarding/templates", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["onboarding-templates"] });
      setShowForm(false);
      setFormData(EMPTY_TEMPLATE);
    },
  });

  const updateTemplate = useMutation({
    mutationFn: ({ id, data }: { id: string; data: TemplateFormData }) =>
      apiPut(`/onboarding/templates/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["onboarding-templates"] });
      setEditingTemplate(null);
      setFormData(EMPTY_TEMPLATE);
    },
  });

  const addTask = useMutation({
    mutationFn: ({ templateId, data }: { templateId: string; data: TaskFormData }) =>
      apiPost(`/onboarding/templates/${templateId}/tasks`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["onboarding-template-tasks", expandedTemplate] });
      queryClient.invalidateQueries({ queryKey: ["onboarding-templates"] });
      setShowTaskForm(null);
      setTaskFormData(EMPTY_TASK);
    },
  });

  const removeTask = useMutation({
    mutationFn: ({ templateId, taskId }: { templateId: string; taskId: string }) =>
      apiDelete(`/onboarding/templates/${templateId}/tasks/${taskId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["onboarding-template-tasks", expandedTemplate] });
      queryClient.invalidateQueries({ queryKey: ["onboarding-templates"] });
    },
  });

  function startEdit(template: TemplateWithCount) {
    setEditingTemplate(template.id);
    setFormData({
      name: template.name,
      description: template.description || "",
      department: template.department || "",
      is_default: template.is_default,
    });
    setShowForm(true);
  }

  function cancelForm() {
    setShowForm(false);
    setEditingTemplate(null);
    setFormData(EMPTY_TEMPLATE);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (editingTemplate) {
      updateTemplate.mutate({ id: editingTemplate, data: formData });
    } else {
      createTemplate.mutate(formData);
    }
  }

  function handleTaskSubmit(e: React.FormEvent, templateId: string) {
    e.preventDefault();
    addTask.mutate({ templateId, data: taskFormData });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Onboarding Templates</h1>
          <p className="mt-1 text-sm text-gray-500">Manage reusable onboarding templates and their tasks</p>
        </div>
        {!showForm && (
          <button
            onClick={() => { setShowForm(true); setEditingTemplate(null); setFormData(EMPTY_TEMPLATE); }}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            New Template
          </button>
        )}
      </div>

      {/* Template Form */}
      {showForm && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">
            {editingTemplate ? "Edit Template" : "Create Template"}
          </h2>
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700">Name *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="e.g., Engineering Onboarding"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Department</label>
                <input
                  type="text"
                  value={formData.department}
                  onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="e.g., Engineering"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Description</label>
              <textarea
                rows={2}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                placeholder="What is this template for?"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_default"
                checked={formData.is_default}
                onChange={(e) => setFormData({ ...formData, is_default: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              />
              <label htmlFor="is_default" className="text-sm text-gray-700">Set as default template</label>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={createTemplate.isPending || updateTemplate.isPending}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
              >
                <Save className="h-4 w-4" />
                {editingTemplate ? "Update" : "Create"}
              </button>
              <button
                type="button"
                onClick={cancelForm}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Templates List */}
      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
        </div>
      ) : templates.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-white">
          <ClipboardList className="h-12 w-12 text-gray-400" />
          <h3 className="mt-4 text-sm font-medium text-gray-900">No templates yet</h3>
          <p className="mt-1 text-sm text-gray-500">Create your first onboarding template to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map((template) => {
            const isExpanded = expandedTemplate === template.id;
            return (
              <div key={template.id} className="rounded-lg border border-gray-200 bg-white shadow-sm">
                {/* Template Header */}
                <div className="flex items-center gap-4 p-4">
                  <button
                    onClick={() => setExpandedTemplate(isExpanded ? null : template.id)}
                    className="rounded p-1 hover:bg-gray-100 transition-colors"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-5 w-5 text-gray-500" />
                    ) : (
                      <ChevronRight className="h-5 w-5 text-gray-500" />
                    )}
                  </button>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-gray-900">{template.name}</h3>
                      {template.is_default && (
                        <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-700">
                          Default
                        </span>
                      )}
                      {template.department && (
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                          {template.department}
                        </span>
                      )}
                    </div>
                    {template.description && (
                      <p className="mt-0.5 text-sm text-gray-500">{template.description}</p>
                    )}
                  </div>
                  <span className="text-sm text-gray-500">{template.task_count} tasks</span>
                  <button
                    onClick={() => startEdit(template)}
                    className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                </div>

                {/* Expanded Tasks */}
                {isExpanded && (
                  <div className="border-t border-gray-200 bg-gray-50 p-4">
                    {tasks.length === 0 ? (
                      <p className="py-4 text-center text-sm text-gray-500">
                        No tasks yet. Add your first task to this template.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {tasks.map((task, idx) => (
                          <div
                            key={task.id}
                            className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-3"
                          >
                            <GripVertical className="h-4 w-4 text-gray-300" />
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-600">
                              {idx + 1}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900">{task.title}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
                                  {task.category}
                                </span>
                                <span className="text-xs text-gray-400">
                                  Due: {task.due_days > 0 ? `+${task.due_days} days` : "On joining day"}
                                </span>
                                {task.is_required && (
                                  <span className="text-xs font-medium text-red-500">Required</span>
                                )}
                              </div>
                            </div>
                            <button
                              onClick={() => removeTask.mutate({ templateId: template.id, taskId: task.id })}
                              disabled={removeTask.isPending}
                              className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Add Task Form */}
                    {showTaskForm === template.id ? (
                      <form
                        onSubmit={(e) => handleTaskSubmit(e, template.id)}
                        className="mt-3 rounded-lg border border-gray-200 bg-white p-4 space-y-3"
                      >
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                          <div>
                            <label className="block text-xs font-medium text-gray-700">Title *</label>
                            <input
                              type="text"
                              required
                              value={taskFormData.title}
                              onChange={(e) => setTaskFormData({ ...taskFormData, title: e.target.value })}
                              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                              placeholder="Task title"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700">Category *</label>
                            <select
                              value={taskFormData.category}
                              onChange={(e) => setTaskFormData({ ...taskFormData, category: e.target.value })}
                              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                            >
                              {CATEGORIES.map((cat) => (
                                <option key={cat} value={cat}>
                                  {cat.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700">Description</label>
                          <input
                            type="text"
                            value={taskFormData.description}
                            onChange={(e) => setTaskFormData({ ...taskFormData, description: e.target.value })}
                            className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                            placeholder="Optional description"
                          />
                        </div>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-700">Due (days after joining)</label>
                            <input
                              type="number"
                              min={0}
                              value={taskFormData.due_days}
                              onChange={(e) => setTaskFormData({ ...taskFormData, due_days: Number(e.target.value) })}
                              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700">Order</label>
                            <input
                              type="number"
                              min={1}
                              value={taskFormData.order}
                              onChange={(e) => setTaskFormData({ ...taskFormData, order: Number(e.target.value) })}
                              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700">Assignee Role</label>
                            <input
                              type="text"
                              value={taskFormData.assignee_role}
                              onChange={(e) => setTaskFormData({ ...taskFormData, assignee_role: e.target.value })}
                              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                              placeholder="e.g., hr_admin"
                            />
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id="task_required"
                            checked={taskFormData.is_required}
                            onChange={(e) => setTaskFormData({ ...taskFormData, is_required: e.target.checked })}
                            className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                          />
                          <label htmlFor="task_required" className="text-xs text-gray-700">Required task</label>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="submit"
                            disabled={addTask.isPending}
                            className="inline-flex items-center gap-1 rounded bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
                          >
                            <Save className="h-3 w-3" />
                            Add Task
                          </button>
                          <button
                            type="button"
                            onClick={() => { setShowTaskForm(null); setTaskFormData(EMPTY_TASK); }}
                            className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    ) : (
                      <button
                        onClick={() => { setShowTaskForm(template.id); setTaskFormData({ ...EMPTY_TASK, order: tasks.length + 1 }); }}
                        className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-600 hover:border-brand-400 hover:text-brand-600 transition-colors"
                      >
                        <Plus className="h-4 w-4" />
                        Add Task
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
