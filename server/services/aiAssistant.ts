import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import {
  AssistantDocumentSummarySchema,
  AssistantOperationSchema,
  validateAssistantOperations,
  type AssistantDocumentSummary,
  type AssistantOperation
} from '../../src/lib/assistantOperations.js';
import { generateWithRetry } from './geminiRetry.js';

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
  httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
});
const ASSISTANT_MODEL = process.env.GEMINI_ASSISTANT_MODEL || 'gemini-3.8-flash';

const assistantResponseSchema = z.object({
  message: z.string().min(1).max(1000),
  operations: z.array(AssistantOperationSchema).max(50)
}).strict();

export class AssistantUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssistantUnavailableError';
  }
}

export async function processAssistantCommand(
  instruction: string,
  inputSummary: unknown,
  previewImage?: { mimeType: string; data: string }
): Promise<{ message: string; operations: AssistantOperation[] }> {
  const summary = AssistantDocumentSummarySchema.parse(inputSummary);
  if (!process.env.GEMINI_API_KEY?.trim()) {
    throw new AssistantUnavailableError('AI editing is unavailable because no AI provider is configured. Manual editing is still available.');
  }

  const systemInstruction = `You are the in-editor assistant for an editable poster design application.
Edit only the structured document described below. Never regenerate or return a flat poster image.
Return JSON with exactly: {"message":"short explanation","operations":[...]}.
Use only these operations:
- {"op":"updateLayer","layerId":"id","updates":{"fontFamily":"...","fontSize":number,"fontWeight":"...","fill":"#hex",...}}
- {"op":"createLayer","layer":<complete valid text or shape DesignLayer object>}
- {"op":"deleteLayer","layerId":"id"}
- {"op":"moveLayer","layerId":"id","x":number,"y":number}
- {"op":"replaceText","layerId":"text-id","text":"..."}
- {"op":"reorder","layerId":"id","position":zero-based-integer}
- {"op":"groupLayers","layerIds":["id1","id2"],"name":"..."}
- {"op":"resizeCanvas","width":number,"height":number,"unit":"px|pt|mm|in"}
- {"op":"translateText","layerId":"text-id","translatedText":"..."}
Do not invent layer ids. Only use ids in the document summary. Never update or delete locked layers.
For global wording changes, make one replaceText operation per affected text layer. For a phone/email/URL bulk replacement, preserve all other text exactly.
For visual requests, make the smallest set of concrete structured edits. Service headings are text layers whose names/text identify them as services.
For better readability, prefer improving contrast and modestly increasing text size without obscuring other content.
For "suitable for Instagram", use a 1080x1080 px canvas. For an A4 print version, use 210x297 mm and scale/reflow the existing editable layers while preserving their relative layout.
If the request cannot be safely represented by these operations, return an empty operations array and explain why. Do not claim changes were applied; this is only a proposal.

Current document summary (text layers also include font size, font family, and fill):
${JSON.stringify(summary)}`;

  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
  if (previewImage) parts.push({ inlineData: previewImage });
  parts.push({ text: instruction });

  let response;
  try {
    response = await generateWithRetry(ai, {
      contents: { parts },
      config: {
        systemInstruction,
        responseMimeType: 'application/json'
      }
    }, { models: [ASSISTANT_MODEL] });
  } catch (error) {
    console.error('AI document edit proposal failed:', error);
    throw new AssistantUnavailableError(
      'The AI provider could not prepare an edit. Your document was not changed; please try again or continue editing manually.'
    );
  }
  if (!response.text) throw new Error('The AI provider returned an empty response.');
  let responseJson: unknown;
  try {
    responseJson = JSON.parse(response.text);
  } catch {
    throw new Error('The AI provider returned malformed JSON.');
  }
  const parsed = assistantResponseSchema.parse(responseJson);
  const operations = parsed.operations.length
    ? validateAssistantOperations(parsed.operations, summary)
    : [];
  return { message: parsed.message, operations };
}

export function validateAssistantRequestSummary(input: unknown): AssistantDocumentSummary {
  return AssistantDocumentSummarySchema.parse(input);
}
