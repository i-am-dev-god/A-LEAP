import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { analyze } from "../src/analyze.ts";
import { LICENSES, effectiveContentId } from "../src/licenses.ts";
import type { VideoSpec } from "../src/types.ts";

const load = async (name: string): Promise<VideoSpec> =>
  JSON.parse(await readFile(new URL(`../examples/${name}`, import.meta.url), "utf8")) as VideoSpec;

const base = (over: Partial<VideoSpec> = {}): VideoSpec => ({
  id: "t",
  title: "t",
  format: "short",
  topic: "science",
  commercialUse: true,
  assets: [{ id: "a", kind: "image", license: "original", origin: "original" }],
  ...over,
});

const ruleIds = (spec: VideoSpec) => analyze(spec).findings.map((f) => f.ruleId);

test("a fully original asset set clears", () => {
  const report = analyze(base());
  assert.equal(report.verdict, "cleared");
  assert.equal(report.score, 100);
  assert.deepEqual(report.findings, []);
});

test("a clone that reuses reference bytes is blocked", async () => {
  const report = analyze(await load("risky-clone.json"));
  assert.equal(report.verdict, "blocked");
  assert.equal(report.score, 0);
  const ids = report.findings.map((f) => f.ruleId);
  assert.ok(ids.includes("R001"), "reference asset reuse must be flagged");
  assert.ok(ids.includes("P001"), "unreleased likeness must be flagged");
  assert.ok(ids.includes("A001"), "fingerprinted audio must be flagged");
});

test("generic license noise is pruned when a specific rule already covers the asset", async () => {
  const report = analyze(await load("risky-clone.json"));
  const refAsset = report.findings.filter((f) => f.assetId === "a-roll-1");
  assert.ok(refAsset.some((f) => f.ruleId === "R001"));
  assert.ok(
    !refAsset.some((f) => f.ruleId === "L003" || f.ruleId === "L004"),
    "the reference-video license complaint is already made in full by R001",
  );
  assert.ok(!report.findings.some((f) => f.assetId === "a-roll-ronaldo" && f.ruleId === "L003"));
});

test("the generic license rule still fires when nothing else covers the asset", () => {
  const report = analyze(
    base({
      assets: [
        {
          id: "stock-photo",
          kind: "image",
          license: "all-rights-reserved",
          attribution: "Some agency",
        },
      ],
    }),
  );
  assert.ok(report.findings.some((f) => f.ruleId === "L003" && f.assetId === "stock-photo"));
  assert.equal(report.verdict, "blocked");
});

test("trending audio is an error, never a pass", async () => {
  const report = analyze(await load("risky-clone.json"));
  const audio = report.findings.find((f) => f.ruleId === "A001" && f.assetId === "music-bed");
  assert.ok(audio, "trending sound must produce an A001 finding");
  assert.equal(audio.severity, "error");
});

test("the same clone, re-sourced, clears", async () => {
  const report = analyze(await load("fixed-clone.json"));
  assert.equal(report.verdict, "cleared", JSON.stringify(report.findings, null, 2));
});

test("the documentary episode clears and produces credits", async () => {
  const report = analyze(await load("clean-episode.json"));
  assert.equal(report.verdict, "cleared");
  assert.ok(report.credits.some((c) => c.includes("CC BY 4.0")));
});

test("missing license blocks", () => {
  const report = analyze(base({ assets: [{ id: "a", kind: "video" }] }));
  assert.equal(report.verdict, "blocked");
  assert.ok(report.findings.some((f) => f.ruleId === "L001"));
});

test("non-commercial license blocks only when the video earns money", () => {
  const assets = [
    { id: "a", kind: "image" as const, license: "cc-by-nc-4.0", attribution: "Someone / CC BY-NC 4.0" },
  ];
  assert.equal(analyze(base({ assets })).verdict, "blocked");
  assert.equal(analyze(base({ assets, commercialUse: false })).verdict, "cleared");
});

test("attribution gaps are errors, not warnings", () => {
  const report = analyze(
    base({ assets: [{ id: "a", kind: "image", license: "cc-by-4.0", author: "Someone" }] }),
  );
  assert.equal(report.verdict, "needs-work");
});

test("realistic synthetic footage without disclosure is an error", () => {
  const report = analyze(
    base({
      assets: [{ id: "a", kind: "video", license: "generated", synthetic: true, realistic: true }],
    }),
  );
  assert.ok(report.findings.some((f) => f.ruleId === "D001"));
  assert.equal(
    analyze(
      base({
        assets: [{ id: "a", kind: "video", license: "generated", synthetic: true, realistic: true }],
        disclosure: { syntheticRealistic: true },
      }),
    ).verdict,
    "cleared",
  );
});

test("a synthetic presenter on finance is not monetizable", () => {
  const report = analyze(base({ topic: "finance", presenter: { kind: "synthetic" } }));
  assert.ok(report.findings.some((f) => f.ruleId === "D002"));
});

test("near-identical episodes trip the inauthentic-content rule", () => {
  const report = analyze(base({ series: { templateId: "x", structuralSimilarity: 0.95 } }));
  const finding = report.findings.find((f) => f.ruleId === "D003");
  assert.ok(finding);
  assert.equal(finding.severity, "error");
  assert.ok(finding.surfaces.includes("inauthentic-content"));
});

test("a regenerated asset may still reference a source video", () => {
  const report = analyze(
    base({
      reference: { used: "structure-only" },
      assets: [
        {
          id: "a",
          kind: "video",
          license: "generated",
          derivedFrom: { referenceId: "ref", method: "regenerated" },
        },
      ],
    }),
  );
  assert.equal(report.verdict, "cleared");
});

test("a license scoped to one asset kind rejects another kind", () => {
  const report = analyze(
    base({ assets: [{ id: "a", kind: "image", license: "platform-tts-unofficial" }] }),
  );
  assert.ok(report.findings.some((f) => f.ruleId === "L007"));
});

test("unverified audio is treated as claimed", () => {
  assert.equal(effectiveContentId({ kind: "music" }), "unknown");
  assert.equal(effectiveContentId({ kind: "music", license: "original" }), false);
  assert.equal(effectiveContentId({ kind: "image", license: "original" }), "n/a");
});

test("the registry never marks a non-commercial license as commercial", () => {
  for (const lic of Object.values(LICENSES)) {
    if (!lic.commercialUse) assert.ok(lic.id.length > 0);
  }
  assert.equal(LICENSES["trending-sound"]?.commercialUse, false);
  assert.equal(LICENSES["reference-video"]?.commercialUse, false);
});

test("manifest records every asset and its license name", async () => {
  const spec = await load("clean-episode.json");
  const { manifest } = analyze(spec);
  assert.equal(manifest.assets.length, spec.assets.length);
  assert.ok(manifest.assets.every((a) => a.licenseName.length > 0));
  assert.equal(manifest.disclosures.syntheticRealistic, false);
});
