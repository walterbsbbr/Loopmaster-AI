// Groq API Service - Free/Cheaper alternative to Google AI
// Get your API key at: https://console.groq.com/keys

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const STORAGE_KEY = 'loopmaster_groq_api_key';

// Get API key from localStorage (user-provided)
export const getApiKey = (): string | null => {
    return localStorage.getItem(STORAGE_KEY);
};

// Save API key to localStorage
export const setApiKey = (key: string): void => {
    localStorage.setItem(STORAGE_KEY, key);
};

// Remove API key
export const clearApiKey = (): void => {
    localStorage.removeItem(STORAGE_KEY);
};

// Check if API key is configured
export const hasApiKey = (): boolean => {
    const key = getApiKey();
    return !!key && key.length > 10;
};

export const generateSmartFilename = async (
  filename: string,
  duration: number,
  loopCount: number
): Promise<string> => {
    try {
        const apiKey = getApiKey();
        if (!apiKey) {
            console.log('Groq API key not configured, using original filename');
            return filename;
        }

        const prompt = `
        I have an audio loop file.
        Original Name: "${filename}"
        Duration: ${duration.toFixed(2)} seconds.

        Suggest a professional, tidy filename for a sample pack library.
        It should include BPM (estimate based on duration if obvious, otherwise omit), and a descriptive tag.
        Format: Instrument_Mood_BPM_Key(optional).wav

        Return ONLY the filename string. No markdown, no quotes, no explanation.
        `;

        const response = await fetch(GROQ_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'llama-3.1-8b-instant',
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                max_tokens: 100,
                temperature: 0.7
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Groq API error:', response.status, errorText);
            if (response.status === 401) {
                throw new Error('API key inválida');
            }
            return filename;
        }

        const data = await response.json();
        const result = data.choices?.[0]?.message?.content?.trim();

        return result || filename;
    } catch (e) {
        console.error("Groq naming failed", e);
        throw e;
    }
};
