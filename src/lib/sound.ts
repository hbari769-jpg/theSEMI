/**
 * Lightweight local Web Audio synthesizer for Aestific UI sound cues.
 * Uses zero external dependencies or network audio files.
 * When sound is 'off', strictly 100% no-op.
 */

let sharedAudioContext: AudioContext | null = null;

function getSafeAudioContext(): AudioContext | null {
  try {
    if (typeof window === 'undefined') return null;
    if (!sharedAudioContext) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        sharedAudioContext = new AudioCtx();
      }
    }
    if (sharedAudioContext && sharedAudioContext.state === 'suspended') {
      sharedAudioContext.resume().catch(() => {});
    }
    return sharedAudioContext;
  } catch {
    return null;
  }
}

export type SoundCue = 'send' | 'receive' | 'complete' | 'test';

export function playUiSound(cue: SoundCue, enabled: boolean): void {
  // Sound Off must guarantee that optional UI sounds do not play
  if (!enabled) return;

  try {
    const ctx = getSafeAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (cue === 'send') {
      // Soft, subtle, pleasant low-volume pop (warm sine)
      osc.type = 'sine';
      osc.frequency.setValueAtTime(460, now);
      osc.frequency.exponentialRampToValueAtTime(260, now + 0.055);
      gain.gain.setValueAtTime(0.035, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.055);
      osc.start(now);
      osc.stop(now + 0.06);
    } else if (cue === 'complete' || cue === 'receive') {
      // Subtle two-tone arrival chime (D5 -> A5, gentle)
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, now);
      osc.frequency.setValueAtTime(880, now + 0.06);
      gain.gain.setValueAtTime(0.03, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
      osc.start(now);
      osc.stop(now + 0.15);
    } else if (cue === 'test') {
      // Affirmative test chime (C5 -> G5)
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.setValueAtTime(783.99, now + 0.07);
      gain.gain.setValueAtTime(0.045, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
      osc.start(now);
      osc.stop(now + 0.19);
    }
  } catch {
    // Ignore audio permission or playback errors safely
  }
}
