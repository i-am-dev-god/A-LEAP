/**
 * Analysis: run every rule, rank the findings, and decide the verdict.
 *
 * The verdict is pessimistic by design. One blocking finding is enough to stop
 * a render — a video with a single unlicensed frame is not "mostly fine".
 */
import type { Finding, RiskReport, Severity, Verdict, VideoSpec } from "./types.ts";
import { RULES, buildCredits } from "./rules.ts";
import { buildManifest } from "./manifest.ts";

const SEVERITY_ORDER: Record<Severity, number> = {
  block: 0,
  error: 1,
  warn: 2,
  info: 3,
};

const PENALTY: Record<Severity, number> = {
  block: 1000,
  error: 22,
  warn: 7,
  info: 1,
};

/**
 * Generic license rules restate the same problem a specific rule already named.
 * When an asset is covered by a dedicated rule (extracted bytes, fingerprinted
 * audio, an unreleased likeness), drop the generic complaint so the report says
 * one thing per asset instead of four.
 */
const GENERIC_RULES = new Set(["L003", "L004"]);
const SPECIFIC_RULES = new Set(["R001", "A001", "P001", "P002"]);

function pruneGeneric(findings: Finding[]): Finding[] {
  const covered = new Set(
    findings
      .filter((f) => f.assetId && SPECIFIC_RULES.has(f.ruleId))
      .map((f) => f.assetId as string),
  );
  return findings.filter(
    (f) => !(f.assetId && covered.has(f.assetId) && GENERIC_RULES.has(f.ruleId)),
  );
}

export function analyze(spec: VideoSpec): RiskReport {
  const findings = pruneGeneric(RULES.flatMap((rule) => {
    try {
      return rule.run(spec);
    } catch (err) {
      return [
        {
          ruleId: rule.id,
          severity: "error" as Severity,
          title: `Rule ${rule.id} failed`,
          detail: String(err),
          surfaces: [],
        },
      ];
    }
  })).sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  const counts: Record<Severity, number> = { block: 0, error: 0, warn: 0, info: 0 };
  for (const finding of findings) counts[finding.severity] += 1;

  const penalty = findings.reduce((sum, finding) => sum + PENALTY[finding.severity], 0);
  const score = counts.block > 0 ? 0 : Math.max(5, 100 - penalty);

  let verdict: Verdict = "cleared";
  if (counts.block > 0) verdict = "blocked";
  else if (counts.error > 0) verdict = "needs-work";
  else if (counts.warn > 0) verdict = "review";

  const credits = buildCredits(spec);

  return {
    spec,
    verdict,
    score,
    findings,
    counts,
    credits,
    manifest: buildManifest(spec, credits),
  };
}

/** Findings grouped by the policy they threaten, for the human report. */
export function groupBySurface(findings: Finding[]): Map<string, Finding[]> {
  const groups = new Map<string, Finding[]>();
  for (const finding of findings) {
    for (const surface of finding.surfaces) {
      const bucket = groups.get(surface) ?? [];
      bucket.push(finding);
      groups.set(surface, bucket);
    }
  }
  return groups;
}
