"use client";

import React, { useEffect, useState, useRef } from "react";
import {
  Sparkles,
  Upload,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Image as ImageIcon,
  Plus,
  X,
  Pencil,
  Trash2,
  Power,
} from "lucide-react";
import { Button } from "@/components/ui/Button";

interface TraitItem {
  id: string;
  slug: string;
  name: string;
  category: "BG" | "FUR" | "CLOTHING" | "HEADWEAR" | "EYEWEAR";
  rarity: "COMMON" | "UNCOMMON" | "RARE" | "EPIC" | "LEGENDARY";
  imageUrl: string;
  description?: string | null;
  maxSupply?: number | null;
  isActive: boolean;
}

const CATEGORIES = ["BG", "FUR", "CLOTHING", "HEADWEAR", "EYEWEAR"] as const;
const RARITIES = ["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY"] as const;

const RARITY_COLORS: Record<string, string> = {
  COMMON: "border-gray-700 bg-gray-800 text-gray-300",
  UNCOMMON: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  RARE: "border-sky-500/30 bg-sky-500/10 text-sky-400",
  EPIC: "border-purple-500/30 bg-purple-500/10 text-purple-400",
  LEGENDARY: "border-amber-500/30 bg-amber-500/10 text-amber-400 font-bold",
};

export function AdminTraits() {
  const [traits, setTraits] = useState<TraitItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");

  // Upload modal state
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadName, setUploadName] = useState("");
  const [uploadCategory, setUploadCategory] = useState<(typeof CATEGORIES)[number]>("BG");
  const [uploadRarity, setUploadRarity] = useState<(typeof RARITIES)[number]>("COMMON");
  const [uploadDescription, setUploadDescription] = useState("");
  const [uploadMaxSupply, setUploadMaxSupply] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  // Edit modal state
  const [editingTrait, setEditingTrait] = useState<TraitItem | null>(null);
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState<(typeof CATEGORIES)[number]>("BG");
  const [editRarity, setEditRarity] = useState<(typeof RARITIES)[number]>("COMMON");
  const [editDescription, setEditDescription] = useState("");
  const [editMaxSupply, setEditMaxSupply] = useState("");
  const [editIsActive, setEditIsActive] = useState(true);
  const [editFile, setEditFile] = useState<File | null>(null);
  const [editPreviewUrl, setEditPreviewUrl] = useState<string | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSuccess, setEditSuccess] = useState<string | null>(null);

  // Delete modal state
  const [deletingTrait, setDeletingTrait] = useState<TraitItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteSuccess, setDeleteSuccess] = useState<string | null>(null);

  // Inline action state
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);

  const fetchTraits = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/traits");
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || "Failed to load traits.");
      }
      setTraits(data.traits || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load traits.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTraits();
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      const objectUrl = URL.createObjectURL(file);
      setPreviewUrl(objectUrl);
    }
  };

  const handleEditFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setEditFile(file);
      const objectUrl = URL.createObjectURL(file);
      setEditPreviewUrl(objectUrl);
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setUploadError("Please select a PNG image file.");
      return;
    }
    if (!uploadName.trim()) {
      setUploadError("Trait name is required.");
      return;
    }

    setIsUploading(true);
    setUploadError(null);
    setUploadSuccess(null);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("name", uploadName.trim());
      formData.append("category", uploadCategory);
      formData.append("rarity", uploadRarity);
      if (uploadDescription.trim()) {
        formData.append("description", uploadDescription.trim());
      }
      if (uploadMaxSupply.trim()) {
        formData.append("maxSupply", uploadMaxSupply.trim());
      }

      const res = await fetch("/api/admin/traits/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || "Upload failed.");
      }

      setUploadSuccess(`Trait "${uploadName}" uploaded and saved successfully!`);
      setUploadName("");
      setUploadDescription("");
      setUploadMaxSupply("");
      setSelectedFile(null);
      setPreviewUrl(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      await fetchTraits();
      setTimeout(() => {
        setIsUploadOpen(false);
        setUploadSuccess(null);
      }, 1200);
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setIsUploading(false);
    }
  };

  const openEditModal = (trait: TraitItem) => {
    setEditingTrait(trait);
    setEditName(trait.name ?? "");
    setEditCategory(trait.category);
    setEditRarity(trait.rarity);
    setEditDescription(trait.description || "");
    setEditMaxSupply(trait.maxSupply ? String(trait.maxSupply) : "");
    setEditIsActive(Boolean(trait.isActive));
    setEditFile(null);
    setEditPreviewUrl(trait.imageUrl);
    setEditError(null);
    setEditSuccess(null);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTrait) return;
    if (!editName.trim()) {
      setEditError("Trait name is required.");
      return;
    }

    setIsSavingEdit(true);
    setEditError(null);
    setEditSuccess(null);

    try {
      if (editFile) {
        const formData = new FormData();
        formData.append("file", editFile);
        formData.append("name", editName.trim());
        formData.append("category", editCategory);
        formData.append("rarity", editRarity);
        if (editDescription.trim()) {
          formData.append("description", editDescription.trim());
        }
        if (editMaxSupply.trim()) {
          formData.append("maxSupply", editMaxSupply.trim());
        }

        const uploadRes = await fetch("/api/admin/traits/upload", {
          method: "POST",
          body: formData,
        });
        const uploadData = await uploadRes.json();
        if (!uploadRes.ok) {
          throw new Error(uploadData.message || uploadData.error || "Image upload failed.");
        }
      }

      const res = await fetch("/api/admin/traits", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingTrait.id,
          name: editName.trim(),
          category: editCategory,
          rarity: editRarity,
          description: editDescription.trim() || null,
          maxSupply: editMaxSupply.trim() ? parseInt(editMaxSupply.trim(), 10) : null,
          isActive: editIsActive,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || "Failed to save trait updates.");
      }

      setEditSuccess(`Trait "${editName}" updated successfully!`);
      await fetchTraits();
      setTimeout(() => {
        setEditingTrait(null);
        setEditSuccess(null);
      }, 1000);
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : "Failed to update trait.");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleToggleActive = async (trait: TraitItem) => {
    setTogglingId(trait.id);
    try {
      const res = await fetch("/api/admin/traits", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: trait.id,
          isActive: !trait.isActive,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || "Failed to toggle status.");
      }
      setTraits((prev) =>
        prev.map((t) => (t.id === trait.id ? { ...t, isActive: !t.isActive } : t)),
      );
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to toggle trait status.");
    } finally {
      setTogglingId(null);
    }
  };

  const handleDeleteSubmit = async () => {
    if (!deletingTrait) return;
    setIsDeleting(true);
    setDeleteError(null);
    setDeleteSuccess(null);

    try {
      const res = await fetch(`/api/admin/traits?id=${deletingTrait.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || "Failed to delete trait.");
      }

      setDeleteSuccess(data.message || `Trait "${deletingTrait.name}" removed.`);
      await fetchTraits();
      setTimeout(() => {
        setDeletingTrait(null);
        setDeleteSuccess(null);
      }, 1200);
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete trait.");
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredTraits = traits.filter((t) => {
    const matchesCategory = selectedCategory === "ALL" || t.category === selectedCategory;
    const matchesStatus =
      statusFilter === "ALL" ||
      (statusFilter === "ACTIVE" && t.isActive) ||
      (statusFilter === "INACTIVE" && !t.isActive);
    return matchesCategory && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-emerald-400" />
            Trait Catalog Manager
          </h2>
          <p className="text-sm text-gray-400">
            Ingest, configure, edit, and manage 240×240 pixel art trait layers for drops and avatar composite rendering.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchTraits}
            disabled={loading}
            className="flex items-center gap-1.5"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setIsUploadOpen(true)}
            className="flex items-center gap-1.5"
          >
            <Plus className="h-4 w-4" />
            Upload Trait
          </Button>
        </div>
      </div>

      {/* Filter Toolbar: Categories & Status */}
      <div className="flex flex-col gap-3 border-b border-gray-800 pb-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Category filter tabs */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSelectedCategory("ALL")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              selectedCategory === "ALL"
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                : "bg-gray-900/60 text-gray-400 hover:text-white border border-gray-800"
            }`}
          >
            All Categories ({traits.length})
          </button>
          {CATEGORIES.map((cat) => {
            const count = traits.filter((t) => t.category === cat).length;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  selectedCategory === cat
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                    : "bg-gray-900/60 text-gray-400 hover:text-white border border-gray-800"
                }`}
              >
                {cat} ({count})
              </button>
            );
          })}
        </div>

        {/* Status Filter */}
        <div className="flex items-center gap-1 self-start rounded-lg border border-gray-800 bg-gray-950 p-1 sm:self-auto">
          {(["ALL", "ACTIVE", "INACTIVE"] as const).map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => setStatusFilter(filter)}
              className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                statusFilter === filter
                  ? "bg-gray-800 text-white shadow-sm"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              {filter === "ALL" ? "All Status" : filter === "ACTIVE" ? "Active" : "Inactive"}
            </button>
          ))}
        </div>
      </div>

      {/* Traits Grid */}
      {loading ? (
        <div className="rounded-xl border border-gray-800 bg-[#0c0e17] p-12 text-center text-gray-400">
          <RefreshCw className="mx-auto mb-2 h-6 w-6 animate-spin text-emerald-400" />
          <p className="text-sm">Loading trait catalog...</p>
        </div>
      ) : error ? (
        <div className="rounded-xl border border-rose-900/40 bg-rose-950/20 p-6 text-center text-rose-300">
          <AlertTriangle className="mx-auto mb-2 h-6 w-6 text-rose-400" />
          <p className="text-sm font-semibold">{error}</p>
        </div>
      ) : filteredTraits.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-800 bg-[#0c0e17] p-12 text-center text-gray-400">
          <Layers className="mx-auto mb-3 h-10 w-10 text-gray-600" />
          <h3 className="text-base font-semibold text-white">No traits match filter</h3>
          <p className="mt-1 text-xs text-gray-500">
            Upload new traits or switch the category/status filter above.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsUploadOpen(true)}
            className="mt-4"
          >
            Upload Trait
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {filteredTraits.map((trait) => (
            <div
              key={trait.id}
              className={`group relative flex flex-col overflow-hidden rounded-xl border p-3 shadow transition-all ${
                trait.isActive
                  ? "border-gray-800 bg-[#0c0e17]/80 hover:border-gray-700 hover:shadow-lg"
                  : "border-gray-800/60 bg-[#0c0e17]/40 opacity-70 hover:opacity-100"
              }`}
            >
              {/* Image Preview Container */}
              <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-gray-950/80 border border-gray-800/80">
                <img
                  src={trait.imageUrl}
                  alt={trait.name}
                  className="h-full w-full object-contain [image-rendering:pixelated] transition-transform group-hover:scale-105"
                />
                {/* Category Badge */}
                <span className="absolute top-2 right-2 rounded border border-gray-800 bg-gray-900/90 px-1.5 py-0.5 text-[9px] font-bold text-gray-300 uppercase">
                  {trait.category}
                </span>
                {/* Active Indicator Dot */}
                <span
                  title={trait.isActive ? "Active in Drop Pools" : "Inactive (Hidden from Drops)"}
                  className={`absolute top-2 left-2 flex h-2.5 w-2.5 items-center justify-center rounded-full ${
                    trait.isActive ? "bg-emerald-500 shadow-sm shadow-emerald-500/50" : "bg-gray-600"
                  }`}
                />
              </div>

              {/* Trait Metadata */}
              <div className="mt-2.5 flex-1 space-y-1">
                <div className="flex items-center justify-between gap-1">
                  <h4 className="truncate text-xs font-bold text-white" title={trait.name}>
                    {trait.name}
                  </h4>
                  <span
                    className={`rounded border px-1.5 py-0.2 text-[8px] font-semibold uppercase ${
                      trait.isActive
                        ? "border-emerald-500/40 text-emerald-400"
                        : "border-gray-700 text-gray-500"
                    }`}
                  >
                    {trait.isActive ? "Active" : "Inactive"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span
                    className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase ${
                      RARITY_COLORS[trait.rarity] || RARITY_COLORS.COMMON
                    }`}
                  >
                    {trait.rarity}
                  </span>
                  <span className="text-[10px] text-gray-500 font-mono">
                    {trait.maxSupply ? `Max: ${trait.maxSupply}` : "Supply: ∞"}
                  </span>
                </div>
              </div>

              {/* Action Buttons: Edit, Toggle Active, Delete */}
              <div className="mt-3 flex items-center justify-between gap-1 border-t border-gray-800/80 pt-2">
                <button
                  type="button"
                  title={trait.isActive ? "Deactivate (exclude from drops)" : "Activate (include in drops)"}
                  disabled={togglingId === trait.id}
                  onClick={() => handleToggleActive(trait)}
                  className={`flex h-7 w-7 items-center justify-center rounded-md border text-xs transition-colors ${
                    trait.isActive
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                      : "border-gray-800 bg-gray-900 text-gray-500 hover:text-gray-300"
                  }`}
                >
                  <Power className="h-3.5 w-3.5" />
                </button>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    title="Edit Trait Details"
                    onClick={() => openEditModal(trait)}
                    className="flex h-7 items-center gap-1 rounded-md border border-gray-800 bg-gray-900/80 px-2 text-[11px] font-medium text-gray-300 hover:border-gray-700 hover:bg-gray-800 hover:text-white transition-colors"
                  >
                    <Pencil className="h-3 w-3" />
                    Edit
                  </button>
                  <button
                    type="button"
                    title="Delete Trait"
                    onClick={() => {
                      setDeletingTrait(trait);
                      setDeleteError(null);
                      setDeleteSuccess(null);
                    }}
                    className="flex h-7 w-7 items-center justify-center rounded-md border border-rose-900/40 bg-rose-950/20 text-rose-400 hover:bg-rose-950/50 hover:text-rose-300 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload Modal */}
      {isUploadOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-lg rounded-2xl border border-gray-800 bg-[#0c0e17] p-6 shadow-2xl">
            <button
              type="button"
              onClick={() => setIsUploadOpen(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>

            <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-1">
              <Upload className="h-5 w-5 text-emerald-400" />
              Upload Trait Layer
            </h3>
            <p className="text-xs text-gray-400 mb-4">
              Upload a 240×240 (or 24×24 pixel art) PNG with transparent background.
            </p>

            {uploadError && (
              <div className="mb-4 rounded-lg border border-rose-900/40 bg-rose-950/20 p-3 text-xs text-rose-300 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" />
                <span>{uploadError}</span>
              </div>
            )}

            {uploadSuccess && (
              <div className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                <span>{uploadSuccess}</span>
              </div>
            )}

            <form onSubmit={handleUploadSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                  PNG Image File (240×240 Transparent)
                </label>
                <div className="flex items-center gap-4">
                  <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-dashed border-gray-700 bg-gray-950 flex items-center justify-center">
                    {previewUrl ? (
                      <img
                        src={previewUrl}
                        alt="Preview"
                        className="h-full w-full object-contain [image-rendering:pixelated]"
                      />
                    ) : (
                      <ImageIcon className="h-6 w-6 text-gray-600" />
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png"
                    onChange={handleFileChange}
                    className="block w-full text-xs text-gray-400 file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-500/10 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-emerald-400 hover:file:bg-emerald-500/20 cursor-pointer"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">
                    Trait Name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Cyber Halo"
                    value={uploadName}
                    onChange={(e) => setUploadName(e.target.value)}
                    className="w-full rounded-lg border border-gray-800 bg-gray-900/60 px-3 py-2 text-xs text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">
                    Category
                  </label>
                  <select
                    value={uploadCategory}
                    onChange={(e) =>
                      setUploadCategory(e.target.value as (typeof CATEGORIES)[number])
                    }
                    className="w-full rounded-lg border border-gray-800 bg-gray-900 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">
                    Rarity
                  </label>
                  <select
                    value={uploadRarity}
                    onChange={(e) =>
                      setUploadRarity(e.target.value as (typeof RARITIES)[number])
                    }
                    className="w-full rounded-lg border border-gray-800 bg-gray-900 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
                  >
                    {RARITIES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">
                    Max Supply (Optional)
                  </label>
                  <input
                    type="number"
                    min="1"
                    placeholder="e.g. 50"
                    value={uploadMaxSupply}
                    onChange={(e) => setUploadMaxSupply(e.target.value)}
                    className="w-full rounded-lg border border-gray-800 bg-gray-900/60 px-3 py-2 text-xs text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">
                  Description / Lore (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Short description of this trait..."
                  value={uploadDescription}
                  onChange={(e) => setUploadDescription(e.target.value)}
                  className="w-full rounded-lg border border-gray-800 bg-gray-900/60 px-3 py-2 text-xs text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsUploadOpen(false)}
                  disabled={isUploading}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={isUploading}
                  className="flex items-center gap-1.5"
                >
                  {isUploading ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4" />
                      Save Trait
                    </>
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Trait Modal */}
      {editingTrait && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-lg rounded-2xl border border-gray-800 bg-[#0c0e17] p-6 shadow-2xl">
            <button
              type="button"
              onClick={() => setEditingTrait(null)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>

            <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-1">
              <Pencil className="h-5 w-5 text-emerald-400" />
              Edit Trait: {editingTrait.name}
            </h3>
            <p className="text-xs text-gray-400 mb-4">
              Modify trait metadata, adjust active pool status, or replace the artwork PNG.
            </p>

            {editError && (
              <div className="mb-4 rounded-lg border border-rose-900/40 bg-rose-950/20 p-3 text-xs text-rose-300 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" />
                <span>{editError}</span>
              </div>
            )}

            {editSuccess && (
              <div className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                <span>{editSuccess}</span>
              </div>
            )}

            <form onSubmit={handleEditSubmit} className="space-y-4">
              {/* Artwork Replacement (Optional) */}
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                  Trait Artwork (Upload to replace current PNG)
                </label>
                <div className="flex items-center gap-4">
                  <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-gray-700 bg-gray-950 flex items-center justify-center">
                    {editPreviewUrl ? (
                      <img
                        src={editPreviewUrl}
                        alt="Current Trait"
                        className="h-full w-full object-contain [image-rendering:pixelated]"
                      />
                    ) : (
                      <ImageIcon className="h-6 w-6 text-gray-600" />
                    )}
                  </div>
                  <div className="flex-1 space-y-1">
                    <input
                      ref={editFileInputRef}
                      type="file"
                      accept="image/png"
                      onChange={handleEditFileChange}
                      className="block w-full text-xs text-gray-400 file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-500/10 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-emerald-400 hover:file:bg-emerald-500/20 cursor-pointer"
                    />
                    <p className="text-[10px] text-gray-500">
                      Leave empty to retain existing artwork file.
                    </p>
                  </div>
                </div>
              </div>

              {/* Name & Category */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">
                    Trait Name
                  </label>
                  <input
                    type="text"
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full rounded-lg border border-gray-800 bg-gray-900/60 px-3 py-2 text-xs text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">
                    Category
                  </label>
                  <select
                    value={editCategory}
                    onChange={(e) =>
                      setEditCategory(e.target.value as (typeof CATEGORIES)[number])
                    }
                    className="w-full rounded-lg border border-gray-800 bg-gray-900 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Rarity & Max Supply */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">
                    Rarity
                  </label>
                  <select
                    value={editRarity}
                    onChange={(e) =>
                      setEditRarity(e.target.value as (typeof RARITIES)[number])
                    }
                    className="w-full rounded-lg border border-gray-800 bg-gray-900 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
                  >
                    {RARITIES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">
                    Max Supply (Optional)
                  </label>
                  <input
                    type="number"
                    min="1"
                    placeholder="Infinite"
                    value={editMaxSupply}
                    onChange={(e) => setEditMaxSupply(e.target.value)}
                    className="w-full rounded-lg border border-gray-800 bg-gray-900/60 px-3 py-2 text-xs text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Status Toggle Checkbox */}
              <div className="flex items-center gap-3 rounded-lg border border-gray-800 bg-gray-900/40 p-3">
                <input
                  id="edit-is-active"
                  type="checkbox"
                  checked={Boolean(editIsActive)}
                  onChange={(e) => setEditIsActive(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-700 bg-gray-850 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-gray-900 cursor-pointer"
                />
                <label htmlFor="edit-is-active" className="text-xs text-gray-300 cursor-pointer select-none">
                  <span className="font-semibold text-white">Active in Drop Cycles</span>
                  <p className="text-[11px] text-gray-500">
                    When active, this trait will automatically be included in auto-replenish drop cycles.
                  </p>
                </label>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">
                  Description / Lore (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Short description..."
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="w-full rounded-lg border border-gray-800 bg-gray-900/60 px-3 py-2 text-xs text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none resize-none"
                />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setEditingTrait(null)}
                  disabled={isSavingEdit}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={isSavingEdit}
                  className="flex items-center gap-1.5"
                >
                  {isSavingEdit ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save Changes"
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingTrait && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-md rounded-2xl border border-gray-800 bg-[#0c0e17] p-6 shadow-2xl">
            <button
              type="button"
              onClick={() => setDeletingTrait(null)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-3 text-rose-400 mb-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-rose-900/50 bg-rose-950/30">
                <Trash2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Delete Trait</h3>
                <p className="text-xs text-gray-400">Remove from catalog and drop pools</p>
              </div>
            </div>

            {deleteError && (
              <div className="mb-4 rounded-lg border border-rose-900/40 bg-rose-950/20 p-3 text-xs text-rose-300 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" />
                <span>{deleteError}</span>
              </div>
            )}

            {deleteSuccess && (
              <div className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                <span>{deleteSuccess}</span>
              </div>
            )}

            <div className="mb-4 flex items-center gap-3 rounded-xl border border-gray-800 bg-gray-950/60 p-3">
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-gray-700 bg-gray-900">
                <img
                  src={deletingTrait.imageUrl}
                  alt={deletingTrait.name}
                  className="h-full w-full object-contain [image-rendering:pixelated]"
                />
              </div>
              <div className="overflow-hidden">
                <p className="truncate text-sm font-bold text-white">{deletingTrait.name}</p>
                <p className="text-xs text-gray-400">
                  {deletingTrait.category} • {deletingTrait.rarity}
                </p>
              </div>
            </div>

            <p className="text-xs text-gray-400 leading-relaxed mb-6">
              Are you sure you want to delete this trait? If this trait is already owned by users in their inventory, it will be safely deactivated (<span className="font-mono text-emerald-400">isActive: false</span>) instead of hard-deleted to preserve user inventory assets.
            </p>

            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setDeletingTrait(null)}
                disabled={isDeleting}
              >
                Cancel
              </Button>
              <button
                type="button"
                onClick={handleDeleteSubmit}
                disabled={isDeleting}
                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-600/40 bg-rose-600/20 px-3.5 py-2 text-xs font-semibold text-rose-300 hover:bg-rose-600/30 disabled:opacity-50 transition-colors"
              >
                {isDeleting ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-3.5 w-3.5" />
                    Confirm Delete
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
