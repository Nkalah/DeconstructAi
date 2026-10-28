import React, { useEffect, useState } from 'react';
import { Clock3, RotateCcw, X } from 'lucide-react';
import { getProjectVersions, loadProjectVersion, type ProjectVersion } from '../lib/projectStore';
import type { DesignDocument } from '../core/schema/designDocument';
import { useDialogAccessibility } from '../hooks/useDialogAccessibility';

interface ProjectVersionsDialogProps {
  projectId: string | null;
  onClose: () => void;
  onRestore: (document: DesignDocument) => void;
}

export const ProjectVersionsDialog: React.FC<ProjectVersionsDialogProps> = ({ projectId, onClose, onRestore }) => {
  const dialogRef = useDialogAccessibility<HTMLDivElement>(projectId !== null, onClose);
  const [versions, setVersions] = useState<ProjectVersion[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    if (!projectId) return;
    getProjectVersions(projectId)
      .then((items) => { if (mounted) setVersions(items); })
      .catch((cause: unknown) => { if (mounted) setError(cause instanceof Error ? cause.message : 'Could not load saved versions.'); });
    return () => { mounted = false; };
  }, [projectId]);

  if (!projectId) return null;

  const restore = async (version: ProjectVersion) => {
    try {
      const document = await loadProjectVersion(version.id);
      if (!document) throw new Error('This saved version is missing.');
      onRestore(document);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not restore this version.');
    }
  };

  return (
    <div ref={dialogRef} className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="versions-title" tabIndex={-1}>
      <section className="max-h-[85vh] w-full max-w-lg overflow-hidden rounded-xl border border-neutral-700 bg-neutral-900 shadow-2xl">
        <header className="flex items-center justify-between border-b border-neutral-800 p-4">
          <div className="flex items-center gap-2">
            <Clock3 className="h-4 w-4 text-sky-300" />
            <h2 id="versions-title" className="text-sm font-semibold">Version history</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close version history" className="min-h-10 min-w-10 rounded hover:bg-neutral-800"><X className="mx-auto h-4 w-4" /></button>
        </header>
        {error && <p role="alert" className="m-4 rounded border border-rose-500/30 p-3 text-xs text-rose-200">{error}</p>}
        <div className="max-h-[65vh] space-y-2 overflow-y-auto p-4">
          {versions.length === 0 && !error && <p className="py-8 text-center text-sm text-neutral-400">No saved versions yet. Use Save to create a version.</p>}
          {versions.map((version) => (
            <div key={version.id} className="flex items-center justify-between gap-3 rounded-lg border border-neutral-800 p-3">
              <div>
                <p className="text-sm text-neutral-100">{version.name}</p>
                <p className="mt-1 text-xs text-neutral-500">{new Date(version.createdAt).toLocaleString()}</p>
              </div>
              <button type="button" onClick={() => void restore(version)} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded border border-neutral-700 px-3 text-xs hover:bg-neutral-800">
                <RotateCcw className="h-3.5 w-3.5" /> Restore
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
