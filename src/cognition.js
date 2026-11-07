/* ============================================================================
   L E A P — cognition
   ----------------------------------------------------------------------------
   An operating system without storage cannot keep a "session". So LEAP does
   not mutate state; it evaluates state. Everything below is a pure function
   of (genome, elapsed time). Seek anywhere, refresh, open the same address on
   another machine: you land in exactly the same moment. That is the whole
   trick, and it is why LEAP needs no disk, no database, no profile.
   ==========================================================================*/

import { hashName } from './core.js';

/* ------------------------------------------------------------ vocabulary -- */

const NOUNS = ['field','harbour','ledger','signal','garden','terrace','engine','lattice','archive','window','current','orchard'];
const VERBS = ['returns','settles','gathers','unfolds','answers','keeps','releases','measures','carries','remembers'];
const ADJ = ['quiet','unhurried','deliberate','luminous','patient','exact','open','unwritten','attentive','plain'];

const OPENERS = [
  'You are on {name}. Nothing about you was saved to get here.',
  'This machine has no disk. You are seeing a seed, rendered.',
  'No file was read to show you this. {name} is computed.',
  'You arrived, and the machine remembered you — from the address alone.',
  'There is no profile here. There is a seed, and there is you.',
];

const THESES = [
  'A machine should be a place you can return to, not a place you accumulate.',
  'Storage is a habit of software, not a law of computation.',
  'If the seed is enough, the disk was never needed.',
  'Identity is a constant, not a record.',
  'Anything that can be recomputed should never have been written down.',
  'The most personal thing a machine can hold is a way of seeing.',
  'Ownership is knowing the rule that generates the thing.',
];

/* ---------------------------------------------------------------- text ---- */

function pick(r, arr) { return arr[Math.floor(r() * arr.length) % arr.length]; }

/** Deterministic sentence-level voice: a poem of the machine's thesis. */
export function liturgy(g) {
  const r = (s => () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  })(hashName(g.seed));
  const lines = [];
  for (let i = 0; i < 3; i++) {
    lines.push(`The ${pick(r, ADJ)} ${pick(r, NOUNS)} ${pick(r, VERBS)}.`);
  }
  lines.push(pick(r, THESES));
  return lines;
}

export function thesis(g) {
  const r = (s => () => {
    s = (Math.imul(s, 22695477) + 1) >>> 0;
    return s / 4294967296;
  })(g.entropy);
  return pick(r, THESES);
}

/* ---------------------------------------------------------------- modes --- */

/**
 * Modes are the machine's "applications". Each one is a way of looking at the
 * same field; none of them are windows, and none of them hold documents.
 */
export const MODES = {
  orbit:   { label: 'orbit',   verb: 'surveying the field' },
  listen:  { label: 'listen',  verb: 'holding the beat' },
  compose: { label: 'compose', verb: 'laying down a line' },
  reveal:  { label: 'reveal',  verb: 'stating the thesis' },
  settle:  { label: 'settle',  verb: 'returning to rest' },
};

/* ---------------------------------------------------------------- plan ---- */

/**
 * A plan is an itinerary, not a state machine. Durations come from the
 * machine's patience dial, so a patient machine is genuinely slower and a
 * restive one genuinely faster. Nothing is random at runtime.
 */
export function plan(g, startAt = 0) {
  const r = (s => () => {
    s = (Math.imul(s ^ 0x9e3779b9, 1103515245) + 12345) >>> 0;
    return s / 4294967296;
  })(g.entropy ^ 0x51ed270b);

  const patience = g.dials.patience;           // 0.35 .. 0.95
  const attention = g.dials.attention;         // 0.55 .. 1.00
  const unit = 2600 + patience * 5200;         // ms per beat of the itinerary
  const waves = 3 + Math.round(attention * 2); // how many cycles before rest

  const steps = [];
  let at = startAt;
  for (let w = 0; w < waves; w++) {
    const seq = w % 2 === 0
      ? ['orbit', 'listen', 'compose']
      : ['orbit', 'compose', 'listen'];
    for (const mode of seq) {
      const dur = Math.round(unit * (0.7 + r() * 0.6));
      steps.push({ at, dur, mode, index: steps.length });
      at += dur;
    }
    if (w === waves - 1) {
      const dur = Math.round(unit * 0.9);
      steps.push({ at, dur, mode: 'reveal', index: steps.length });
      at += dur;
    }
  }
  const rest = Math.round(unit * (1.6 + patience));
  steps.push({ at, dur: rest, mode: 'settle', index: steps.length });
  at += rest;

  return { steps, total: at - startAt, startAt, waves, unit };
}

/** Pure evaluation: what is true at elapsed time t? */
export function stateAt(g, p, t) {
  const abs = p.startAt + Math.max(0, t);
  let step = p.steps[0];
  for (const s of p.steps) if (abs >= s.at) step = s;
  const local = abs - step.at;
  const progress = Math.min(1, local / step.dur);
  const cycle = p.steps.indexOf(step);
  return {
    step,
    cycle,
    mode: step.mode,
    label: MODES[step.mode].label,
    verb: MODES[step.mode].verb,
    progress,
    // a smooth 0..1..0 envelope, the machine's "breath" during this step
    breath: Math.sin(progress * Math.PI),
    localMs: local,
    indexInCycle: cycle % 3,
    finished: abs > p.startAt + p.total,
    abs,
  };
}

export const fmtTime = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
