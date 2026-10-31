/**
 * Human-readable rendering of a risk report.
 */
import type { Finding, RiskReport, Severity } from "./types.ts";

const useColor =
  process.env.NO_COLOR === undefined && process.env.TERM !== "dumb" && process.stdout.isTTY;

const paint = (code: string) => (s: string) => (useColor ? `\u001b[${code}m${s}\u001b[0m` : s);
const dim = paint("2");
const bold = paint("1");
const red = paint("31");
const yellow = paint("33");
const green = paint("32");
const cyan = paint("36");
const magenta = paint("35");

const SEVERITY_LABEL: Record<Severity, string> = {
  block: "BLOCK",
  error: "ERROR",
  warn: "WARN",
  info: "INFO",
};

const severityPaint = (s: Severity): ((v: string) => string) =>
  s === "block" ? red : s === "error" ? magenta : s === "warn" ? yellow : dim;

const SURFACE_LABEL: Record<string, string> = {
  "copyright-strike": "copyright strike",
  "content-id": "Content ID claim",
  "reused-content": "reused content",
  "inauthentic-content": "inauthentic content",
  likeness: "likeness rights",
  disclosure: "disclosure",
  trademark: "trademark",
};

const VERDICT_STYLE: Record<RiskReport["verdict"], { text: string; paint: (s: string) => string }> =
  {
    cleared: { text: "CLEARED", paint: green },
    review: { text: "REVIEW", paint: yellow },
    "needs-work": { text: "NEEDS WORK", paint: magenta },
    blocked: { text: "BLOCKED", paint: red },
  };

const formatDuration = (seconds?: number): string => {
  if (!seconds) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}m${s.toString().padStart(2, "0")}s` : `${s}s`;
};

function renderFinding(finding: Finding): string[] {
  const paintSeverity = severityPaint(finding.severity);
  const head = `  ${paintSeverity(SEVERITY_LABEL[finding.severity].padEnd(5))} ${dim(finding.ruleId)}  ${bold(finding.title)}`;
  const lines = [head, `        ${finding.detail}`];
  if (finding.fix) lines.push(`        ${cyan("→")} ${dim(finding.fix)}`);
  return lines;
}

export function formatReport(report: RiskReport): string {
  const { spec, verdict, score, counts, findings, credits } = report;
  const style = VERDICT_STYLE[verdict];
  const meta = [spec.format, formatDuration(spec.durationSec), spec.topic]
    .filter(Boolean)
    .join(" · ");

  const out: string[] = [];
  out.push("");
  out.push(`  ${bold("A-LEAP")} ${dim("· Asset License Enforcement And Provenance")}`);
  out.push(`  ${dim(spec.title)}  ${dim(`(${meta})`)}`);
  out.push("");

  const scoreText = `${score}/100`;
  out.push(
    `  ${dim("VERDICT")}  ${style.paint(bold(style.text.padEnd(11)))} ${dim("SCORE")} ${bold(scoreText)}`,
  );
  out.push(
    `  ${dim(`${spec.assets.length} assets · ${counts.block} blocking · ${counts.error} errors · ${counts.warn} warnings`)}`,
  );
  out.push("");

  if (findings.length === 0) {
    out.push(`  ${green("✓")} No license, likeness, or policy issue found. Safe to render.`);
  } else {
    out.push(`  ${bold("FINDINGS")}`);
    const surfaces = new Set(findings.flatMap((f) => f.surfaces));
    if (surfaces.size > 0) {
      out.push(
        `  ${dim("exposure:")} ${[...surfaces].map((s) => SURFACE_LABEL[s] ?? s).join(", ")}`,
      );
    }
    out.push("");
    for (const finding of findings) {
      out.push(...renderFinding(finding));
      out.push("");
    }
  }

  if (credits.length > 0) {
    out.push(`  ${bold("CREDITS")} ${dim("(auto-generated, paste into description)")}`);
    for (const credit of credits) out.push(`  ${dim("•")} ${credit}`);
    out.push("");
  }

  const nextStep =
    verdict === "blocked"
      ? red("Render refused. Re-source the blocking assets.")
      : verdict === "needs-work"
        ? magenta("Fix the errors above before publishing.")
        : verdict === "review"
          ? yellow("Publishable, but read the warnings — they cost revenue, not the channel.")
          : green("Render the video.");
  out.push(`  ${bold("NEXT")}  ${nextStep}`);
  out.push("");

  return out.join("\n");
}

export function formatRuleList(rules: Array<{ id: string; title: string }>): string {
  const out = ["", `  ${bold("A-LEAP rules")}`, ""];
  for (const rule of rules) out.push(`  ${dim(rule.id)}  ${rule.title}`);
  out.push("");
  return out.join("\n");
}
