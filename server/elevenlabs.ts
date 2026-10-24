import type { Config } from "./config.js";

export type Speak = (text: string) => Promise<ArrayBuffer>;

export function createElevenLabsSpeech(config: Config): Speak | undefined {
  const { apiKey, voiceId, modelId } = config.elevenLabs;
  if (!apiKey) return undefined;
  return async (text) => {
    let response: Response;
    try {
      response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
        {
          method: "POST",
          headers: {
            "xi-api-key": apiKey,
            "Content-Type": "application/json",
            Accept: "audio/mpeg",
          },
          signal: AbortSignal.timeout(30000),
          body: JSON.stringify({ text, model_id: modelId }),
        },
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Cannot reach ElevenLabs: ${reason}. The Pi needs internet for voice.`,
      );
    }
    if (!response.ok) {
      throw new Error(
        `ElevenLabs HTTP ${response.status}: ${(await response.text()).slice(0, 300)}. Check ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID.`,
      );
    }
    return response.arrayBuffer();
  };
}
