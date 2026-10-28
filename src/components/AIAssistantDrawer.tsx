import React, { useMemo, useState } from 'react';
import { AlertTriangle, Bot, CheckCircle2, Loader2, Send, Sparkles, X } from 'lucide-react';
import type { DesignDocument } from '../core/schema/designDocument';
import { useDialogAccessibility } from '../hooks/useDialogAccessibility';
import {
  AssistantOperationSchema,
  applyAssistantOperations,
  summarizeDocumentForAssistant,
  validateAssistantOperations,
  type AssistantOperation
} from '../lib/assistantOperations';

interface Message {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
}

interface PendingProposal {
  message: string;
  operations: AssistantOperation[];
  baseDocumentId: string;
  baseUpdatedAt: string;
}

interface AIAssistantDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  document: DesignDocument;
  onApplyOperations: (document: DesignDocument, summary: string) => void;
}

const QUICK_PROMPTS = [
  'Change the business name to Acme Studio',
  'Replace all phone numbers with +1 555 010 2000',
  'Make the main heading yellow',
  'Move the QR code to the bottom right',
  'Make all service headings the same font',
  'More spacing between sections',
  'Translate to English',
  'Make the text easier to read',
  'Make this suitable for Instagram',
  'Create an A4 print version'
];

function timestamp(): string {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function getSmallPreview(document: DesignDocument): { mimeType: string; data: string } | undefined {
  const uri = document.originalAsset
    ? document.assets[document.originalAsset.assetId]?.uri
    : undefined;
  const match = uri?.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match || match[2].length > 700_000) return undefined;
  return { mimeType: match[1], data: match[2] };
}

function operationLabel(operation: AssistantOperation, document: DesignDocument): string {
  if (operation.op === 'resizeCanvas') return `Resize canvas to ${operation.width} × ${operation.height} ${operation.unit ?? document.canvas.unit}`;
  if (operation.op === 'createLayer') return `Create ${operation.layer.type}: ${operation.layer.name}`;
  if (operation.op === 'groupLayers') return `Group ${operation.layerIds.length} layers`;
  const id = 'layerId' in operation ? operation.layerId : '';
  const layer = document.layers.find((item) => item.id === id);
  const name = layer?.name ?? id;
  switch (operation.op) {
    case 'updateLayer': return `Update ${name}`;
    case 'deleteLayer': return `Delete ${name}`;
    case 'moveLayer': return `Move ${name}`;
    case 'replaceText': return `Replace text in ${name}`;
    case 'translateText': return `Translate ${name}`;
    case 'reorder': return `Reorder ${name}`;
  }
}

function affectedLayerCount(operations: AssistantOperation[], document: DesignDocument): number {
  const ids = new Set<string>();
  for (const operation of operations) {
    if ('layerId' in operation) ids.add(operation.layerId);
    else if (operation.op === 'groupLayers') operation.layerIds.forEach((id) => ids.add(id));
    else if (operation.op === 'createLayer') ids.add(operation.layer.id);
    else if (operation.op === 'resizeCanvas') {
      document.layers.filter((layer) => layer.type !== 'group').forEach((layer) => ids.add(layer.id));
    }
  }
  return ids.size;
}

