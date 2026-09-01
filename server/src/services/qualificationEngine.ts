export type QualificationConfig = {
  qualified_threshold?: number;
  positive_signals?: string[];
  negative_signals?: string[];
  booking_signals?: string[];
};

const defaults: Required<QualificationConfig> = {
  qualified_threshold: 60,
  positive_signals: ['google ads', 'ad spend', 'audit', 'book', 'appointment', 'decision maker', 'interested'],
  negative_signals: ['not interested', 'do not call', 'wrong number', 'already have an agency'],
  booking_signals: ['booked', 'appointment confirmed', 'calendar confirmed'],
};

export function scoreQualification(transcript: string, outcome: string, config: QualificationConfig = {}) {
  const merged = { ...defaults, ...config };
  const text = `${outcome || ''} ${transcript || ''}`.toLowerCase();
  let score = outcome.toLowerCase().includes('book') ? 80 : outcome.toLowerCase().includes('interested') ? 65 : 35;
  const positives = merged.positive_signals.filter((signal) => text.includes(signal.toLowerCase()));
  const negatives = merged.negative_signals.filter((signal) => text.includes(signal.toLowerCase()));
  const booking = merged.booking_signals.some((signal) => text.includes(signal.toLowerCase()));
  score += positives.length * 8;
  score -= negatives.length * 25;
  if (booking) score = Math.max(score, 90);
  score = Math.max(0, Math.min(100, score));
  const qualified = score >= merged.qualified_threshold;
  const nextAction = booking ? 'ai_resolved' : qualified ? 'escalate_to_human' : 'ai_resolved';
  const reasons = [
    booking ? 'Booking intent was confirmed.' : null,
    positives.length ? `Positive signals: ${positives.join(', ')}.` : null,
    negatives.length ? `Negative signals: ${negatives.join(', ')}.` : null,
    !positives.length && !negatives.length ? 'Scored primarily from the vendor outcome.' : null,
  ].filter(Boolean);
  return { score, qualified, nextAction: nextAction as 'ai_resolved' | 'escalate_to_human', reasoning: reasons.join(' ') };
}
