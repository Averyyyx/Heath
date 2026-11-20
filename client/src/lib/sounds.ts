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
  volume: 0.28
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
type SoundNote = { frequency: number; at: number; duration: number; gain: number; wave?: OscillatorType };

const patterns: Record<SoundKind, SoundNote[]> = {
  message: [
    { frequency: 740, at: 0, duration: 0.12, gain: 0.38 },
    { frequency: 880, at: 0.11, duration: 0.17, gain: 0.3 }
  ],
  'mic-on': [
    { frequency: 523, at: 0, duration: 0.1, gain: 0.35 },
    { frequency: 659, at: 0.09, duration: 0.13, gain: 0.38 }
  ],
  'mic-off': [
    { frequency: 659, at: 0, duration: 0.1, gain: 0.32 },
    { frequency: 523, at: 0.09, duration: 0.13, gain: 0.34 }
  ],
  'headphones-on': [
    { frequency: 587, at: 0, duration: 0.11, gain: 0.34 },
    { frequency: 784, at: 0.1, duration: 0.16, gain: 0.36 }
  ],
  'headphones-off': [
    { frequency: 784, at: 0, duration: 0.11, gain: 0.3 },
    { frequency: 587, at: 0.1, duration: 0.16, gain: 0.32 }
  ],
  // Original Nexo ringtone: a soft, repeating major-key chime rather than three harsh test beeps.
  ring: [
    { frequency: 523.25, at: 0, duration: 0.28, gain: 0.25, wave: 'triangle' },
    { frequency: 659.25, at: 0.17, duration: 0.28, gain: 0.24, wave: 'triangle' },
    { frequency: 783.99, at: 0.34, duration: 0.36, gain: 0.23, wave: 'triangle' },
    { frequency: 659.25, at: 0.62, duration: 0.3, gain: 0.22, wave: 'triangle' },
    { frequency: 587.33, at: 1.08, duration: 0.28, gain: 0.22, wave: 'triangle' },
    { frequency: 698.46, at: 1.25, duration: 0.28, gain: 0.23, wave: 'triangle' },
    { frequency: 880, at: 1.42, duration: 0.38, gain: 0.22, wave: 'triangle' },
    { frequency: 698.46, at: 1.72, duration: 0.3, gain: 0.2, wave: 'triangle' }
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
    oscillator.type = note.wave || 'sine';
    oscillator.frequency.setValueAtTime(note.frequency, now + note.at);
    gain.gain.setValueAtTime(0.0001, now + note.at);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, preferences.volume * note.gain), now + note.at + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + note.at + note.duration);
    oscillator.connect(gain);
    gain.connect(audio.destination);
    oscillator.start(now + note.at);
    oscillator.stop(now + note.at + note.duration + 0.03);
  }
}

export function startNexoRingtone(): () => void {
  const preferences = getNexoSoundPreferences();
  if (!preferences.enabled || !preferences.calls) return () => {};
  playNexoSound('ring');
  const timer = window.setInterval(() => playNexoSound('ring'), 3000);
  return () => window.clearInterval(timer);
}
