#!/usr/bin/env node
/**
 * Measures the processed narration and writes the frame timings the video is
 * cut to. Every scene lasts exactly as long as its line of speech, plus a
 * short beat before the next cut.
 *
 *   node scripts/timings.mjs
 */
import { parseFile } from 'music-metadata';
import { readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FPS = 30;
const GAP = 0.14; // beat between scenes
const TAIL = 0.7; // let the last line breathe

const dir = path.join(root, 'public', 'audio');
const files = readdirSync(dir).filter((f) => f.endsWith('.mp3')).sort();

let cursor = 0;
const scenes = [];
for (const [i, file] of files.entries()) {
  const { format } = await parseFile(path.join(dir, file));
  const seconds = format.duration ?? 0;
  const frames = Math.round((seconds + (i === files.length - 1 ? TAIL : GAP)) * FPS);
  scenes.push({
    id: file.replace(/\.mp3$/, ''),
    file: `audio/${file}`,
    seconds: Number(seconds.toFixed(3)),
    frames,
    from: cursor,
  });
  cursor += frames;
}

const out = {
  fps: FPS,
  generatedFrom: 'public/audio',
  totalFrames: cursor,
  totalSeconds: Number((cursor / FPS).toFixed(2)),
  scenes,
};
writeFileSync(path.join(root, 'src', 'timings.json'), JSON.stringify(out, null, 2) + '\n');

console.log(`${scenes.length} scenes · ${out.totalSeconds}s · ${cursor} frames @ ${FPS}fps`);
for (const s of scenes) console.log(`  ${s.id}  ${s.seconds.toFixed(2)}s  ${s.frames}f`);
