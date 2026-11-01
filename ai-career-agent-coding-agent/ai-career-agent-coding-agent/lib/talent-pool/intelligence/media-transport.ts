import type { AssessmentRoute } from '@/lib/talent-pool/constants';

/**
 * Provider-replaceable Media Transport architecture (§8):
 * Separates conversational AI intelligence from microphone capture, audio chunking,
 * speech-to-text (STT), text-to-speech (TTS), camera preview, and consented recording.
 * Never assumes an LLM text endpoint provides native real-time voice transport.
 */

export type SttProviderId = 'browser-web-speech' | 'openai-whisper-api' | 'manual-written-fallback';
export type TtsProviderId = 'browser-speech-synthesis' | 'captions-only-fallback';

export interface MediaTransportCapabilities {
  selectedRoute: AssessmentRoute;
  microphoneSupported: boolean;
  cameraSupported: boolean;
  recordingAuthorized: boolean;
  sttProvider: SttProviderId;
  ttsProvider: TtsProviderId;
  gracefulWrittenFallbackAvailable: true;
}

export interface AudioTranscriptionChunk {
  sessionId: string;
  questionId: string;
  mimeType: string;
  durationMs: number;
  audioBytes: Buffer;
}

export interface SttTranscriptionResult {
  transcript: string;
  confidence: number;
  provider: SttProviderId;
  degradedAudioDetected: boolean;
  fallbackToWrittenSuggested: boolean;
}

export interface SpeechToTextAdapter {
  readonly id: SttProviderId;
  isAvailable(): boolean;
  transcribe(chunk: AudioTranscriptionChunk): Promise<SttTranscriptionResult>;
}

export class OpenAIWhisperSttAdapter implements SpeechToTextAdapter {
  readonly id: SttProviderId = 'openai-whisper-api';

  constructor(private readonly apiKey: string | undefined = process.env.OPENAI_API_KEY) {}

  isAvailable(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 10);
  }

  async transcribe(chunk: AudioTranscriptionChunk): Promise<SttTranscriptionResult> {
    if (!this.isAvailable()) {
      return {
        transcript: '',
        confidence: 0,
        provider: 'manual-written-fallback',
        degradedAudioDetected: true,
        fallbackToWrittenSuggested: true,
      };
    }

    const form = new FormData();
    const blob = new Blob([new Uint8Array(chunk.audioBytes)], {
      type: chunk.mimeType || 'audio/webm',
    });
    form.append('file', blob, 'segment.webm');
    form.append('model', 'whisper-1');
    form.append('response_format', 'verbose_json');

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: form,
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) {
      return {
        transcript: '',
        confidence: 0,
        provider: 'manual-written-fallback',
        degradedAudioDetected: true,
        fallbackToWrittenSuggested: true,
      };
    }

    const json = (await res.json()) as { text?: string };
    const text = (json.text ?? '').trim();
    return {
      transcript: text,
      confidence: text.length > 0 ? 0.88 : 0.2,
      provider: this.id,
      degradedAudioDetected: text.length === 0,
      fallbackToWrittenSuggested: text.length === 0,
    };
  }
}

export function resolveMediaTransportPlan(params: {
  route: AssessmentRoute;
  audioVideoConsentGranted: boolean;
  recordingConsentGranted: boolean;
  serverSttConfigured: boolean;
}): MediaTransportCapabilities {
  if (params.route === 'ACCESSIBLE_WRITTEN' || !params.audioVideoConsentGranted) {
    return {
      selectedRoute: 'ACCESSIBLE_WRITTEN',
      microphoneSupported: false,
      cameraSupported: false,
      recordingAuthorized: false,
      sttProvider: 'manual-written-fallback',
      ttsProvider: 'captions-only-fallback',
      gracefulWrittenFallbackAvailable: true,
    };
  }

  return {
    selectedRoute: params.route,
    microphoneSupported: true,
    cameraSupported: params.route === 'VIDEO_VOICE',
    // Explicit consent gate: never record unless BOTH route uses media AND INTERVIEW_RECORDING consent is granted
    recordingAuthorized: Boolean(params.audioVideoConsentGranted && params.recordingConsentGranted),
    sttProvider: params.serverSttConfigured ? 'openai-whisper-api' : 'browser-web-speech',
    ttsProvider: 'browser-speech-synthesis',
    gracefulWrittenFallbackAvailable: true,
  };
}
