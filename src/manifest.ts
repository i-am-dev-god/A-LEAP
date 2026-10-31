/**
 * The rights manifest: the artifact you hand to a client, a network, or a
 * brand's legal team. It is generated from the spec, never edited by hand.
 */
import type { RightsManifest, VideoSpec } from "./types.ts";
import { getLicense } from "./licenses.ts";

export function buildManifest(spec: VideoSpec, credits: string[]): RightsManifest {
  const project: RightsManifest["project"] = {
    id: spec.id,
    title: spec.title,
    format: spec.format,
    topic: spec.topic,
    commercialUse: spec.commercialUse,
    territory: spec.territory ?? "worldwide",
  };
  if (typeof spec.durationSec === "number") project.durationSec = spec.durationSec;

  const manifest: RightsManifest = {
    schemaVersion: "1.0",
    generatedAt: new Date().toISOString(),
    project,
    assets: spec.assets.map((a) => {
      const lic = getLicense(a.license);
      const row: RightsManifest["assets"][number] = {
        id: a.id,
        kind: a.kind,
        license: a.license ?? "undeclared",
        licenseName: lic?.name ?? "Unknown",
      };
      if (a.slot) row.slot = a.slot;
      if (a.source) row.source = a.source;
      if (a.origin) row.origin = a.origin;
      if (a.sha256) row.sha256 = a.sha256;
      if (a.author) row.author = a.author;
      if (a.attribution) row.attribution = a.attribution;
      return row;
    }),
    credits,
    disclosures: {
      syntheticRealistic: spec.disclosure?.syntheticRealistic ?? false,
      paidPromotion: spec.disclosure?.paidPromotion ?? false,
    },
    attestation:
      "Every third-party asset listed here is licensed for the stated commercial use, at the stated territory, with attribution and disclosure obligations recorded above. Assets whose license could not be verified are not listed and were not rendered.",
  };

  if (spec.reference) {
    const reference: NonNullable<RightsManifest["reference"]> = { usedFor: spec.reference.used };
    if (spec.reference.title) reference.title = spec.reference.title;
    if (spec.reference.creator) reference.creator = spec.reference.creator;
    if (spec.reference.url) reference.url = spec.reference.url;
    manifest.reference = reference;
  }

  return manifest;
}
