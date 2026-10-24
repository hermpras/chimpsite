"use client";

import React, { useEffect, useState } from "react";
import {
  Sparkles,
  Plus,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Clock,
  Layers,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
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
} from "@/lib/admin/client";

interface CampaignItem {
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

interface CampaignTaskItem {
  id: string;
  taskCode: string;
  title: string;
  description: string | null;
  taskType: string;
  points: number;
  sortOrder: number;
  isActive: boolean;
}

export function AdminCampaigns() {
  const [campaigns, setCampaigns] = useState<CampaignItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Expanded tasks mapping
  const [expandedCampaignId, setExpandedCampaignId] = useState<string | null>(null);
  const [tasksMap, setTasksMap] = useState<Record<string, CampaignTaskItem[]>>({});
  const [loadingTasksId, setLoadingTasksId] = useState<string | null>(null);

  // Create Campaign Form State
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newSlug, setNewSlug] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newWlProgramId, setNewWlProgramId] = useState("");
  const [newStartsAt, setNewStartsAt] = useState("");
  const [creating, setCreating] = useState(false);

  // Status updating in progress
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let isMounted = true;
    adminListCampaigns()
      .then((res) => {
        if (isMounted) {
          setCampaigns(res.campaigns || []);
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

  const handleToggleTasks = async (campaign: CampaignItem) => {
    if (expandedCampaignId === campaign.id) {
      setExpandedCampaignId(null);
      return;
    }

    setExpandedCampaignId(campaign.id);
    const versionNum = campaign.currentVersion?.versionNumber ?? 1;

    if (!tasksMap[campaign.id]) {
      setLoadingTasksId(campaign.id);
      try {
        const res = await adminListCampaignTasks(campaign.id, versionNum);
        setTasksMap((prev) => ({
          ...prev,
          [campaign.id]: res.tasks || [],
        }));
      } catch (err: unknown) {
        console.error("Failed to load tasks:", err);
      } finally {
        setLoadingTasksId(null);
      }
    }
  };

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
            Configure quest campaigns, lifecycle states (DRAFT, ACTIVE, PAUSED), and
            inspect version tasks.
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
          <Button
            variant="primary"
            size="sm"
            className="gap-2"
            onClick={() => setShowCreateForm(!showCreateForm)}
          >
            <Plus className="h-4 w-4" />
            {showCreateForm ? "Cancel" : "New Campaign"}
          </Button>
        </div>
      </div>

      {/* Notifications */}
      {successMessage && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-400" />
          <span>{successMessage}</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
          <AlertCircle className="h-4 w-4 flex-shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Create Campaign Collapsible Form */}
      {showCreateForm && (
        <Card className="border-emerald-500/30 bg-[#0c0e17]">
          <CardHeader>
            <CardTitle className="text-base text-white">Create New Campaign</CardTitle>
            <CardDescription className="text-xs text-gray-400">
              Registers a campaign in DRAFT status bound to an existing Whitelist Program
              ID.
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
                    className="w-full rounded-md border border-gray-700 bg-gray-900/60 px-3 py-2 text-xs text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none"
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
                    className="w-full rounded-md border border-gray-700 bg-gray-900/60 px-3 py-2 text-xs text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label
                    htmlFor="camp-wl"
                    className="mb-1 block text-xs font-medium text-gray-400"
                  >
                    Whitelist Program ID *
                  </label>
                  <input
                    id="camp-wl"
                    type="text"
                    placeholder="e.g. wl-program-genesis"
                    value={newWlProgramId}
                    onChange={(e) => setNewWlProgramId(e.target.value)}
                    required
                    className="w-full rounded-md border border-gray-700 bg-gray-900/60 px-3 py-2 text-xs text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none"
                  />
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
                    className="w-full rounded-md border border-gray-700 bg-gray-900/60 px-3 py-2 text-xs text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none"
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
                  className="w-full rounded-md border border-gray-700 bg-gray-900/60 px-3 py-2 text-xs text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none"
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
      )}

      {/* Campaigns List */}
      {loading ? (
        <div className="rounded-lg border border-gray-800 bg-[#0c0e17] p-12 text-center text-sm text-gray-400">
          <RefreshCw className="mx-auto mb-2 h-6 w-6 animate-spin text-emerald-400" />
          Loading campaigns...
        </div>
      ) : campaigns.length === 0 ? (
        <Card className="border-gray-800 bg-[#0c0e17]">
          <CardContent className="p-12 text-center">
            <Sparkles className="mx-auto mb-3 h-10 w-10 text-gray-600" />
            <h3 className="text-base font-semibold text-gray-300">
              No Campaigns Registered
            </h3>
            <p className="mt-1 text-xs text-gray-500">
              Use the &quot;New Campaign&quot; button above to create the first quest
              campaign.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {campaigns.map((camp) => {
            const isBusy = updatingId === camp.id;
            const isExpanded = expandedCampaignId === camp.id;
            const tasks = tasksMap[camp.id] || [];

            return (
              <Card
                key={camp.id}
                className="border-gray-800 bg-[#0c0e17]/90 transition-all hover:border-gray-700/80"
              >
                <CardContent className="p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-bold text-white">{camp.title}</h3>
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

                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1 text-xs"
                        onClick={() => handleToggleTasks(camp)}
                      >
                        <Layers className="h-3.5 w-3.5" />
                        Tasks
                        {isExpanded ? (
                          <ChevronUp className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Collapsible Tasks Viewer */}
                  {isExpanded && (
                    <div className="mt-4 border-t border-gray-800 pt-3">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-xs font-semibold text-gray-300">
                          Version {camp.currentVersion?.versionNumber ?? 1} Task
                          Specifications
                        </span>
                        <span className="text-xs text-gray-500">
                          {loadingTasksId === camp.id
                            ? "Loading..."
                            : `${tasks.length} tasks`}
                        </span>
                      </div>

                      {loadingTasksId === camp.id ? (
                        <div className="py-4 text-center text-xs text-gray-500">
                          Loading version tasks...
                        </div>
                      ) : tasks.length === 0 ? (
                        <div className="rounded border border-gray-800/80 bg-gray-900/30 p-3 text-xs text-gray-500 italic">
                          No tasks configured in this version.
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {tasks.map((task) => (
                            <div
                              key={task.id}
                              className="space-y-1 rounded border border-gray-800 bg-gray-900/40 p-2.5 text-xs"
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-white">
                                  {task.title}
                                </span>
                                <Badge variant="outline" className="text-[10px]">
                                  {task.points} pts
                                </Badge>
                              </div>
                              <div className="flex items-center gap-2 font-mono text-[11px] text-gray-400">
                                <span>code: {task.taskCode}</span>
                                <span>type: {task.taskType}</span>
                              </div>
                              {task.description && (
                                <p className="text-[11px] text-gray-400">
                                  {task.description}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
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
}
