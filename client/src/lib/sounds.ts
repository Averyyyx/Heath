export type NexoSoundPreferences = {
  enabled: boolean;
  messages: boolean;
  calls: boolean;
  devices: boolean;
  volume: number;
};

const STORAGE_KEY = 'nexo.sound-preferences.v1';
const DEFAULTS: NexoSoundPreferences = {
  enabled: true,
  messages: true,
  calls: true,
  devices: true,
  volume: 0.32
};

let audioContext: AudioContext | null = null;

export function getNexoSoundPreferences(): NexoSoundPreferences {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return {
      enabled: saved.enabled !== false,
      messages: saved.messages !== false,
      calls: saved.calls !== false,
      devices: saved.devices !== false,
      volume: Math.max(0, Math.min(1, Number.isFinite(Number(saved.volume)) ? Number(saved.volume) : DEFAULTS.volume))
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveNexoSoundPreferences(next: NexoSoundPreferences): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* Storage may be unavailable */ }
}

function context(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioContextConstructor = window.AudioContext;
  if (!AudioContextConstructor) return null;
  if (!audioContext || audioContext.state === 'closed') audioContext = new AudioContextConstructor();
  if (audioContext.state === 'suspended') void audioContext.resume().catch(() => {});
  return audioContext;
}

type SoundKind = 'message' | 'mic-on' | 'mic-off' | 'headphones-on' | 'headphones-off' | 'ring';

const patterns: Record<SoundKind, Array<{ frequency: number; at: number; duration: number; gain: number }>> = {
  message: [
    { frequency: 784, at: 0, duration: 0.12, gain: 0.65 },
    { frequency: 988, at: 0.085, duration: 0.16, gain: 0.42 }
  ],
  'mic-on': [
    { frequency: 523, at: 0, duration: 0.11, gain: 0.52 },
    { frequency: 659, at: 0.08, duration: 0.14, gain: 0.58 }
  ],
  'mic-off': [
    { frequency: 659, at: 0, duration: 0.11, gain: 0.48 },
    { frequency: 440, at: 0.08, duration: 0.15, gain: 0.52 }
  ],
  'headphones-on': [
    { frequency: 587, at: 0, duration: 0.12, gain: 0.52 },
    { frequency: 784, at: 0.1, duration: 0.2, gain: 0.55 }
  ],
  'headphones-off': [
    { frequency: 784, at: 0, duration: 0.12, gain: 0.48 },
    { frequency: 587, at: 0.1, duration: 0.2, gain: 0.52 }
  ],
  ring: [
    { frequency: 659, at: 0, duration: 0.22, gain: 0.58 },
    { frequency: 784, at: 0.18, duration: 0.22, gain: 0.58 },
    { frequency: 988, at: 0.38, duration: 0.28, gain: 0.5 }
  ]
};

export function playNexoSound(kind: SoundKind): void {
  const preferences = getNexoSoundPreferences();
  if (!preferences.enabled || preferences.volume <= 0) return;
  if (kind === 'message' && !preferences.messages) return;
  if (kind === 'ring' && !preferences.calls) return;
  if (kind !== 'message' && kind !== 'ring' && !preferences.devices) return;
  const audio = context();
  if (!audio) return;
  const now = audio.currentTime;
  for (const note of patterns[kind]) {
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(note.frequency, now + note.at);
    gain.gain.setValueAtTime(0.0001, now + note.at);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, preferences.volume * note.gain), now + note.at + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + note.at + note.duration);
    oscillator.connect(gain);
    gain.connect(audio.destination);
    oscillator.start(now + note.at);
    oscillator.stop(now + note.at + note.duration + 0.02);
  }
}

export function startNexoRingtone(): () => void {
  const preferences = getNexoSoundPreferences();
  if (!preferences.enabled || !preferences.calls) return () => {};
  playNexoSound('ring');
  const timer = window.setInterval(() => playNexoSound('ring'), 1850);
  return () => window.clearInterval(timer);
}
