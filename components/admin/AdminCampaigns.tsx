"use client";

import React, { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { PlaceholderNotice } from "@/components/ui/PlaceholderNotice";
import {
  adminListCampaigns,
  adminCreateCampaign,
  adminUpdateCampaign,
  adminListCampaignTasks,
  adminCreateCampaignTask,
  adminUpdateCampaignTask,
  adminDeleteCampaignTask,
  adminCreateCampaignVersion,
  adminListCampaignVersions,
  adminListWLPrograms,
  type AdminWLProgramRecord,
} from "@/lib/admin/client";

export type CampaignViewMode = "OVERVIEW" | "DETAIL";
export type CampaignDetailTab = "tasks" | "versions" | "settings";

export interface CampaignItem {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  wlProgramId: string;
  status: "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED";
  createdAt: string;
  updatedAt: string;
  currentVersion: {
    id: string;
    versionNumber: number;
    isCurrent: boolean;
    compatibilityMode: string;
    startsAt: string;
    endsAt: string | null;
    changeNotes: string | null;
    createdAt: string;
  } | null;
}

export interface CampaignTaskItem {
  id: string;
  versionId?: string;
  taskCode: string;
  title: string;
  description: string | null;
  taskType: string;
  points: number;
  sortOrder: number;
  isActive?: boolean;
  isRequired?: boolean;
  requirementMetadata?: Record<string, unknown> | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface CampaignVersionDetailItem {
  id: string;
  campaignId: string;
  versionNumber: number;
  isCurrent: boolean;
  compatibilityMode: string;
  compatibleFromVersionId?: string | null;
  startsAt: string;
  endsAt: string | null;
  changeNotes: string | null;
  createdAt: string;
  taskCount: number;
  tasks: CampaignTaskItem[];
}

export function AdminCampaigns() {
  const [campaigns, setCampaigns] = useState<CampaignItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // View Mode & Tab Navigation State
  const [viewMode, setViewMode] = useState<CampaignViewMode>("OVERVIEW");
  const [detailTab, setDetailTab] = useState<CampaignDetailTab>("tasks");
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);

  // Expanded tasks mapping (cached per campaign)
  const [expandedCampaignId, setExpandedCampaignId] = useState<string | null>(null);
  const [tasksMap, setTasksMap] = useState<Record<string, CampaignTaskItem[]>>({});
  const [loadingTasksId, setLoadingTasksId] = useState<string | null>(null);

  // Version History State
  const [versionHistory, setVersionHistory] = useState<CampaignVersionDetailItem[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [versionError, setVersionError] = useState<string | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);

  // Create Campaign Form State (for initial bootstrap when no campaign exists)
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newSlug, setNewSlug] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newWlProgramId, setNewWlProgramId] = useState("");
  const [newStartsAt, setNewStartsAt] = useState("");
  const [creating, setCreating] = useState(false);

  // WL Programs for selection
  const [wlPrograms, setWlPrograms] = useState<AdminWLProgramRecord[]>([]);
  const [manualProgramEntry, setManualProgramEntry] = useState(false);

  // Status updating in progress
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Task Management Modal States
  const [showAddTaskModal, setShowAddTaskModal] = useState(false);
  const [editingTask, setEditingTask] = useState<CampaignTaskItem | null>(null);
  const [deletingTask, setDeletingTask] = useState<CampaignTaskItem | null>(null);
  const [taskSubmitting, setTaskSubmitting] = useState(false);

  // Add Task Form Fields
  const [addTaskCode, setAddTaskCode] = useState("");
  const [addTaskTitle, setAddTaskTitle] = useState("");
  const [addTaskDescription, setAddTaskDescription] = useState("");
  const [addTaskType, setAddTaskType] = useState<string>("SOCIAL_X_FOLLOW");
  const [addTaskTweetUrl, setAddTaskTweetUrl] = useState("");
  const [addTaskPoints, setAddTaskPoints] = useState<number>(10);
  const [addTaskIsRequired, setAddTaskIsRequired] = useState<boolean>(true);

  // Edit Task Form Fields
  const [editTaskTitle, setEditTaskTitle] = useState("");
  const [editTaskDescription, setEditTaskDescription] = useState("");
  const [editTaskPoints, setEditTaskPoints] = useState<number>(10);
  const [editTaskIsRequired, setEditTaskIsRequired] = useState<boolean>(true);
  const [editTaskTweetUrl, setEditTaskTweetUrl] = useState("");

  // Campaign Settings Form State
  const [settingTitle, setSettingTitle] = useState("");
  const [settingDescription, setSettingDescription] = useState("");
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsSuccess, setSettingsSuccess] = useState<string | null>(null);

  // Currently selected campaign object
  const selectedCampaign =
    (selectedCampaignId ? campaigns.find((c) => c.id === selectedCampaignId) : null) ||
    campaigns[0] ||
    null;

  useEffect(() => {
    let isMounted = true;
    adminListWLPrograms()
      .then((res) => {
        if (isMounted) {
          setWlPrograms(res.programs || []);
        }
      })
      .catch(() => {
        // non-blocking
      });
    return () => {
      isMounted = false;
    };
  }, [showCreateForm]);

  useEffect(() => {
    let isMounted = true;
    adminListCampaigns()
      .then((res) => {
        if (isMounted) {
          const camps = res.campaigns || [];
          setCampaigns(camps);
          if (camps.length > 0) {
            setSettingTitle(camps[0].title);
            setSettingDescription(camps[0].description || "");
          }
          setError(null);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError((err as Error).message || "Failed to load campaigns.");
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [reloadKey]);

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSlug.trim() || !newTitle.trim() || !newWlProgramId.trim()) {
      setError("Slug, Title, and Whitelist Program ID are required.");
      return;
    }

    setCreating(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const startsAtIso = newStartsAt
        ? new Date(newStartsAt).toISOString()
        : new Date().toISOString();
      await adminCreateCampaign({
        slug: newSlug.trim().toLowerCase(),
        title: newTitle.trim(),
        description: newDescription.trim() || null,
        wlProgramId: newWlProgramId.trim(),
        initialVersion: {
          startsAt: startsAtIso,
        },
      });

      setSuccessMessage(`Campaign "${newTitle}" created successfully!`);
      setShowCreateForm(false);
      setNewSlug("");
      setNewTitle("");
      setNewDescription("");
      setNewWlProgramId("");
      setManualProgramEntry(false);
      setNewStartsAt("");
      setReloadKey((k) => k + 1);
    } catch (err: unknown) {
      setError((err as Error).message || "Failed to create campaign.");
    } finally {
      setCreating(false);
    }
  };

  const handleUpdateStatus = async (
    campaignId: string,
    newStatus: "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED",
  ) => {
    setUpdatingId(campaignId);
    setError(null);
    setSuccessMessage(null);
    try {
      await adminUpdateCampaign(campaignId, { status: newStatus });
      setSuccessMessage(`Campaign status updated to ${newStatus}.`);
      setReloadKey((k) => k + 1);
    } catch (err: unknown) {
      setError((err as Error).message || "Failed to update campaign status.");
    } finally {
      setUpdatingId(null);
    }
  };

  const loadTasksForCampaign = async (campaignId: string, versionNumber: number) => {
    if (tasksMap[campaignId] || loadingTasksId === campaignId) return;

    setLoadingTasksId(campaignId);
    try {
      const res = await adminListCampaignTasks(campaignId, versionNumber);
      setTasksMap((prev) => ({
        ...prev,
        [campaignId]: res.tasks || [],
      }));
    } catch (err: unknown) {
      console.error("Failed to load tasks:", err);
    } finally {
      setLoadingTasksId(null);
    }
  };

  const loadVersionHistory = async (campaignId: string) => {
    setLoadingVersions(true);
    setVersionError(null);
    try {
      const res = await adminListCampaignVersions(campaignId);
      const list: CampaignVersionDetailItem[] = res?.versions || [];
      setVersionHistory(list);

      // Default selected snapshot to current or first version
      if (list.length > 0) {
        setSelectedVersionId((prev) => {
          if (prev && list.some((v) => v.id === prev)) return prev;
          const current = list.find((v) => v.isCurrent);
          return current ? current.id : list[0].id;
        });
      }
    } catch (err: unknown) {
      setVersionError((err as Error).message || "Failed to load version history.");
    } finally {
      setLoadingVersions(false);
    }
  };

  const handleToggleTasks = async (campaign: CampaignItem) => {
    if (expandedCampaignId === campaign.id) {
      setExpandedCampaignId(null);
      return;
    }

    setExpandedCampaignId(campaign.id);
    const versionNum = campaign.currentVersion?.versionNumber ?? 1;
    await loadTasksForCampaign(campaign.id, versionNum);
  };

  const handleOpenDetail = async (
    campaignId: string,
    tab: CampaignDetailTab = "tasks",
  ) => {
    setSelectedCampaignId(campaignId);
    setViewMode("DETAIL");
    setDetailTab(tab);

    const camp = campaigns.find((c) => c.id === campaignId);
    const versionNum = camp?.currentVersion?.versionNumber ?? 1;

    if (camp) {
      setSettingTitle(camp.title);
      setSettingDescription(camp.description || "");
      setSettingsError(null);
      setSettingsSuccess(null);
    }

    if (tab === "tasks") {
      await loadTasksForCampaign(campaignId, versionNum);
    } else if (tab === "versions") {
      await loadVersionHistory(campaignId);
    }
  };

  const handleSelectTab = async (tab: CampaignDetailTab) => {
    setDetailTab(tab);
    if (!selectedCampaign) return;

    if (tab === "settings") {
      setSettingTitle(selectedCampaign.title);
      setSettingDescription(selectedCampaign.description || "");
      setSettingsError(null);
      setSettingsSuccess(null);
    }

    if (tab === "tasks") {
      const versionNum = selectedCampaign.currentVersion?.versionNumber ?? 1;
      await loadTasksForCampaign(selectedCampaign.id, versionNum);
    } else if (tab === "versions") {
      await loadVersionHistory(selectedCampaign.id);
    }
  };

  // ---------------------------------------------------------------------------
  // Task Management Handlers
  // ---------------------------------------------------------------------------

  const handleOpenEditModal = (task: CampaignTaskItem) => {
    setEditingTask(task);
    setEditTaskTitle(task.title);
    setEditTaskDescription(task.description || "");
    setEditTaskPoints(task.points);
    setEditTaskIsRequired(task.isRequired !== undefined ? task.isRequired : true);
    const existingUrl =
      (task.requirementMetadata?.tweetUrl as string | undefined) || "";
    setEditTaskTweetUrl(existingUrl);
  };

  const handleSaveAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCampaign) return;

    if (!addTaskCode.trim() || !addTaskTitle.trim()) {
      setError("Task Code and Title are required.");
      return;
    }

    const versionNum = selectedCampaign.currentVersion?.versionNumber ?? 1;
    setTaskSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    const requirementMetadata: Record<string, unknown> = {};
    if (addTaskTweetUrl.trim()) {
      requirementMetadata.tweetUrl = addTaskTweetUrl.trim();
    }

    try {
      await adminCreateCampaignTask(selectedCampaign.id, versionNum, {
        taskCode: addTaskCode.trim().toUpperCase(),
        title: addTaskTitle.trim(),
        description: addTaskDescription.trim() || null,
        taskType: addTaskType,
        points: addTaskPoints,
        isRequired: addTaskIsRequired,
        requirementMetadata:
          Object.keys(requirementMetadata).length > 0 ? requirementMetadata : null,
      });

      setSuccessMessage(`Task "${addTaskTitle}" created successfully!`);

      // Refresh tasks
      const refreshed = await adminListCampaignTasks(selectedCampaign.id, versionNum);
      setTasksMap((prev) => ({
        ...prev,
        [selectedCampaign.id]: refreshed.tasks || [],
      }));

      // Reset form & close modal
      setAddTaskCode("");
      setAddTaskTitle("");
      setAddTaskDescription("");
      setAddTaskType("SOCIAL_X_FOLLOW");
      setAddTaskTweetUrl("");
      setAddTaskPoints(10);
      setAddTaskIsRequired(true);
      setShowAddTaskModal(false);
    } catch (err: unknown) {
      setError((err as Error).message || "Failed to create task.");
    } finally {
      setTaskSubmitting(false);
    }
  };

  const handleSaveEditTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTask || !selectedCampaign) return;

    if (!editTaskTitle.trim()) {
      setError("Task title is required.");
      return;
    }

    const versionNum = selectedCampaign.currentVersion?.versionNumber ?? 1;
    const originalUrl =
      (editingTask.requirementMetadata?.tweetUrl as string | undefined) || "";
    const trimmedNewUrl = editTaskTweetUrl.trim();
    const isRequiredOriginal = editingTask.isRequired !== false;
    const isRequiredNew = editTaskIsRequired;

    // Check product rule:
    // "Perubahan URL X pada task wajib harus menerbitkan CampaignVersion baru.
    // Perubahan kriteria wajib juga harus melalui CampaignVersion baru."
    const isUrlChangedOnMandatory =
      (isRequiredOriginal || isRequiredNew) &&
      trimmedNewUrl !== originalUrl.trim();
    const isRequirementChanged = isRequiredOriginal !== isRequiredNew;

    const requiresNewVersion = isUrlChangedOnMandatory || isRequirementChanged;

    setTaskSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    const updatedMetadata: Record<string, unknown> = {
      ...(editingTask.requirementMetadata || {}),
      ...(trimmedNewUrl ? { tweetUrl: trimmedNewUrl } : {}),
    };
    if (!trimmedNewUrl && updatedMetadata.tweetUrl) {
      delete updatedMetadata.tweetUrl;
    }

    try {
      if (requiresNewVersion) {
        // Publish new CampaignVersion via adminCreateCampaignVersion
        const reason = isUrlChangedOnMandatory
          ? `Updated target URL for mandatory task ${editingTask.taskCode}`
          : `Updated requirement status for task ${editingTask.taskCode}`;

        const res = await adminCreateCampaignVersion(selectedCampaign.id, {
          changeNotes: reason,
          compatibilityMode: "LEGACY_CARRIED",
          taskUpdates: [
            {
              taskCode: editingTask.taskCode, // Stable taskCode
              title: editTaskTitle.trim(),
              description: editTaskDescription.trim() || null,
              points: editTaskPoints,
              isRequired: editTaskIsRequired,
              requirementMetadata: updatedMetadata,
            },
          ],
        });

        const newVersionNumber = res.version.versionNumber;
        setSuccessMessage(
          `Published new Campaign Version v${newVersionNumber} with updated task! Approved progress carry-over preserved.`,
        );

        // Update local tasksMap for the new version
        setTasksMap((prev) => ({
          ...prev,
          [selectedCampaign.id]: res.version.tasks || [],
        }));

        // Refresh version history if it was loaded
        loadVersionHistory(selectedCampaign.id);

        // Trigger campaign reload to refresh currentVersion
        setReloadKey((k) => k + 1);
      } else {
        // Direct minor update via adminUpdateCampaignTask
        await adminUpdateCampaignTask(
          selectedCampaign.id,
          versionNum,
          {
            taskId: editingTask.id,
            title: editTaskTitle.trim(),
            description: editTaskDescription.trim() || null,
            points: editTaskPoints,
            isRequired: editTaskIsRequired,
            requirementMetadata: updatedMetadata,
          },
        );

        setSuccessMessage(`Task "${editTaskTitle}" updated successfully!`);

        // Refresh tasks in local store
        const refreshed = await adminListCampaignTasks(selectedCampaign.id, versionNum);
        setTasksMap((prev) => ({
          ...prev,
          [selectedCampaign.id]: refreshed.tasks || [],
        }));
      }

      setEditingTask(null);
    } catch (err: unknown) {
      setError((err as Error).message || "Failed to update task.");
    } finally {
      setTaskSubmitting(false);
    }
  };

  const handleConfirmDeleteTask = async () => {
    if (!deletingTask || !selectedCampaign) return;

    const versionNum = selectedCampaign.currentVersion?.versionNumber ?? 1;
    setTaskSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await adminDeleteCampaignTask(selectedCampaign.id, versionNum, deletingTask.id);
      setSuccessMessage(`Task "${deletingTask.title}" has been deleted.`);

      // Refresh tasks
      const refreshed = await adminListCampaignTasks(selectedCampaign.id, versionNum);
      setTasksMap((prev) => ({
        ...prev,
        [selectedCampaign.id]: refreshed.tasks || [],
      }));

      setDeletingTask(null);
    } catch (err: unknown) {
      setError((err as Error).message || "Failed to delete task.");
    } finally {
      setTaskSubmitting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Settings Handlers
  // ---------------------------------------------------------------------------

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCampaign) return;

    if (!settingTitle.trim()) {
      setSettingsError("Campaign title is required.");
      return;
    }

    setSettingsSaving(true);
    setSettingsError(null);
    setSettingsSuccess(null);

    try {
      const res = await adminUpdateCampaign(selectedCampaign.id, {
        title: settingTitle.trim(),
        description: settingDescription.trim() || null,
      });

      // Update campaigns state in place
      setCampaigns((prev) =>
        prev.map((c) =>
          c.id === selectedCampaign.id
            ? {
                ...c,
                title: res.campaign?.title ?? settingTitle.trim(),
                description: res.campaign?.description ?? (settingDescription.trim() || null),
              }
            : c,
        ),
      );

      setSettingsSuccess("Campaign settings saved successfully!");
      setSuccessMessage("Campaign settings updated successfully!");
    } catch (err: unknown) {
      setSettingsError(
        err instanceof Error ? err.message : "Failed to update campaign settings.",
      );
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleCancelSettings = () => {
    if (!selectedCampaign) return;
    setSettingTitle(selectedCampaign.title);
    setSettingDescription(selectedCampaign.description || "");
    setSettingsError(null);
    setSettingsSuccess(null);
  };

  // ---------------------------------------------------------------------------
  // Sub-renderers
  // ---------------------------------------------------------------------------

  const renderNotifications = () => (
    <>
      {successMessage && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300">
          <span>{successMessage}</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
          <span>{error}</span>
        </div>
      )}
    </>
  );

  const renderStatusControls = (camp: CampaignItem) => {
    const isBusy = updatingId === camp.id;
    return (
      <div className="flex flex-wrap items-center gap-2">
        {camp.status === "DRAFT" && (
          <Button
            variant="primary"
            size="sm"
            className="text-xs"
            onClick={() => handleUpdateStatus(camp.id, "ACTIVE")}
            disabled={isBusy}
          >
            Activate
          </Button>
        )}

        {camp.status === "ACTIVE" && (
          <Button
            variant="secondary"
            size="sm"
            className="text-xs text-amber-300"
            onClick={() => handleUpdateStatus(camp.id, "PAUSED")}
            disabled={isBusy}
          >
            Pause
          </Button>
        )}

        {camp.status === "PAUSED" && (
          <Button
            variant="primary"
            size="sm"
            className="text-xs"
            onClick={() => handleUpdateStatus(camp.id, "ACTIVE")}
            disabled={isBusy}
          >
            Resume
          </Button>
        )}

        {camp.status !== "ARCHIVED" && (
          <Button
            variant="outline"
            size="sm"
            className="text-xs text-gray-300"
            onClick={() => handleUpdateStatus(camp.id, "ARCHIVED")}
            disabled={isBusy}
          >
            End
          </Button>
        )}
      </div>
    );
  };

  const renderCreateForm = () => (
    <Card className="border-emerald-500/30 bg-[#0B2026]">
      <CardHeader>
        <CardTitle className="text-base text-white">Create New Campaign</CardTitle>
        <CardDescription className="text-xs text-gray-400">
          Registers a campaign in DRAFT status bound to an existing Whitelist Program ID.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleCreateCampaign} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="camp-slug"
                className="mb-1 block text-xs font-medium text-gray-400"
              >
                Slug (URL Identifier) *
              </label>
              <input
                id="camp-slug"
                type="text"
                placeholder="e.g. genesis-quest-season-1"
                value={newSlug}
                onChange={(e) => setNewSlug(e.target.value)}
                required
                className="w-full rounded-md border border-[#163B44] bg-[#0B2026]/80 px-3 py-2 text-xs text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <div>
              <label
                htmlFor="camp-title"
                className="mb-1 block text-xs font-medium text-gray-400"
              >
                Campaign Title *
              </label>
              <input
                id="camp-title"
                type="text"
                placeholder="e.g. Genesis Community Quests"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                required
                className="w-full rounded-md border border-[#163B44] bg-[#0B2026]/80 px-3 py-2 text-xs text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label
                  htmlFor="camp-wl"
                  className="block text-xs font-medium text-gray-400"
                >
                  Whitelist Program ID *
                </label>
                {wlPrograms.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setManualProgramEntry(!manualProgramEntry)}
                    className="text-[11px] text-emerald-400 hover:underline"
                  >
                    {manualProgramEntry ? "Select from list" : "Enter manually"}
                  </button>
                )}
              </div>
              {wlPrograms.length > 0 && !manualProgramEntry ? (
                <select
                  id="camp-wl"
                  value={newWlProgramId}
                  onChange={(e) => setNewWlProgramId(e.target.value)}
                  required
                  className="w-full rounded-md border border-[#163B44] bg-[#0B2026]/80 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
                >
                  <option value="">Select a Whitelist Program...</option>
                  {wlPrograms.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.slug}) — Capacity: {p.totalSlots} [{p.status}]
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id="camp-wl"
                  type="text"
                  placeholder="e.g. wl-program-genesis"
                  value={newWlProgramId}
                  onChange={(e) => setNewWlProgramId(e.target.value)}
                  required
                  className="w-full rounded-md border border-[#163B44] bg-[#0B2026]/80 px-3 py-2 text-xs text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none"
                />
              )}
            </div>
            <div>
              <label
                htmlFor="camp-starts"
                className="mb-1 block text-xs font-medium text-gray-400"
              >
                Starts At (optional, default now)
              </label>
              <input
                id="camp-starts"
                type="datetime-local"
                value={newStartsAt}
                onChange={(e) => setNewStartsAt(e.target.value)}
                className="w-full rounded-md border border-[#163B44] bg-[#0B2026]/80 px-3 py-2 text-xs text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="camp-desc"
              className="mb-1 block text-xs font-medium text-gray-400"
            >
              Description (optional)
            </label>
            <textarea
              id="camp-desc"
              rows={2}
              placeholder="Summary of quest objectives..."
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              className="w-full rounded-md border border-[#163B44] bg-[#0B2026]/80 px-3 py-2 text-xs text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowCreateForm(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" disabled={creating}>
              {creating ? "Creating..." : "Create Campaign"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );

  const renderInlineTasks = (camp: CampaignItem, tasks: CampaignTaskItem[]) => (
    <div className="mt-4 border-t border-[#163B44] pt-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-300">
          Version {camp.currentVersion?.versionNumber ?? 1} Task Specifications
        </span>
        <span className="text-xs text-gray-500">
          {loadingTasksId === camp.id ? "Loading..." : `${tasks.length} tasks`}
        </span>
      </div>

      {loadingTasksId === camp.id ? (
        <div className="py-4 text-center text-xs text-gray-500">
          Loading version tasks...
        </div>
      ) : tasks.length === 0 ? (
        <div className="rounded border border-[#163B44] bg-[#051D22]/50 p-3 text-xs text-gray-500 italic">
          No tasks configured in this version.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {tasks.map((task) => (
            <div
              key={task.id}
              className="space-y-1 rounded border border-[#163B44] bg-[#051D22]/60 p-2.5 text-xs"
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white">{task.title}</span>
                <Badge variant="outline" className="text-[10px]">
                  {task.points} pts
                </Badge>
              </div>
              <div className="flex items-center gap-2 font-mono text-[11px] text-gray-400">
                <span>code: {task.taskCode}</span>
                <span>type: {task.taskType}</span>
              </div>
              {task.description && (
                <p className="text-[11px] text-gray-400">{task.description}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // ---------------------------------------------------------------------------
  // Detail Tabs Renderers
  // ---------------------------------------------------------------------------

  const renderTasksTab = (camp: CampaignItem) => {
    const tasks = tasksMap[camp.id] || [];
    const isLoadingTasks = loadingTasksId === camp.id;
    const versionNum = camp.currentVersion?.versionNumber ?? 1;

    return (
      <div className="space-y-4 pt-2">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white">
              Version {versionNum} Task Specifications
            </h3>
            <p className="text-xs text-gray-400">
              Active promotional tasks required for Whitelist qualification.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {isLoadingTasks ? "Loading..." : `${tasks.length} tasks`}
            </Badge>
            <Button
              variant="primary"
              size="sm"
              className="text-xs"
              onClick={() => setShowAddTaskModal(true)}
            >
              Add Task
            </Button>
          </div>
        </div>

        {isLoadingTasks ? (
          <div className="py-8 text-center text-xs text-gray-500">
            <RefreshCw className="mx-auto mb-2 h-5 w-5 animate-spin text-emerald-400" />
            Loading version tasks...
          </div>
        ) : tasks.length === 0 ? (
          <div className="rounded border border-[#163B44] bg-[#051D22]/50 p-6 text-center text-xs text-gray-500 italic">
            No tasks configured in this version. Use the &quot;Add Task&quot; button above to create one.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {tasks.map((task) => {
              const tweetUrl = task.requirementMetadata?.tweetUrl as string | undefined;
              const isRequired = task.isRequired !== false;

              return (
                <div
                  key={task.id}
                  className="flex flex-col justify-between space-y-3 rounded-lg border border-[#163B44] bg-[#051D22]/60 p-4 text-xs transition-colors hover:border-[#163B44]/80"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        <span className="font-semibold text-white">{task.title}</span>
                        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                          <Badge
                            variant={isRequired ? "default" : "outline"}
                            className="text-[10px]"
                          >
                            {isRequired ? "Required for WL" : "Optional"}
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">
                            {task.points} pts
                          </Badge>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-gray-400">
                      <span>code: {task.taskCode}</span>
                      <span>/</span>
                      <span>type: {task.taskType}</span>
                    </div>

                    {task.description && (
                      <p className="text-[11px] leading-relaxed text-gray-300">
                        {task.description}
                      </p>
                    )}

                    {tweetUrl && (
                      <div className="flex items-center gap-1.5 rounded border border-[#163B44] bg-[#04181C]/80 px-2.5 py-1.5 text-[11px] text-emerald-400">
                        <span className="truncate" title={tweetUrl}>
                          Target: {tweetUrl}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-end gap-2 border-t border-[#163B44] pt-2.5">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs"
                      onClick={() => handleOpenEditModal(task)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs text-rose-400 hover:border-rose-500/50 hover:text-rose-300"
                      onClick={() => setDeletingTask(task)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderVersionHistoryTab = (camp: CampaignItem) => {
    const currentVersionNum = camp.currentVersion?.versionNumber ?? 1;
    const activeSnapshot =
      versionHistory.find((v) => v.id === selectedVersionId) ||
      versionHistory[0] ||
      null;

    return (
      <div className="space-y-4 pt-2">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white">Version History</h3>
            <p className="text-xs text-gray-400">
              Audit trail and version timeline for the Whitelist promo campaign.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => loadVersionHistory(camp.id)}
              disabled={loadingVersions}
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${loadingVersions ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
            <Badge variant="default" className="text-xs">
              Current: v{currentVersionNum}
            </Badge>
          </div>
        </div>

        {loadingVersions ? (
          <div className="py-12 text-center text-xs text-gray-400">
            <RefreshCw className="mx-auto mb-2 h-6 w-6 animate-spin text-emerald-400" />
            Loading version history...
          </div>
        ) : versionError ? (
          <div className="flex items-center justify-between rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-300">
            <div>
              <span>{versionError}</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => loadVersionHistory(camp.id)}
            >
              Retry
            </Button>
          </div>
        ) : versionHistory.length === 0 ? (
          <div className="rounded border border-[#163B44] bg-[#051D22]/50 p-8 text-center text-xs text-gray-500 italic">
            No version history found.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Left: Version Timeline List (5 cols on lg) */}
            <div className="space-y-3 lg:col-span-5">
              <span className="block text-xs font-semibold text-gray-400">
                Versions ({versionHistory.length})
              </span>

              {versionHistory.map((v) => {
                const isSelected = activeSnapshot?.id === v.id;
                const startsAt = v.startsAt
                  ? new Date(v.startsAt).toLocaleDateString()
                  : "Immediate";
                const endsAt = v.endsAt
                  ? new Date(v.endsAt).toLocaleDateString()
                  : "Ongoing";
                const taskCount = v.taskCount ?? v.tasks?.length ?? 0;

                return (
                  <Card
                    key={v.id}
                    className={`cursor-pointer transition-all ${
                      isSelected
                        ? "border-emerald-500/60 bg-emerald-950/20 ring-1 ring-emerald-500/30"
                        : "border-[#163B44] bg-[#0B2026]/80 hover:border-[#163B44]"
                    }`}
                    onClick={() => setSelectedVersionId(v.id)}
                  >
                    <CardContent className="space-y-2 p-3.5 text-xs">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-bold text-white">
                            Version {v.versionNumber}
                          </span>
                          {v.isCurrent && (
                            <Badge variant="success" className="text-[10px]">
                              Current
                            </Badge>
                          )}
                        </div>
                        <Badge variant="outline" className="text-[10px]">
                          {v.compatibilityMode}
                        </Badge>
                      </div>

                      <div className="text-[11px] text-gray-400">
                        <span>Period: {startsAt} – {endsAt}</span>
                      </div>

                      {v.changeNotes ? (
                        <p className="line-clamp-2 text-[11px] text-gray-300">
                          {v.changeNotes}
                        </p>
                      ) : (
                        <p className="text-[11px] text-gray-500 italic">
                          No change notes recorded.
                        </p>
                      )}

                      <div className="flex items-center justify-between border-t border-[#163B44] pt-2 text-[11px]">
                        <span className="text-gray-400">{taskCount} tasks</span>
                        <Button
                          variant={isSelected ? "primary" : "outline"}
                          size="sm"
                          className="h-6 px-2 text-[10px]"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedVersionId(v.id);
                          }}
                        >
                          {isSelected ? "Viewing" : "View Snapshot"}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Right: Selected Version Task Snapshot (7 cols on lg) */}
            <div className="space-y-4 lg:col-span-7">
              {activeSnapshot ? (
                <Card className="border-[#163B44] bg-[#0B2026]/90">
                  <CardHeader className="pb-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <CardTitle className="text-sm font-bold text-white">
                          Version {activeSnapshot.versionNumber} Task Snapshot
                        </CardTitle>
                        <CardDescription className="text-xs text-gray-400">
                          {activeSnapshot.isCurrent
                            ? "Active version tasks currently available to participants."
                            : `Historical read-only snapshot recorded on ${new Date(activeSnapshot.createdAt).toLocaleDateString()}.`}
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        {activeSnapshot.isCurrent ? (
                          <Badge variant="success" className="text-[10px]">
                            Current
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="border-amber-500/40 text-[10px] text-amber-300"
                          >
                            Read-Only Snapshot
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-[10px]">
                          {activeSnapshot.tasks?.length ?? 0} tasks
                        </Badge>
                      </div>
                    </div>

                    {!activeSnapshot.isCurrent && (
                      <div className="mt-2 rounded border border-amber-500/30 bg-amber-500/10 p-2 text-[11px] text-amber-200">
                        <span>
                          This historical version is read-only. Tasks and requirements cannot be edited or deleted to preserve carry-over audit integrity.
                        </span>
                      </div>
                    )}
                  </CardHeader>

                  <CardContent className="space-y-3 pt-0">
                    {!activeSnapshot.tasks || activeSnapshot.tasks.length === 0 ? (
                      <div className="rounded border border-[#163B44] bg-[#051D22]/50 p-6 text-center text-xs text-gray-500 italic">
                        No tasks recorded in this version snapshot.
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {activeSnapshot.tasks.map((task) => {
                          const tweetUrl = task.requirementMetadata?.tweetUrl as string | undefined;
                          const isRequired = task.isRequired !== false;

                          return (
                            <div
                              key={task.id}
                              className="space-y-1.5 rounded-lg border border-[#163B44] bg-[#051D22]/60 p-3 text-xs"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <span className="font-semibold text-white">
                                  {task.title}
                                </span>
                                <div className="flex items-center gap-1.5">
                                  <Badge
                                    variant={isRequired ? "default" : "outline"}
                                    className="text-[10px]"
                                  >
                                    {isRequired ? "Required for WL" : "Optional"}
                                  </Badge>
                                  <Badge variant="outline" className="text-[10px]">
                                    {task.points} pts
                                  </Badge>
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-gray-400">
                                <span>code: {task.taskCode}</span>
                                <span>/</span>
                                <span>type: {task.taskType}</span>
                              </div>

                              {task.description && (
                                <p className="text-[11px] text-gray-300">
                                  {task.description}
                                </p>
                              )}

                              {tweetUrl && (
                                <div className="flex items-center gap-1.5 rounded border border-[#163B44] bg-[#04181C]/80 px-2 py-1 text-[11px] text-emerald-400">
                                  <span className="truncate" title={tweetUrl}>
                                    Target: {tweetUrl}
                                  </span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ) : null}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderSettingsTab = (camp: CampaignItem) => {
    const isDirty =
      settingTitle !== camp.title ||
      settingDescription !== (camp.description || "");

    return (
      <div className="space-y-4 pt-2">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white">Campaign Settings</h3>
            <p className="text-xs text-gray-400">
              General parameters and metadata configuration for the single main campaign.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant={
                camp.status === "ACTIVE"
                  ? "success"
                  : camp.status === "DRAFT"
                    ? "warning"
                    : "outline"
              }
              className="text-xs"
            >
              Status: {camp.status}
            </Badge>
            <Badge variant="default" className="text-xs">
              Current Version: v{camp.currentVersion?.versionNumber ?? 1}
            </Badge>
          </div>
        </div>

        {/* Local Settings Alert Notifications */}
        {settingsSuccess && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300">
            <span>{settingsSuccess}</span>
          </div>
        )}

        {settingsError && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
            <span>{settingsError}</span>
          </div>
        )}

        <Card className="border-[#163B44] bg-[#0B2026]/80">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold text-white">
              Edit Campaign Information
            </CardTitle>
            <CardDescription className="text-xs text-gray-400">
              Update the promotional quest display title and description. Updating these fields does not alter task criteria or create a new campaign version.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSaveSettings} className="space-y-4 text-xs">
              {/* Read-Only Campaign Identifiers */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="setting-slug"
                    className="mb-1.5 block font-medium text-gray-400"
                  >
                    <span>URL Slug (Read-Only)</span>
                  </label>
                  <input
                    id="setting-slug"
                    type="text"
                    value={camp.slug}
                    readOnly
                    disabled
                    className="w-full cursor-not-allowed rounded-md border border-[#163B44] bg-[#051D22]/60 px-3 py-2 font-mono text-xs text-gray-400 focus:outline-none"
                  />
                  <span className="mt-1 block text-[11px] text-gray-500">
                    slug: {camp.slug} (Permanent URL identifier)
                  </span>
                </div>

                <div>
                  <label
                    htmlFor="setting-wl-program"
                    className="mb-1.5 block font-medium text-gray-400"
                  >
                    <span>Associated WL Program ID</span>
                  </label>
                  <input
                    id="setting-wl-program"
                    type="text"
                    value={camp.wlProgramId}
                    readOnly
                    disabled
                    className="w-full cursor-not-allowed rounded-md border border-[#163B44] bg-[#051D22]/60 px-3 py-2 font-mono text-xs text-emerald-400/80 focus:outline-none"
                  />
                  <span className="mt-1 block font-mono text-[11px] text-gray-500">
                    {camp.wlProgramId} (Permanent whitelist allocation binding)
                  </span>
                </div>
              </div>

              {/* Editable Fields: Title and Description */}
              <div>
                <label
                  htmlFor="setting-title"
                  className="mb-1.5 block font-medium text-gray-300"
                >
                  Campaign Title *
                </label>
                <input
                  id="setting-title"
                  type="text"
                  placeholder="e.g. Elychimp Main Whitelist Campaign"
                  value={settingTitle}
                  onChange={(e) => {
                    setSettingTitle(e.target.value);
                    if (settingsError) setSettingsError(null);
                    if (settingsSuccess) setSettingsSuccess(null);
                  }}
                  required
                  maxLength={255}
                  disabled={settingsSaving}
                  className="w-full rounded-md border border-[#163B44] bg-[#0B2026]/80 px-3 py-2 text-xs text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none disabled:opacity-50"
                />
              </div>

              <div>
                <label
                  htmlFor="setting-description"
                  className="mb-1.5 block font-medium text-gray-300"
                >
                  Description (optional)
                </label>
                <textarea
                  id="setting-description"
                  rows={3}
                  placeholder="Summary of quest objectives and whitelist details..."
                  value={settingDescription}
                  onChange={(e) => {
                    setSettingDescription(e.target.value);
                    if (settingsError) setSettingsError(null);
                    if (settingsSuccess) setSettingsSuccess(null);
                  }}
                  disabled={settingsSaving}
                  className="w-full rounded-md border border-[#163B44] bg-[#0B2026]/80 px-3 py-2 text-xs text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none disabled:opacity-50"
                />
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-[#163B44] pt-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCancelSettings}
                  disabled={settingsSaving || !isDirty}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={settingsSaving || !settingTitle.trim() || !isDirty}
                  className="text-xs"
                >
                  {settingsSaving ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  };

  // ---------------------------------------------------------------------------
  // Modals Renderers (Add Task, Edit Task, Delete Task)
  // ---------------------------------------------------------------------------

  const renderAddTaskModal = () => {
    if (!showAddTaskModal || !selectedCampaign) return null;
    const versionNum = selectedCampaign.currentVersion?.versionNumber ?? 1;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
        <Card className="w-full max-w-lg border-[#163B44] bg-[#0B2026] shadow-2xl">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base text-white">
                Add Task (Version {versionNum})
              </CardTitle>
              <CardDescription className="text-xs text-gray-400">
                Create a new promotional task with a unique task code.
              </CardDescription>
            </div>
            <button
              type="button"
              onClick={() => setShowAddTaskModal(false)}
              className="text-xs font-medium text-gray-400 hover:text-white"
            >
              Close
            </button>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveAddTask} className="space-y-3.5 text-xs">
              <div>
                <label
                  htmlFor="add-task-code"
                  className="mb-1 block font-medium text-gray-300"
                >
                  Task Code *
                </label>
                <input
                  id="add-task-code"
                  type="text"
                  placeholder="e.g. LIKE_REPOST_OCT_PINNED"
                  value={addTaskCode}
                  onChange={(e) => setAddTaskCode(e.target.value.toUpperCase())}
                  required
                  className="w-full rounded-md border border-[#163B44] bg-[#0B2026]/80 px-3 py-2 font-mono text-xs uppercase text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none"
                />
                <span className="mt-1 block text-[11px] text-gray-500">
                  Permanent identifier. Cannot be modified once created.
                </span>
              </div>

              <div>
                <label
                  htmlFor="add-task-title"
                  className="mb-1 block font-medium text-gray-300"
                >
                  Task Title *
                </label>
                <input
                  id="add-task-title"
                  type="text"
                  placeholder="e.g. Like & Repost Genesis Announcement"
                  value={addTaskTitle}
                  onChange={(e) => setAddTaskTitle(e.target.value)}
                  required
                  className="w-full rounded-md border border-[#163B44] bg-[#0B2026]/80 px-3 py-2 text-xs text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="add-task-type"
                    className="mb-1 block font-medium text-gray-300"
                  >
                    Task Type *
                  </label>
                  <select
                    id="add-task-type"
                    value={addTaskType}
                    onChange={(e) => setAddTaskType(e.target.value)}
                    className="w-full rounded-md border border-[#163B44] bg-[#0B2026]/80 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="SOCIAL_X_FOLLOW">SOCIAL_X_FOLLOW (Follow)</option>
                    <option value="SOCIAL_X_LIKE">SOCIAL_X_LIKE (Like)</option>
                    <option value="SOCIAL_X_REPOST">SOCIAL_X_REPOST (Repost)</option>
                    <option value="SOCIAL_X_QUOTE">SOCIAL_X_QUOTE (Quote)</option>
                    <option value="SOCIAL_X_REPLY">SOCIAL_X_REPLY (Reply)</option>
                    <option value="CUSTOM">CUSTOM (Custom Quest)</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="add-task-points"
                    className="mb-1 block font-medium text-gray-300"
                  >
                    Points *
                  </label>
                  <input
                    id="add-task-points"
                    type="number"
                    min="0"
                    value={addTaskPoints}
                    onChange={(e) => setAddTaskPoints(Number(e.target.value))}
                    required
                    className="w-full rounded-md border border-[#163B44] bg-[#0B2026]/80 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="add-task-url"
                  className="mb-1 block font-medium text-gray-300"
                >
                  Target X Post URL (optional)
                </label>
                <input
                  id="add-task-url"
                  type="url"
                  placeholder="https://x.com/Elychimp/status/1234567890"
                  value={addTaskTweetUrl}
                  onChange={(e) => setAddTaskTweetUrl(e.target.value)}
                  className="w-full rounded-md border border-[#163B44] bg-[#0B2026]/80 px-3 py-2 text-xs text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="add-task-desc"
                  className="mb-1 block font-medium text-gray-300"
                >
                  Description / Instructions (optional)
                </label>
                <textarea
                  id="add-task-desc"
                  rows={2}
                  placeholder="Instructions for participants..."
                  value={addTaskDescription}
                  onChange={(e) => setAddTaskDescription(e.target.value)}
                  className="w-full rounded-md border border-[#163B44] bg-[#0B2026]/80 px-3 py-2 text-xs text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  id="add-task-required"
                  type="checkbox"
                  checked={addTaskIsRequired}
                  onChange={(e) => setAddTaskIsRequired(e.target.checked)}
                  className="h-4 w-4 rounded border-[#163B44] bg-[#0B2026] text-emerald-500 focus:ring-emerald-400"
                />
                <label htmlFor="add-task-required" className="text-xs text-gray-300">
                  Required for Whitelist qualification
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAddTaskModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={taskSubmitting}
                >
                  {taskSubmitting ? "Creating..." : "Create Task"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  };

  const renderEditTaskModal = () => {
    if (!editingTask || !selectedCampaign) return null;
    const versionNum = selectedCampaign.currentVersion?.versionNumber ?? 1;

    const originalUrl =
      (editingTask.requirementMetadata?.tweetUrl as string | undefined) || "";
    const isRequiredOriginal = editingTask.isRequired !== false;
    const isUrlChanged = editTaskTweetUrl.trim() !== originalUrl.trim();
    const isRequirementChanged = isRequiredOriginal !== editTaskIsRequired;
    const triggersNewVersion =
      ((isRequiredOriginal || editTaskIsRequired) && isUrlChanged) ||
      isRequirementChanged;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
        <Card className="w-full max-w-lg border-[#163B44] bg-[#0B2026] shadow-2xl">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base text-white">
                Edit Task: {editingTask.title}
              </CardTitle>
              <CardDescription className="text-xs text-gray-400">
                Update task parameters for the campaign.
              </CardDescription>
            </div>
            <button
              type="button"
              onClick={() => setEditingTask(null)}
              className="text-xs font-medium text-gray-400 hover:text-white"
            >
              Close
            </button>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveEditTask} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <span className="mb-1 block font-medium text-gray-400">Task Code</span>
                  <div className="rounded-md border border-[#163B44] bg-[#0B2026]/90 px-3 py-2 font-mono text-xs text-gray-300">
                    {editingTask.taskCode}
                  </div>
                  <span className="mt-1 block text-[10px] text-gray-500">
                    Permanent identifier (immutable).
                  </span>
                </div>
                <div>
                  <span className="mb-1 block font-medium text-gray-400">Task Type</span>
                  <div className="rounded-md border border-[#163B44] bg-[#0B2026]/90 px-3 py-2 font-mono text-xs text-gray-300">
                    {editingTask.taskType}
                  </div>
                  <span className="mt-1 block text-[10px] text-gray-500">
                    Type fixed upon creation.
                  </span>
                </div>
              </div>

              <div>
                <label
                  htmlFor="edit-task-title"
                  className="mb-1 block font-medium text-gray-300"
                >
                  Task Title *
                </label>
                <input
                  id="edit-task-title"
                  type="text"
                  value={editTaskTitle}
                  onChange={(e) => setEditTaskTitle(e.target.value)}
                  required
                  className="w-full rounded-md border border-[#163B44] bg-[#0B2026]/80 px-3 py-2 text-xs text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="edit-task-points"
                  className="mb-1 block font-medium text-gray-300"
                >
                  Points
                </label>
                <input
                  id="edit-task-points"
                  type="number"
                  min="0"
                  value={editTaskPoints}
                  onChange={(e) => setEditTaskPoints(Number(e.target.value))}
                  required
                  className="w-full rounded-md border border-[#163B44] bg-[#0B2026]/80 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="edit-task-url"
                  className="mb-1 block font-medium text-gray-300"
                >
                  Target X Post URL
                </label>
                <input
                  id="edit-task-url"
                  type="url"
                  placeholder="https://x.com/Elychimp/status/..."
                  value={editTaskTweetUrl}
                  onChange={(e) => setEditTaskTweetUrl(e.target.value)}
                  className="w-full rounded-md border border-[#163B44] bg-[#0B2026]/80 px-3 py-2 text-xs text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="edit-task-desc"
                  className="mb-1 block font-medium text-gray-300"
                >
                  Description / Instructions
                </label>
                <textarea
                  id="edit-task-desc"
                  rows={2}
                  value={editTaskDescription}
                  onChange={(e) => setEditTaskDescription(e.target.value)}
                  className="w-full rounded-md border border-[#163B44] bg-[#0B2026]/80 px-3 py-2 text-xs text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  id="edit-task-required"
                  type="checkbox"
                  checked={editTaskIsRequired}
                  onChange={(e) => setEditTaskIsRequired(e.target.checked)}
                  className="h-4 w-4 rounded border-[#163B44] bg-[#0B2026] text-emerald-500 focus:ring-emerald-400"
                />
                <label htmlFor="edit-task-required" className="text-xs text-gray-300">
                  Required for Whitelist qualification
                </label>
              </div>

              {triggersNewVersion && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-[11px] text-amber-200">
                  <div>
                    <span className="font-semibold text-amber-300">
                      Automatic Campaign Version Bump:
                    </span>{" "}
                    Changing the target URL or requirement status on this task will publish
                    a new Campaign Version (v{versionNum + 1}) with full approved carry-over.
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setEditingTask(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={taskSubmitting}
                >
                  {taskSubmitting
                    ? "Saving..."
                    : triggersNewVersion
                      ? "Publish Version Update"
                      : "Save Changes"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  };

  const renderDeleteTaskModal = () => {
    if (!deletingTask || !selectedCampaign) return null;
    const versionNum = selectedCampaign.currentVersion?.versionNumber ?? 1;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
        <Card className="w-full max-w-md border-rose-500/30 bg-[#0B2026] shadow-2xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-rose-300">
              Delete Task Confirmation
            </CardTitle>
            <CardDescription className="text-xs text-gray-400">
              Are you sure you want to delete task &quot;{deletingTask.title}&quot; (
              {deletingTask.taskCode}) from Version {versionNum}? This action cannot be
              undone.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDeletingTask(null)}
              disabled={taskSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              className="bg-rose-600 hover:bg-rose-500"
              onClick={handleConfirmDeleteTask}
              disabled={taskSubmitting}
            >
              {taskSubmitting ? "Deleting..." : "Delete Task"}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  };

  // ---------------------------------------------------------------------------
  // View Renderers: DETAIL vs OVERVIEW
  // ---------------------------------------------------------------------------

  const renderDetail = (camp: CampaignItem) => {
    return (
      <div className="space-y-6">
        {/* Detail Header & Back Navigation */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setViewMode("OVERVIEW")}
                className="text-xs text-gray-300 hover:text-white"
              >
                Back to Overview
              </Button>
              <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
                {camp.title}
              </h1>
              <Badge
                variant={
                  camp.status === "ACTIVE"
                    ? "success"
                    : camp.status === "DRAFT"
                      ? "warning"
                      : "outline"
                }
              >
                {camp.status}
              </Badge>
            </div>
            <p className="text-xs text-gray-400">
              <span className="font-mono text-gray-500">slug: {camp.slug}</span>
              <span className="mx-2 text-gray-600">/</span>
              <span>
                WL Program:{" "}
                <span className="font-mono text-gray-300">{camp.wlProgramId}</span>
              </span>
              <span className="mx-2 text-gray-600">/</span>
              <span>
                Version:{" "}
                <span className="font-mono text-emerald-400">
                  v{camp.currentVersion?.versionNumber ?? 1}
                </span>
              </span>
            </p>
          </div>

          <div className="flex items-center gap-2">
            {renderStatusControls(camp)}
          </div>
        </div>

        {/* Notifications */}
        {renderNotifications()}

        {/* Detail Navigation Tabs */}
        <div className="flex border-b border-[#163B44]" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={detailTab === "tasks"}
            onClick={() => handleSelectTab("tasks")}
            className={`border-b-2 px-4 py-2.5 text-xs font-medium transition-colors ${
              detailTab === "tasks"
                ? "border-emerald-500 text-emerald-400"
                : "border-transparent text-gray-400 hover:text-gray-200"
            }`}
          >
            Tasks
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={detailTab === "versions"}
            onClick={() => handleSelectTab("versions")}
            className={`border-b-2 px-4 py-2.5 text-xs font-medium transition-colors ${
              detailTab === "versions"
                ? "border-emerald-500 text-emerald-400"
                : "border-transparent text-gray-400 hover:text-gray-200"
            }`}
          >
            Version History
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={detailTab === "settings"}
            onClick={() => handleSelectTab("settings")}
            className={`border-b-2 px-4 py-2.5 text-xs font-medium transition-colors ${
              detailTab === "settings"
                ? "border-emerald-500 text-emerald-400"
                : "border-transparent text-gray-400 hover:text-gray-200"
            }`}
          >
            Settings
          </button>
        </div>

        {/* Tab Content */}
        {detailTab === "tasks" && renderTasksTab(camp)}
        {detailTab === "versions" && renderVersionHistoryTab(camp)}
        {detailTab === "settings" && renderSettingsTab(camp)}

        {/* Task Modals */}
        {renderAddTaskModal()}
        {renderEditTaskModal()}
        {renderDeleteTaskModal()}
      </div>
    );
  };

  const renderOverview = () => {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
                Campaigns
              </h1>
              <Badge variant="default">{campaigns.length} Registered</Badge>
            </div>
            <p className="mt-1 text-sm text-gray-400">
              Configure quest campaigns, lifecycle states (DRAFT, ACTIVE, PAUSED), and inspect version tasks.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => {
                setLoading(true);
                setReloadKey((k) => k + 1);
              }}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            {campaigns.length === 0 && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setShowCreateForm(!showCreateForm)}
              >
                {showCreateForm ? "Cancel" : "New Campaign"}
              </Button>
            )}
          </div>
        </div>

        {/* Notifications */}
        {renderNotifications()}

        {/* Create Campaign Collapsible Form (only for initial bootstrap when no campaign exists) */}
        {campaigns.length === 0 && showCreateForm && renderCreateForm()}

        {/* Campaigns List */}
        {loading ? (
          <div className="rounded-lg border border-[#163B44] bg-[#0B2026] p-12 text-center text-sm text-gray-400">
            <RefreshCw className="mx-auto mb-2 h-6 w-6 animate-spin text-emerald-400" />
            Loading campaigns...
          </div>
        ) : campaigns.length === 0 ? (
          <Card className="border-[#163B44] bg-[#0B2026]">
            <CardContent className="p-12 text-center">
              <h3 className="text-base font-semibold text-gray-300">
                No Campaigns Registered
              </h3>
              <p className="mt-1 text-xs text-gray-500">
                Use the &quot;New Campaign&quot; button above to create the first quest campaign.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {campaigns.map((camp, index) => {
              const isExpanded = expandedCampaignId === camp.id;
              const tasks = tasksMap[camp.id] || [];
              const isPrimary = index === 0;

              return (
                <Card
                  key={camp.id}
                  className={`border-[#163B44] bg-[#0B2026]/90 transition-all hover:border-[#163B44]/80 ${
                    isPrimary ? "ring-1 ring-emerald-500/20" : ""
                  }`}
                >
                  <CardContent className="p-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="flex-1 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-bold text-white">{camp.title}</h3>
                          {isPrimary && (
                            <Badge
                              variant="outline"
                              className="border-emerald-500/40 text-[10px] text-emerald-400"
                            >
                              Main Campaign
                            </Badge>
                          )}
                          <Badge
                            variant={
                              camp.status === "ACTIVE"
                                ? "success"
                                : camp.status === "DRAFT"
                                  ? "warning"
                                  : "outline"
                            }
                          >
                            {camp.status}
                          </Badge>
                          <span className="font-mono text-xs text-gray-400">
                            slug: {camp.slug}
                          </span>
                        </div>

                        {camp.description && (
                          <p className="text-xs text-gray-300">{camp.description}</p>
                        )}

                        <div className="grid grid-cols-1 gap-2 pt-1 text-xs text-gray-400 sm:grid-cols-3">
                          <div>
                            <span className="text-gray-500">WL Program ID:</span>{" "}
                            <span className="font-mono text-gray-300">
                              {camp.wlProgramId}
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-500">Version:</span>{" "}
                            <span className="font-mono text-gray-300">
                              v{camp.currentVersion?.versionNumber ?? 1} (
                              {camp.currentVersion?.compatibilityMode ?? "STRICT"})
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-500">Starts At:</span>{" "}
                            <span className="text-gray-300">
                              {camp.currentVersion?.startsAt
                                ? new Date(
                                    camp.currentVersion.startsAt,
                                  ).toLocaleDateString()
                                : "Immediate"}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Controls */}
                      <div className="flex flex-wrap items-center gap-2 pt-2 lg:pt-0">
                        {renderStatusControls(camp)}

                        <Button
                          variant="primary"
                          size="sm"
                          className="text-xs"
                          onClick={() => handleOpenDetail(camp.id, "tasks")}
                        >
                          Manage Campaign
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs"
                          onClick={() => handleToggleTasks(camp)}
                        >
                          Tasks
                        </Button>
                      </div>
                    </div>

                    {/* Collapsible Tasks Viewer */}
                    {isExpanded && renderInlineTasks(camp, tasks)}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Backend Notice */}
        <PlaceholderNotice
          title="Quest Automation Engine"
          description="Automated recurring campaign timers and dynamic quest generation APIs are not yet available. Campaign lifecycles and version task definitions are updated directly via the endpoints above."
          phase="Upcoming Feature"
        />
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {viewMode === "OVERVIEW" && renderOverview()}
      {viewMode === "DETAIL" && selectedCampaign && renderDetail(selectedCampaign)}
      {viewMode === "DETAIL" && !selectedCampaign && (
        <div className="p-8 text-center text-sm text-gray-400">
          <p>No campaign selected.</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setViewMode("OVERVIEW")}
            className="mt-4"
          >
            Back to Overview
          </Button>
        </div>
      )}
    </div>
  );
}
