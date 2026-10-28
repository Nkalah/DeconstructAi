import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

for (const model of ['gemini-flash-latest', 'gemini-3.8-flash']) {
  try {
    const r = await ai.models.generateContent({ model, contents: 'Reply with the word OK' });
    console.log(model, '=> WORKS:', r.text);
  } catch (e) {
    console.log(model, '=> FAILED:', e.message);
  }
}