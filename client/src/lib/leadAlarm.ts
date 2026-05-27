export type LeadAlarmId = 'siren' | 'rapid' | 'pulse' | 'warble';

export type LeadAlarmOption = {
  id: LeadAlarmId;
  name: string;
  description: string;
};

export const LEAD_ALARM_OPTIONS: LeadAlarmOption[] = [
  { id: 'siren', name: 'Emergency Siren', description: 'Alternating high-low alarm tones.' },
  { id: 'rapid', name: 'Rapid Alert', description: 'Fast repeating square-wave beeps.' },
  { id: 'pulse', name: 'Deep Pulse', description: 'Low, heavy pulsing alarm.' },
  { id: 'warble', name: 'Warble', description: 'Rising urgent oscillating tone.' },
];

const STORAGE_KEY = 'victorysync_lead_alarm_ids';
const DEFAULT_ALARMS: LeadAlarmId[] = ['siren', 'rapid'];

let audioContext: AudioContext | null = null;

function isLeadAlarmId(value: string): value is LeadAlarmId {
  return LEAD_ALARM_OPTIONS.some((option) => option.id === value);
}

export function getSelectedLeadAlarmIds(): LeadAlarmId[] {
  if (typeof window === 'undefined') return DEFAULT_ALARMS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(parsed)) return DEFAULT_ALARMS;
    const ids = parsed.filter((item): item is LeadAlarmId => typeof item === 'string' && isLeadAlarmId(item));
    return ids.length ? ids : DEFAULT_ALARMS;
  } catch {
    return DEFAULT_ALARMS;
  }
}

export function setSelectedLeadAlarmIds(ids: string[]) {
  if (typeof window === 'undefined') return;
  const clean = ids.filter((item): item is LeadAlarmId => isLeadAlarmId(item));
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(clean.length ? clean : DEFAULT_ALARMS));
}

function scheduleTone(
  ctx: AudioContext,
  frequency: number,
  start: number,
  duration: number,
  type: OscillatorType,
  volume = 0.9,
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.frequency.value = frequency;
  osc.type = type;
  gain.gain.setValueAtTime(0.001, ctx.currentTime + start);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.001, volume), ctx.currentTime + start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + duration);
  osc.start(ctx.currentTime + start);
  osc.stop(ctx.currentTime + start + duration + 0.04);
}

function scheduleAlarm(ctx: AudioContext, id: LeadAlarmId, offset: number) {
  if (id === 'rapid') {
    scheduleTone(ctx, 980, offset, 0.1, 'square', 0.95);
    scheduleTone(ctx, 1420, offset + 0.12, 0.1, 'square', 0.95);
    scheduleTone(ctx, 980, offset + 0.24, 0.1, 'square', 0.95);
    scheduleTone(ctx, 1420, offset + 0.36, 0.18, 'square', 0.95);
    return;
  }

  if (id === 'pulse') {
    scheduleTone(ctx, 330, offset, 0.2, 'sawtooth', 1);
    scheduleTone(ctx, 330, offset + 0.28, 0.2, 'sawtooth', 1);
    scheduleTone(ctx, 430, offset + 0.56, 0.22, 'sawtooth', 1);
    return;
  }

  if (id === 'warble') {
    scheduleTone(ctx, 650, offset, 0.13, 'triangle', 0.9);
    scheduleTone(ctx, 820, offset + 0.12, 0.13, 'triangle', 0.9);
    scheduleTone(ctx, 1040, offset + 0.24, 0.13, 'triangle', 0.9);
    scheduleTone(ctx, 1320, offset + 0.36, 0.22, 'triangle', 0.95);
    return;
  }

  scheduleTone(ctx, 680, offset, 0.16, 'square', 1);
  scheduleTone(ctx, 1550, offset + 0.18, 0.18, 'square', 1);
  scheduleTone(ctx, 680, offset + 0.38, 0.16, 'square', 1);
  scheduleTone(ctx, 1550, offset + 0.58, 0.24, 'square', 1);
}

export async function playLeadAlarmSequence(ids = getSelectedLeadAlarmIds()): Promise<boolean> {
  try {
    const AudioCtor = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtor) return false;
    const ctx = audioContext || new AudioCtor();
    audioContext = ctx;
    if (ctx.state === 'suspended') await ctx.resume();
    if (ctx.state !== 'running') return false;

    const selected = ids.length ? ids : DEFAULT_ALARMS;
    selected.slice(0, 4).forEach((id, index) => scheduleAlarm(ctx, id, index * 0.16));
    return true;
  } catch {
    return false;
  }
}
