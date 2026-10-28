import { useState } from 'react';
import { ArrowLeft, FilePlus2, Info } from 'lucide-react';
import {
  BEGINNER_DESIGN_PRESETS,
  createBeginnerDesignDocument,
  type BeginnerDesignPresetId,
} from '../lib/beginnerDesign';
import type { DesignDocument } from '../core/schema/designDocument';

interface BeginnerStartScreenProps {
  onBack: () => void;
  onCreate: (document: DesignDocument) => void;
}

export function BeginnerStartScreen({ onBack, onCreate }: BeginnerStartScreenProps) {
  const [selectedPreset, setSelectedPreset] = useState<BeginnerDesignPresetId | null>(null);
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customWidth, setCustomWidth] = useState('');
  const [customHeight, setCustomHeight] = useState('');
  const [error, setError] = useState<string | null>(null);

  const createDesign = () => {
    if (!selectedPreset) {
      setError('Choose what you are making to continue.');
      return;
    }
    try {
      const width = customWidth.trim() ? Number(customWidth) : undefined;
      const height = customHeight.trim() ? Number(customHeight) : undefined;
      if ((width === undefined) !== (height === undefined)) {
        throw new Error('Enter both a custom width and height, or leave both blank.');
      }
      onCreate(createBeginnerDesignDocument(selectedPreset, {
        name: customName,
        width,
        height,
      }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create this design.');
    }
  };

  const groups = [...new Set(BEGINNER_DESIGN_PRESETS.map((preset) => preset.group))];

  return (
    <main className="min-h-screen overflow-y-auto bg-neutral-950 px-4 py-8 text-neutral-100 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-neutral-700 px-3 text-sm text-neutral-300 transition hover:bg-neutral-900 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        <header className="mx-auto mb-8 mt-8 max-w-2xl text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-sky-400">A simple place to start</p>
          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">What are you making?</h1>
          <p className="mt-3 text-sm leading-6 text-neutral-400">
            Pick a size or an idea. We’ll open a blank page at the right size, and you can add your own text and images.
          </p>
        </header>

        <div className="space-y-7">
          {groups.map((group) => (
            <section key={group} aria-label={group}>
              <h2 className="mb-3 text-sm font-semibold text-neutral-200">{group}</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {BEGINNER_DESIGN_PRESETS.filter((preset) => preset.group === group).map((preset) => {
                  const selected = selectedPreset === preset.id;
                  const portrait = preset.height > preset.width;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      title={`${preset.label}, ${preset.width} by ${preset.height} pixels`}
                      aria-pressed={selected}
                      onClick={() => {
                        setSelectedPreset(preset.id);
                        setError(null);
                      }}
                      className={`flex min-h-28 items-center gap-3 rounded-xl border p-3 text-left transition ${
                        selected
                          ? 'border-sky-400 bg-sky-400/10 ring-1 ring-sky-400'
                          : 'border-neutral-800 bg-neutral-900 hover:border-neutral-600 hover:bg-neutral-900/80'
                      }`}
                    >
                      <span className="flex h-16 w-12 shrink-0 items-center justify-center rounded bg-neutral-800" aria-hidden="true">
                        <span className={`rounded-sm border ${selected ? 'border-sky-300 bg-sky-300/10' : 'border-neutral-500'} ${
                          portrait ? 'h-12 w-8' : 'h-8 w-12'
                        }`} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium leading-5 text-neutral-100">{preset.label}</span>
                        <span className="mt-1 block text-xs text-neutral-500">{preset.width} × {preset.height} px</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        <div className="mx-auto mt-7 max-w-2xl">
          <button
            type="button"
            onClick={() => setShowMoreOptions((shown) => !shown)}
            aria-expanded={showMoreOptions}
            className="min-h-11 text-sm font-medium text-sky-300 underline decoration-sky-300/40 underline-offset-4 hover:text-sky-200"
          >
            {showMoreOptions ? 'Show fewer options' : 'Show more options'}
          </button>

          {showMoreOptions && (
            <div className="mt-3 grid gap-4 rounded-xl border border-neutral-800 bg-neutral-900 p-4 sm:grid-cols-2">
              <label className="text-sm text-neutral-300 sm:col-span-2">
                Design name
                <input
                  value={customName}
                  onChange={(event) => setCustomName(event.target.value)}
                  maxLength={100}
                  placeholder="For example, Summer food festival"
                  className="mt-2 min-h-11 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 text-sm text-white outline-none focus:border-sky-400"
                />
              </label>
              <label className="text-sm text-neutral-300">
                Custom width (pixels)
                <input
                  type="number"
                  min="1"
                  max="30000"
                  step="1"
                  inputMode="numeric"
                  value={customWidth}
                  onChange={(event) => setCustomWidth(event.target.value)}
                  placeholder={selectedPreset ? String(BEGINNER_DESIGN_PRESETS.find((preset) => preset.id === selectedPreset)?.width) : 'Choose a design size first'}
                  className="mt-2 min-h-11 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 text-sm text-white outline-none focus:border-sky-400"
                />
              </label>
              <label className="text-sm text-neutral-300">
                Custom height (pixels)
                <input
                  type="number"
                  min="1"
                  max="30000"
                  step="1"
                  inputMode="numeric"
                  value={customHeight}
                  onChange={(event) => setCustomHeight(event.target.value)}
                  placeholder={selectedPreset ? String(BEGINNER_DESIGN_PRESETS.find((preset) => preset.id === selectedPreset)?.height) : 'Choose a design size first'}
                  className="mt-2 min-h-11 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 text-sm text-white outline-none focus:border-sky-400"
                />
              </label>
              <p className="flex items-start gap-2 text-xs leading-5 text-neutral-500 sm:col-span-2">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                Leave both size fields blank to use the size shown on your selected design.
              </p>
            </div>
          )}

          {error && <p role="alert" className="mt-4 rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p>}
          <div className="mt-6 flex flex-col items-center gap-3">
            <button
              type="button"
              onClick={createDesign}
              disabled={!selectedPreset}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-sky-400 px-6 text-sm font-semibold text-neutral-950 transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <FilePlus2 className="h-4 w-4" /> Create blank design
            </button>
            <p className="text-center text-xs text-neutral-500">Your page starts blank. Everything you add stays editable.</p>
          </div>
        </div>
      </div>
    </main>
  );
}
