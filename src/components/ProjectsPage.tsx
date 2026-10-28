import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Copy,
  FilePlus2,
  FolderOpen,
  ImageOff,
  Pencil,
  Trash2,
} from 'lucide-react';
import { createEmptyDocument } from '../core/schema/designDocument';
import {
  deleteLocalProject,
  duplicateLocalProject,
  getProjectThumbnail,
  listLocalProjects,
  renameLocalProject,
  type ProjectRecord,
} from '../lib/projectStore';
import { useDialogAccessibility } from '../hooks/useDialogAccessibility';

interface ProjectsPageProps {
  onOpenProject: (projectId: string) => Promise<void>;
  onCreateProject: (document: ReturnType<typeof createEmptyDocument>) => void;
  onStartBeginnerMode: () => void;
  onBack: () => void;
  activeProjectId?: string;
  onProjectRenamed?: (projectId: string, name: string) => void;
  onProjectDeleted?: (projectId: string) => void;
}

export const ProjectsPage: React.FC<ProjectsPageProps> = ({
  onOpenProject,
  onCreateProject,
  onStartBeginnerMode,
  onBack,
  activeProjectId,
  onProjectRenamed,
  onProjectDeleted,
}) => {
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const thumbnailUrls = useRef<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<ProjectRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remoteDeleteTarget, setRemoteDeleteTarget] = useState<string | null>(null);
  const [remoteDeleteError, setRemoteDeleteError] = useState<string | null>(null);
  const deleteDialogRef = useDialogAccessibility<HTMLDivElement>(deleteTarget !== null, () => {
    if (!busy) setDeleteTarget(null);
  });

  const refresh = async () => {
    const items = await listLocalProjects();
    setProjects(items);
    const entries = await Promise.all(items.map(async (project) => [project.id, await getProjectThumbnail(project)] as const));
    const nextThumbnails = Object.fromEntries(entries.filter((entry): entry is readonly [string, string] => Boolean(entry[1])));
    for (const [id, url] of Object.entries(thumbnailUrls.current)) {
      if (nextThumbnails[id] !== url) URL.revokeObjectURL(url);
    }
    thumbnailUrls.current = nextThumbnails;
    setThumbnails(nextThumbnails);
  };

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const items = await listLocalProjects();
        if (!mounted) return;
        setProjects(items);
        const entries = await Promise.all(items.map(async (project) => [project.id, await getProjectThumbnail(project)] as const));
        if (mounted) {
          const nextThumbnails = Object.fromEntries(entries.filter((entry): entry is readonly [string, string] => Boolean(entry[1])));
          thumbnailUrls.current = nextThumbnails;
          setThumbnails(nextThumbnails);
        } else {
          for (const [, url] of entries) if (url) URL.revokeObjectURL(url);
        }
      } catch (cause) {
        if (mounted) setError(cause instanceof Error ? cause.message : 'Could not load local projects.');
      }
    };
    void load();
    return () => {
      mounted = false;
      for (const url of Object.values(thumbnailUrls.current)) URL.revokeObjectURL(url);
    };
  }, []);

  const rename = async (project: ProjectRecord) => {
    try {
      await renameLocalProject(project.id, editingName);
      setEditingId(null);
      onProjectRenamed?.(project.id, editingName.trim());
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not rename project.');
    }
  };

  const duplicate = async (project: ProjectRecord) => {
    setBusy(true);
    setError(null);
    try {
      const duplicateDocument = await duplicateLocalProject(project.id);
      await refresh();
      await onOpenProject(duplicateDocument.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not duplicate project.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    setError(null);
    try {
      await deleteLocalProject(deleteTarget.id);
      onProjectDeleted?.(deleteTarget.id);
      const deletedId = deleteTarget.id;
      setDeleteTarget(null);
      await deleteRemoteCopy(deletedId);
      await refresh();
      if (activeProjectId === deleteTarget.id && projects.length > 1) {
        const next = projects.find((project) => project.id !== deleteTarget.id);
        if (next) await onOpenProject(next.id);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not delete project assets.');
    } finally {
      setBusy(false);
    }
  };

  const deleteRemoteCopy = async (projectId: string) => {
    try {
      const response = await fetch(`/api/documents/${encodeURIComponent(projectId)}`, { method: 'DELETE' });
      if (!response.ok) throw new Error(`Server cleanup failed (${response.status}).`);
      const analysisResponse = await fetch(`/api/analysis/jobs/${encodeURIComponent(projectId)}`, { method: 'DELETE' });
      if (!analysisResponse.ok) throw new Error(`Analysis data cleanup failed (${analysisResponse.status}).`);
      setRemoteDeleteTarget(null);
      setRemoteDeleteError(null);
    } catch (cause) {
      setRemoteDeleteTarget(projectId);
      setRemoteDeleteError(cause instanceof Error ? cause.message : 'The local project was deleted, but its server copy could not be removed.');
    }
  };

  const open = async (project: ProjectRecord) => {
    setBusy(true);
    setError(null);
    try {
      await onOpenProject(project.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not open project.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen overflow-y-auto bg-neutral-950 px-4 py-6 text-neutral-100 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-7 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button type="button" onClick={onBack} aria-label="Back to editor" className="min-h-11 min-w-11 rounded-lg border border-neutral-700 hover:bg-neutral-800">
              <ArrowLeft className="mx-auto h-4 w-4" />
            </button>
            <div>
              <h1 className="text-xl font-semibold">Your projects</h1>
              <p className="mt-1 text-xs text-neutral-400">Projects and assets are stored on this device. Server sync is used when available; there is no account sync.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onStartBeginnerMode}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-neutral-700 px-4 text-sm font-semibold text-neutral-200 hover:bg-neutral-800"
            >
              Start with a size
            </button>
            <button
              type="button"
              onClick={() => onCreateProject(createEmptyDocument({ name: 'Untitled project' }))}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-sky-400 px-4 text-sm font-semibold text-neutral-950 hover:bg-sky-300"
            >
              <FilePlus2 className="h-4 w-4" /> New project
            </button>
          </div>
        </div>

        {error && <p role="alert" className="mb-4 rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p>}
        {remoteDeleteError && (
          <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
            <span>{remoteDeleteError} Your project was removed from this device.</span>
            {remoteDeleteTarget && (
              <button
                type="button"
                onClick={() => void deleteRemoteCopy(remoteDeleteTarget)}
                className="min-h-11 rounded border border-amber-300/50 px-3 font-semibold hover:bg-amber-500/20"
              >
                Retry server cleanup
              </button>
            )}
          </div>
        )}
        {projects.length === 0 ? (
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-12 text-center">
            <FolderOpen className="mx-auto mb-3 h-8 w-8 text-neutral-500" />
            <p className="text-sm text-neutral-300">No saved projects yet.</p>
            <p className="mt-1 text-xs text-neutral-500">Upload a poster or make a new project to get started.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <article key={project.id} className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900">
                <button
                  type="button"
                  onClick={() => void open(project)}
                  disabled={busy}
                  className="block w-full text-left"
                  aria-label={`Open ${project.name}`}
                >
                  <div className="flex aspect-[4/3] items-center justify-center overflow-hidden bg-neutral-950">
                    {thumbnails[project.id]
                      ? <img src={thumbnails[project.id]} alt="" className="h-full w-full object-contain" />
                      : <ImageOff className="h-8 w-8 text-neutral-600" />}
                  </div>
                </button>
                <div className="space-y-3 p-3">
                  <div className="flex min-w-0 items-center gap-2">
                    {editingId === project.id ? (
                      <input
                        autoFocus
                        value={editingName}
                        onChange={(event) => setEditingName(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') void rename(project);
                          if (event.key === 'Escape') setEditingId(null);
                        }}
                        aria-label="Project name"
                        className="min-h-10 min-w-0 flex-1 rounded border border-sky-500 bg-neutral-950 px-2 text-sm outline-none"
                      />
                    ) : (
                      <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">{project.name}</h2>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(project.id);
                        setEditingName(project.name);
                      }}
                      aria-label={`Rename ${project.name}`}
                      className="min-h-10 min-w-10 rounded border border-neutral-800 text-neutral-300 hover:bg-neutral-800"
                    >
                      <Pencil className="mx-auto h-4 w-4" />
                    </button>
                  </div>
                  <p className="text-[11px] text-neutral-500">Saved {new Date(project.updatedAt).toLocaleString()}</p>
                  <div className="grid grid-cols-3 gap-2">
                    <button type="button" onClick={() => void open(project)} disabled={busy} className="min-h-11 rounded bg-sky-500 px-2 text-xs font-semibold text-neutral-950 hover:bg-sky-400 disabled:opacity-50">Open</button>
                    <button type="button" onClick={() => void duplicate(project)} disabled={busy} className="inline-flex min-h-11 items-center justify-center gap-1 rounded border border-neutral-700 px-2 text-xs hover:bg-neutral-800 disabled:opacity-50">
                      <Copy className="h-3.5 w-3.5" /> Duplicate
                    </button>
                    <button type="button" onClick={() => setDeleteTarget(project)} disabled={busy} className="inline-flex min-h-11 items-center justify-center gap-1 rounded border border-neutral-700 px-2 text-xs text-rose-200 hover:bg-rose-950 disabled:opacity-50">
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </button>
                  </div>
                  {editingId === project.id && (
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => setEditingId(null)} className="min-h-10 rounded px-3 text-xs text-neutral-300">Cancel</button>
                      <button type="button" onClick={() => void rename(project)} className="min-h-10 rounded bg-sky-500 px-3 text-xs font-semibold text-neutral-950">Save name</button>
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {deleteTarget && (
        <div ref={deleteDialogRef} className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="alertdialog" aria-modal="true" aria-labelledby="delete-project-title" tabIndex={-1}>
          <div className="w-full max-w-md rounded-xl border border-neutral-700 bg-neutral-900 p-5 shadow-2xl">
            <h2 id="delete-project-title" className="text-base font-semibold">Delete “{deleteTarget.name}”?</h2>
            <p className="mt-2 text-sm leading-6 text-neutral-400">This permanently removes the editable document, generated assets, saved versions, and the uploaded original if no other project uses it.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setDeleteTarget(null)} disabled={busy} className="min-h-11 rounded border border-neutral-700 px-4 text-sm">Cancel</button>
              <button type="button" onClick={() => void remove()} disabled={busy} className="min-h-11 rounded bg-rose-600 px-4 text-sm font-semibold hover:bg-rose-500 disabled:opacity-50">Delete project and assets</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};
