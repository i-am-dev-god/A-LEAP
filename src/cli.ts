#!/usr/bin/env node
/**
 * A-LEAP CLI.
 *
 *   aleap check <spec.json>            clearance report for a video spec
 *   aleap check <spec.json> --manifest writes the rights manifest
 *   aleap rules                        list every rule
 *
 * Exit codes: 0 cleared or review, 1 needs work, 2 blocked.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { analyze } from "./analyze.ts";
import { formatReport, formatRuleList } from "./report.ts";
import { RULES } from "./rules.ts";
import type { VideoSpec } from "./types.ts";

const EXIT: Record<string, number> = { cleared: 0, review: 0, "needs-work": 1, blocked: 2 };

function usage(): string {
  return [
    "",
    "  aleap — Asset License Enforcement And Provenance",
    "",
    "  Usage",
    "    aleap check <spec.json> [--json] [--manifest <out.json>] [--quiet]",
    "    aleap rules",
    "",
    "  Exit codes",
    "    0  cleared or review only",
    "    1  errors that will cost you monetization",
    "    2  blocked — at least one asset cannot be rendered",
    "",
  ].join("\n");
}

function parseArgs(argv: string[]) {
  const [command, ...rest] = argv;
  const flags = new Map<string, string | true>();
  const positional: string[] = [];
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (!arg) continue;
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = rest[i + 1];
      if (next && !next.startsWith("--")) {
        flags.set(key, next);
        i += 1;
      } else {
        flags.set(key, true);
      }
    } else {
      positional.push(arg);
    }
  }
  return { command, flags, positional };
}

async function loadSpec(path: string): Promise<VideoSpec> {
  const raw = await readFile(resolve(path), "utf8");
  const parsed = JSON.parse(raw) as VideoSpec;
  if (!parsed.assets || !Array.isArray(parsed.assets)) {
    throw new Error(`Spec ${path} has no "assets" array.`);
  }
  return parsed;
}

async function main(argv: string[]): Promise<number> {
  const { command, flags, positional } = parseArgs(argv);

  if (!command || command === "help" || flags.has("help") || command === "--help") {
    process.stdout.write(usage());
    return 0;
  }

  if (command === "rules") {
    process.stdout.write(formatRuleList(RULES));
    return 0;
  }

  if (command !== "check") {
    process.stderr.write(`Unknown command "${command}".\n${usage()}`);
    return 1;
  }

  const target = positional[0];
  if (!target) {
    process.stderr.write(`Missing spec path.\n${usage()}`);
    return 1;
  }

  const spec = await loadSpec(target);
  const report = analyze(spec);

  const manifestPath = flags.get("manifest");
  if (typeof manifestPath === "string") {
    const out = resolve(manifestPath);
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, `${JSON.stringify(report.manifest, null, 2)}\n`);
    if (!flags.has("quiet") && !flags.has("json")) {
      process.stdout.write(`  manifest written to ${manifestPath}\n`);
    }
  }

  if (flags.has("json")) {
    process.stdout.write(
      `${JSON.stringify(
        {
          id: spec.id,
          title: spec.title,
          verdict: report.verdict,
          score: report.score,
          counts: report.counts,
          findings: report.findings,
        },
        null,
        2,
      )}\n`,
    );
    return EXIT[report.verdict] ?? 1;
  }

  if (!flags.has("quiet")) process.stdout.write(formatReport(report));

  return EXIT[report.verdict] ?? 1;
}

main(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err: unknown) => {
    process.stderr.write(`\n  aleap: ${err instanceof Error ? err.message : String(err)}\n\n`);
    process.exitCode = 1;
  });
