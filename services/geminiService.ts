import { GoogleGenAI } from "@google/genai";

export const generateSmartFilename = async (
  filename: string, 
  duration: number, 
  loopCount: number
): Promise<string> => {
    try {
        const apiKey = process.env.API_KEY;
        if (!apiKey) return filename;

        const ai = new GoogleGenAI({ apiKey });
        
        const prompt = `
        I have an audio loop file.
        Original Name: "${filename}"
        Duration: ${duration.toFixed(2)} seconds.
        
        Suggest a professional, tidy filename for a sample pack library.
        It should include BPM (estimate based on duration if obvious, otherwise omit), and a descriptive tag.
        Format: Instrument_Mood_BPM_Key(optional).wav
        
        Return ONLY the filename string. No markdown, no quotes.
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt
        });

        return response.text?.trim() || filename;
    } catch (e) {
        console.error("Gemini naming failed", e);
        return filename;
    }
};