export const AIAssistantDrawer: React.FC<AIAssistantDrawerProps> = ({
  isOpen,
  onClose,
  document,
  onApplyOperations
}) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'init-msg',
      sender: 'assistant',
      text: 'Describe an edit and I’ll prepare structured changes to the editable layers. Nothing changes until you review and apply the proposal.',
      timestamp: timestamp()
    }
  ]);
  const [inputPrompt, setInputPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [pendingProposal, setPendingProposal] = useState<PendingProposal | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const summary = useMemo(() => summarizeDocumentForAssistant(document), [document]);
  const dialogRef = useDialogAccessibility<HTMLElement>(isOpen, onClose);

  if (!isOpen) return null;

  const handleSendMessage = async (promptToSend?: string) => {
    const instruction = (promptToSend || inputPrompt).trim();
    if (!instruction || isLoading) return;
    setMessages((current) => [...current, {
      id: `user-${crypto.randomUUID()}`,
      sender: 'user',
      text: instruction,
      timestamp: timestamp()
    }]);
    setInputPrompt('');
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instruction,
          documentSummary: summary,
          previewImage: getSmallPreview(document)
        })
      });
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const detail = data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
          ? data.error
          : 'The AI provider is unavailable. Your design has not changed; manual editing is still available.';
        throw new Error(detail);
      }
      if (!data || typeof data !== 'object' || !('operations' in data) || !Array.isArray(data.operations)
        || !('message' in data) || typeof data.message !== 'string') {
        throw new Error('The assistant returned an invalid edit proposal. Your design has not changed.');
      }
      const parsedOperations = data.operations.map((operation) => AssistantOperationSchema.parse(operation));
      const operations = parsedOperations.length
        ? validateAssistantOperations(parsedOperations, summary)
        : [];
      const message = data.message;
      setMessages((current) => [...current, {
        id: `assistant-${crypto.randomUUID()}`,
        sender: 'assistant',
        text: message,
        timestamp: timestamp()
      }]);
      if (operations.length) {
        setPendingProposal({
          message,
          operations,
          baseDocumentId: document.id,
          baseUpdatedAt: document.updatedAt
        });
      } else {
        setPendingProposal(null);
      }
    } catch (error) {
      setPendingProposal(null);
      setErrorMessage(error instanceof Error
        ? error.message
        : 'The AI provider could not prepare an edit. Your design has not changed; manual editing is still available.');
    } finally {
      setIsLoading(false);
    }
  };

  const applyProposal = () => {
    if (!pendingProposal) return;
    if (pendingProposal.baseDocumentId !== document.id || pendingProposal.baseUpdatedAt !== document.updatedAt) {
      setPendingProposal(null);
      setErrorMessage('The design changed after this proposal was created. Ask the assistant again so it can use the latest document.');
      return;
    }
    try {
      const nextDocument = applyAssistantOperations(document, pendingProposal.operations);
      onApplyOperations(nextDocument, pendingProposal.message);
      setPendingProposal(null);
      setErrorMessage(null);
      setMessages((current) => [...current, {
        id: `applied-${crypto.randomUUID()}`,
        sender: 'assistant',
        text: `Applied ${pendingProposal.operations.length} structured edit operation${pendingProposal.operations.length === 1 ? '' : 's'} as one undoable change.`,
        timestamp: timestamp()
      }]);
    } catch (error) {
      setErrorMessage(error instanceof Error
        ? error.message
        : 'The proposal could not be applied. Your design was not changed.');
    }
  };

  const editCount = pendingProposal ? affectedLayerCount(pendingProposal.operations, document) : 0;

  return (
    <aside ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="assistant-title" tabIndex={-1} className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-neutral-800 bg-neutral-900 shadow-2xl">
      <div className="flex items-center justify-between border-b border-neutral-800 bg-neutral-950/80 p-4">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-sky-500/40 bg-sky-500/20 text-sky-400">
            <Bot className="h-4 w-4" aria-hidden="true" />
          </div>
          <div>
            <h2 id="assistant-title" className="text-sm font-semibold text-neutral-100">AI Design Assistant</h2>
            <p className="text-[10px] text-neutral-400">Proposes edits to editable document layers</p>
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="Close AI assistant" className="min-h-11 min-w-11 rounded-md text-neutral-400 transition hover:bg-neutral-800 hover:text-neutral-100">
          <X className="mx-auto h-4 w-4" />
        </button>
      </div>

      <p className="border-b border-neutral-800 bg-neutral-950/50 px-4 py-3 text-xs leading-5 text-neutral-300">
        When you send a request, your instruction and a summary of this design (and sometimes a small preview) are sent to the configured AI provider. Manual editing does not require AI.
      </p>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.map((message) => (
          <div key={message.id} className={`flex flex-col ${message.sender === 'user' ? 'items-end' : 'items-start'}`}>
            <div className={`max-w-[90%] rounded-xl px-3.5 py-2.5 text-xs ${message.sender === 'user'
              ? 'bg-sky-500 font-medium text-neutral-950'
              : 'border border-neutral-700/60 bg-neutral-800/80 text-neutral-200'}`}>
              <p className="leading-relaxed">{message.text}</p>
            </div>
            <span className="mt-1 px-1 text-[9px] text-neutral-500">{message.timestamp}</span>
          </div>
        ))}

        {isLoading && (
          <div role="status" className="flex items-center gap-2 text-xs text-neutral-400">
            <Loader2 className="h-4 w-4 animate-spin text-sky-400" aria-hidden="true" />
            <span>Preparing and validating a structured edit proposal…</span>
          </div>
        )}

        {errorMessage && (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{errorMessage}</span>
          </div>
        )}

        {pendingProposal && (
          <section className="rounded-xl border border-sky-500/40 bg-sky-950/30 p-3" aria-label="Proposed design changes">
            <div className="flex items-center gap-2 text-sm font-semibold text-sky-100">
              <Sparkles className="h-4 w-4 text-sky-300" aria-hidden="true" />
              <span>{editCount ? `Will edit ${editCount} layer${editCount === 1 ? '' : 's'}` : 'Will resize the canvas'}</span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-neutral-300">{pendingProposal.message}</p>
            <ul className="mt-3 max-h-36 space-y-1 overflow-y-auto text-[11px] text-neutral-300">
              {pendingProposal.operations.map((operation, index) => (
                <li key={`${operation.op}-${index}`} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-300" aria-hidden="true" />
                  <span>{operationLabel(operation, document)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={() => setPendingProposal(null)} className="min-h-11 rounded-lg border border-neutral-700 px-4 text-xs text-neutral-200 hover:bg-neutral-800">
                Cancel
              </button>
              <button type="button" onClick={applyProposal} className="min-h-11 rounded-lg bg-sky-500 px-4 text-xs font-semibold text-neutral-950 hover:bg-sky-400">
                Apply changes
              </button>
            </div>
          </section>
        )}
      </div>

      <div className="border-t border-neutral-800 bg-neutral-950/50 p-3">
        <span className="mb-1.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
          <Sparkles className="h-3 w-3 text-amber-400" aria-hidden="true" /> Try a request
        </span>
        <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
          {QUICK_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => handleSendMessage(prompt)}
              disabled={isLoading}
              className="rounded border border-neutral-700/60 bg-neutral-800/80 px-2.5 py-1 text-left text-[11px] text-neutral-300 transition hover:bg-neutral-800 hover:text-neutral-100 disabled:opacity-50"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>

      <form
        className="flex items-center gap-2 border-t border-neutral-800 bg-neutral-950 p-3"
        onSubmit={(event) => {
          event.preventDefault();
          void handleSendMessage();
        }}
      >
        <input
          type="text"
          value={inputPrompt}
          onChange={(event) => setInputPrompt(event.target.value)}
          maxLength={2000}
          placeholder="Describe an edit to your design…"
          aria-label="Describe an edit"
          className="min-h-11 flex-1 rounded-lg border border-neutral-700 bg-neutral-900 px-3 text-xs text-neutral-100 outline-none placeholder:text-neutral-500 focus:border-sky-500"
        />
        <button
          type="submit"
          disabled={isLoading || !inputPrompt.trim()}
          aria-label="Send edit request"
          className="min-h-11 min-w-11 rounded-lg bg-sky-500 text-neutral-950 transition hover:bg-sky-400 disabled:opacity-40"
        >
          <Send className="mx-auto h-4 w-4" aria-hidden="true" />
        </button>
      </form>
    </aside>
  );
};
