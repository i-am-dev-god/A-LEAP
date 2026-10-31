#!/usr/bin/env node
/**
 * Turns the raw narration in voice-src/ into the clips the video plays.
 *
 *  - trims the silence the TTS leaves at the head and tail of every sentence
 *  - normalises loudness so no scene jumps out at you
 *  - applies one global tempo nudge (default 1.10x) so the whole cut lands
 *    inside a YouTube Short
 *
 * The tempo is one number for the entire film, so the voice never changes
 * character mid-video. Raw clips are kept untouched in voice-src/.
 *
 *   node scripts/prepare-audio.mjs            # build public/audio
 *   TARGET_SECONDS=55 node scripts/prepare-audio.mjs
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FFMPEG = path.join(root, 'node_modules', '@remotion', 'compositor-linux-x64-gnu', 'ffmpeg');
const SRC = path.join(root, 'voice-src');
const OUT = path.join(root, 'public', 'audio');
const TARGET_SECONDS = Number(process.env.TARGET_SECONDS ?? 57);

const run = (args) => {
  const { stdout, stderr } = spawnSync(FFMPEG, args, {
    encoding: 'utf8',
    maxBuffer: 1 << 26,
  });
  return `${stdout ?? ''}${stderr ?? ''}`;
};

/** Duration + first/last non-silent timestamps, straight from ffmpeg's log. */
const analyse = (file) => {
  const log = run([
    '-hide_banner',
    '-i', file,
    '-af', 'silencedetect=noise=-45dB:d=0.12',
    '-f', 'null', '-',
  ]);

  const duration = Number(/time=(\d+):(\d+):([\d.]+)/.exec(log).slice(1).reduce((acc, v) => acc * 60 + Number(v), 0));
  const starts = [...log.matchAll(/silence_start: ([\d.]+)/g)].map((m) => Number(m[1]));
  const ends = [...log.matchAll(/silence_end: ([\d.]+)/g)].map((m) => Number(m[1]));

  let head = 0;
  let tail = duration;
  // Leading silence is only "leading" if it starts at zero.
  for (let i = 0; i < starts.length; i += 1) {
    if (starts[i] > 0.02) break;
    if (ends[i] !== undefined) head = ends[i];
  }
  if (starts.length > ends.length) tail = starts[starts.length - 1];

  return { duration, head, tail };
};

mkdirSync(OUT, { recursive: true });
const files = readdirSync(SRC).filter((f) => f.endsWith('.mp3')).sort();

const clips = files.map((file) => {
  const abs = path.join(SRC, file);
  const { duration, head, tail } = analyse(abs);
  const start = Math.max(0, head - 0.04);
  const end = Math.min(duration, tail + 0.12);
  return { file, start, end, trimmed: end - start };
});

const trimmedTotal = clips.reduce((sum, c) => sum + c.trimmed, 0);
const tempo = Math.max(1, Math.min(1.25, trimmedTotal / TARGET_SECONDS));
const finalTotal = trimmedTotal / tempo;

for (const clip of clips) {
  const out = path.join(OUT, clip.file);
  const filters = [
    `atrim=start=${clip.start.toFixed(3)}:end=${clip.end.toFixed(3)}`,
    'asetpts=N/SR/TB',
    'aresample=48000',
    `atempo=${tempo.toFixed(4)}`,
    'loudnorm=I=-16:TP=-1.5:LRA=11',
  ].join(',');
  run(['-hide_banner', '-loglevel', 'error', '-y', '-i', path.join(SRC, clip.file), '-af', filters, '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '160k', out]);
  console.log(`${clip.file}  ${(clip.end - clip.start).toFixed(2)}s -> ${((clip.end - clip.start) / tempo).toFixed(2)}s`);
}

const report = {
  tempo: Number(tempo.toFixed(4)),
  rawSeconds: Number(clips.reduce((s, c) => s + c.duration, 0).toFixed(3)),
  trimmedSeconds: Number(trimmedTotal.toFixed(3)),
  finalSeconds: Number(finalTotal.toFixed(3)),
};
writeFileSync(path.join(root, 'public', 'audio', 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`\ntempo ${report.tempo}x   raw ${report.rawSeconds}s   trimmed ${report.trimmedSeconds}s   final ${report.finalSeconds}s`);
