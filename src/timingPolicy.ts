export interface TypingTrace {
  readonly id: string;
  /** Milliseconds at which document edits occur. */
  readonly edits: readonly number[];
  readonly sessionEndMs: number;
}

export interface TimingReplay {
  readonly debounceMs: number;
  readonly opportunities: number;
  readonly requests: number;
  readonly returnedBeforeNextEdit: number;
  readonly cancelledByEdit: number;
}

export function replayTypingTraces(traces: readonly TypingTrace[], debounceMs: number, providerLatencyMs = 1000): TimingReplay {
  if (!Number.isFinite(debounceMs) || debounceMs < 0 || !Number.isFinite(providerLatencyMs) || providerLatencyMs < 0) throw new Error("Invalid timing policy.");
  let requests = 0;
  let returned = 0;
  let cancelled = 0;
  let opportunities = 0;
  for (const trace of traces) {
    opportunities += trace.edits.length;
    for (let index = 0; index < trace.edits.length; index += 1) {
      const edit = trace.edits[index];
      if (edit === undefined) continue;
      const next = trace.edits[index + 1] ?? trace.sessionEndMs;
      if (next - edit < debounceMs) continue;
      requests += 1;
      if (edit + debounceMs + providerLatencyMs <= next) returned += 1;
      else cancelled += 1;
    }
  }
  return { debounceMs, opportunities, requests, returnedBeforeNextEdit: returned, cancelledByEdit: cancelled };
}

export const SYNTHETIC_TYPING_TRACES: readonly TypingTrace[] = [
  { id: "fast-token", edits: [0, 55, 110, 165, 220, 275, 330, 385], sessionEndMs: 1800 },
  { id: "short-pauses", edits: [0, 80, 160, 500, 580, 660, 1100, 1180], sessionEndMs: 2700 },
  { id: "deliberate-lines", edits: [0, 70, 140, 1500, 1570, 1640, 3200], sessionEndMs: 5000 },
  { id: "slow-typing", edits: [0, 240, 480, 720, 960, 1200], sessionEndMs: 2600 }
];
