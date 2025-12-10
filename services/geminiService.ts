import { GoogleGenAI } from "@google/genai";
import { Video } from "../types";

// Initialize Gemini
// Note: In a real app, ensure process.env.API_KEY is available.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || 'dummy_key' });

export const generateVideoSummary = async (video: Video): Promise<string> => {
  try {
    if (!process.env.API_KEY) {
      return `[Demo Mode] AI Analysis for "${video.title}": This is a stunning visual representation of ${video.tags.join(', ')}. The visual fidelity suggests high-end generative models.`;
    }

    const model = 'gemini-2.5-flash';
    const prompt = `Provide a short, punchy, cyberpunk-style 50-word summary for a video titled "${video.title}" with tags: ${video.tags.join(', ')}. Description: ${video.description}. Make it sound like a high-tech analysis.`;

    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
    });

    return response.text || "Analysis failed.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "System Offline: Unable to connect to Neural Net.";
  }
};
