/**
 * The rule set.
 *
 * Each rule encodes one way a video actually gets taken down, demonetized, or
 * claimed. Rules are deliberately conservative: A-LEAP's job is to stop a bad
 * publish, so an unknown is treated as a risk, not as a pass.
 */
import type { Asset, Finding, PolicySurface, Severity, VideoSpec } from "./types.ts";
import { effectiveContentId, getLicense, isAudioKind } from "./licenses.ts";

interface Rule {
  id: string;
  title: string;
  run: (spec: VideoSpec) => Finding[];
}

const f = (
  ruleId: string,
  severity: Severity,
  title: string,
  detail: string,
  surfaces: PolicySurface[],
  extra: Partial<Finding> = {},
): Finding => ({ ruleId, severity, title, detail, surfaces, ...extra });

/** Topics where a synthetic presenter is not monetizable on YouTube. */
const SENSITIVE_TOPICS = new Set(["finance", "health", "legal"]);

const assetsOf = (spec: VideoSpec): Asset[] => spec.assets ?? [];

// ---------------------------------------------------------------------------
// Ownership
// ---------------------------------------------------------------------------

const licenseMissing: Rule = {
  id: "L001",
  title: "asset has no license",
  run: (spec) =>
    assetsOf(spec)
      .filter((a) => !a.license)
      .map((a) =>
        f(
          "L001",
          "block",
          "Asset has no license record",
          `"${a.id}" (${a.kind}) cannot be rendered: no license is declared, so its ownership is unknown.`,
          ["copyright-strike"],
          {
            assetId: a.id,
            fix: "Declare the license id, or replace the asset with one you can prove.",
          },
        ),
      ),
};

const licenseUnknown: Rule = {
  id: "L002",
  title: "asset cites a license A-LEAP does not recognise",
  run: (spec) =>
    assetsOf(spec)
      .filter((a) => a.license && !getLicense(a.license))
      .map((a) =>
        f(
          "L002",
          "block",
          "Unrecognised license id",
          `"${a.id}" cites "${a.license}", which is not in the registry. An unchecked license is an unchecked risk.`,
          ["copyright-strike"],
          {
            assetId: a.id,
            fix: "Use a registered license id, or add the license to src/licenses.ts with its terms.",
          },
        ),
      ),
};

const nonCommercial: Rule = {
  id: "L003",
  title: "non-commercial license on a commercial video",
  run: (spec) => {
    if (!spec.commercialUse) return [];
    return assetsOf(spec).flatMap((a) => {
      const lic = getLicense(a.license);
      if (!lic || lic.commercialUse) return [];
      return [
        f(
          "L003",
          "block",
          "Non-commercial license used commercially",
          `"${a.id}" is under ${lic.name}, which forbids commercial use. This video earns money, so the license does not cover it.`,
          ["copyright-strike"],
          { assetId: a.id, fix: "Replace the asset or drop commercial use of the video." },
        ),
      ];
    });
  },
};

const noDerivatives: Rule = {
  id: "L004",
  title: "no-derivatives license on an edited asset",
  run: (spec) =>
    assetsOf(spec).flatMap((a) => {
      const lic = getLicense(a.license);
      if (!lic || lic.derivatives) return [];
      return [
        f(
          "L004",
          "block",
          "No-derivatives license",
          `"${a.id}" is under ${lic.name}. Cutting, restyling, or overlaying it creates a derivative work you are not licensed to make.`,
          ["copyright-strike"],
          { assetId: a.id, fix: "Replace the asset with a derivatives-permitted source." },
        ),
      ];
    }),
};

const kindMismatch: Rule = {
  id: "L007",
  title: "license does not cover this kind of asset",
  run: (spec) =>
    assetsOf(spec).flatMap((a) => {
      const lic = getLicense(a.license);
      if (!lic?.kinds || lic.kinds.includes(a.kind)) return [];
      return [
        f(
          "L007",
          "block",
          "License does not cover this asset kind",
          `"${a.id}" is a ${a.kind} asset under ${lic.name}, which only covers ${lic.kinds.join(", ")}.`,
          ["copyright-strike"],
          { assetId: a.id, fix: "Use a license scoped to this asset kind." },
        ),
      ];
    }),
};

const shareAlike: Rule = {
  id: "L005",
  title: "share-alike license infects the finished video",
  run: (spec) =>
    assetsOf(spec).flatMap((a) => {
      const lic = getLicense(a.license);
      if (!lic || !lic.shareAlike) return [];
      return [
        f(
          "L005",
          "error",
          "ShareAlike obligation inherited",
          `"${a.id}" is under ${lic.name}. The finished video becomes a derivative and must carry the same license, which usually conflicts with an exclusive client deliverable.`,
          ["copyright-strike"],
          {
            assetId: a.id,
            fix: "Swap for CC BY or public domain, or accept the ShareAlike terms explicitly.",
          },
        ),
      ];
    }),
};

const attributionMissing: Rule = {
  id: "L006",
  title: "attribution required but absent",
  run: (spec) =>
    assetsOf(spec).flatMap((a) => {
      const lic = getLicense(a.license);
      if (!lic || !lic.attributionRequired || a.attribution) return [];
      return [
        f(
          "L006",
          "error",
          "Missing required attribution",
          `"${a.id}" is under ${lic.name}, which requires credit. No attribution string is set, so the credit block would ship incomplete.`,
          ["copyright-strike"],
          {
            assetId: a.id,
            fix: `Set attribution to "${a.author ?? "<author>"} / <source> / ${lic.name}".`,
          },
        ),
      ];
    }),
};

// ---------------------------------------------------------------------------
// Reference cloning — the Hypit-shaped risk
// ---------------------------------------------------------------------------

const referenceAssetsUsed: Rule = {
  id: "R001",
  title: "pixels or samples lifted from the reference video",
  run: (spec) => {
    const out: Finding[] = [];
    if (spec.reference?.used === "assets") {
      out.push(
        f(
          "R001",
          "block",
          "Reference video used as an asset source",
          "Cloning structure is fine. Reusing the reference's frames or audio is a derivative work and a fingerprint match.",
          ["copyright-strike", "content-id", "reused-content"],
          { fix: "Re-source every slot: keep the edit pattern, replace all bytes." },
        ),
      );
    }
    for (const a of assetsOf(spec)) {
      const d = a.derivedFrom;
      if (!d || d.method === "regenerated") continue;
      const fatal = d.method === "verbatim" || d.method === "resampled";
      out.push(
        f(
          "R001",
          fatal ? "block" : "warn",
          fatal ? "Asset extracted from the reference" : "Asset restyled from the reference",
          fatal
            ? `"${a.id}" was ${d.method} from reference "${d.referenceId}". This is the exact case that produces DMCA strikes and automatic claims.`
            : `"${a.id}" was restyled from reference "${d.referenceId}". Restyling a protected frame is still a derivative work; only fully regenerated pixels are safe.`,
          ["copyright-strike", "content-id"],
          {
            assetId: a.id,
            fix: "Regenerate from the prompt/spec, never from the reference's pixels.",
          },
        ),
      );
    }
    return out;
  },
};

const referenceUndeclared: Rule = {
  id: "R002",
  title: "reference-derived asset with no reference block",
  run: (spec) =>
    spec.reference
      ? []
      : assetsOf(spec)
          .filter((a) => a.derivedFrom || a.origin === "reference-derived")
          .map((a) =>
            f(
              "R002",
              "error",
              "Reference use is undeclared",
              `"${a.id}" traces back to another video, but the spec has no reference block, so the provenance chain is unrecorded.`,
              ["copyright-strike"],
              { assetId: a.id, fix: "Add a `reference` block declaring what was borrowed." },
            ),
          ),
};

const referenceUnknown: Rule = {
  id: "R003",
  title: "reference use is unclassified",
  run: (spec) =>
    spec.reference?.used === "unknown"
      ? [
          f(
            "R003",
            "warn",
            "Reference use unclassified",
            "The spec says a reference video exists but not whether only its structure was borrowed. Structure cloning is safe; asset cloning is not.",
            ["copyright-strike"],
            { fix: 'Set `reference.used` to "structure-only" after confirming no bytes were copied.' },
          ),
        ]
      : [],
};

// ---------------------------------------------------------------------------
// Audio fingerprinting
// ---------------------------------------------------------------------------

const contentIdRisk: Rule = {
  id: "A001",
  title: "audio likely enrolled in a fingerprinting system",
  run: (spec) =>
    assetsOf(spec).flatMap((a) => {
      if (!isAudioKind(a.kind)) return [];
      const cid = effectiveContentId(a);
      if (cid === false || cid === "n/a") return [];
      const lic = getLicense(a.license);
      const uncertain = cid === "unknown";
      return [
        f(
          "A001",
          uncertain ? "warn" : "error",
          uncertain ? "Audio enrollment unverified" : "Audio will be claimed",
          uncertain
            ? `"${a.id}" (${a.kind}) has no enrollment record. Unverified audio is treated as registered because a missed claim silently redirects the video's revenue.`
            : `"${a.id}" (${a.kind}) is fingerprinted${lic ? ` (${lic.name})` : ""}. Expect a Content ID claim on publish — not a strike, but the money goes elsewhere.`,
          ["content-id"],
          {
            assetId: a.id,
            fix: "Use the YouTube Audio Library, a commissioned score, or generated audio that exists in no catalog.",
          },
        ),
      ];
    }),
};

// ---------------------------------------------------------------------------
// People and likeness
// ---------------------------------------------------------------------------

const likeness: Rule = {
  id: "P001",
  title: "identifiable real person without a release",
  run: (spec) =>
    assetsOf(spec).flatMap((a) => {
      if (!a.persons?.length || a.releasesOnFile) return [];
      return [
        f(
          "P001",
          "error",
          "Real person depicted without a release",
          `"${a.id}" shows ${a.persons.join(", ")} and no release is on file. Publicity rights outlive copyright and takedowns here do not require a DMCA notice.`,
          ["likeness"],
          { assetId: a.id, fix: "Obtain a signed release, or replace with a synthetic person." },
        ),
      ];
    }),
};

const voiceClone: Rule = {
  id: "P002",
  title: "synthetic voice emulating a real person",
  run: (spec) =>
    assetsOf(spec).flatMap((a) => {
      if (a.kind !== "voice" || !a.synthetic || !a.persons?.length) return [];
      if (a.releasesOnFile) return [];
      return [
        f(
          "P002",
          "block",
          "Voice clone of a real person without consent",
          `"${a.id}" is a synthetic voice of ${a.persons.join(", ")}. Voice is treated as a personal identifier; this is the fastest possible channel takedown.`,
          ["likeness", "disclosure"],
          { assetId: a.id, fix: "Use a licensed stock voice or a clone of yourself." },
        ),
      ];
    }),
};

// ---------------------------------------------------------------------------
// Disclosure and monetization policy
// ---------------------------------------------------------------------------

const disclosure: Rule = {
  id: "D001",
  title: "realistic synthetic content not disclosed",
  run: (spec) => {
    const needs = assetsOf(spec).some((a) => a.synthetic && a.realistic);
    if (!needs || spec.disclosure?.syntheticRealistic) return [];
    return [
      f(
        "D001",
        "error",
        "Synthetic content requires disclosure",
        "At least one asset is photorealistic and model-generated. The platform requires the altered/synthetic content label, and the flag is not set.",
        ["disclosure"],
        { fix: "Set `disclosure.syntheticRealistic` to true and tick the label at upload." },
      ),
    ];
  },
};

const aiPersonaSensitive: Rule = {
  id: "D002",
  title: "synthetic presenter on a sensitive topic",
  run: (spec) => {
    if (!spec.commercialUse) return [];
    if (spec.presenter?.kind !== "synthetic") return [];
    if (!SENSITIVE_TOPICS.has(spec.topic)) return [];
    return [
      f(
        "D002",
        "error",
        "Synthetic presenter in a restricted topic",
        `A synthetic persona giving ${spec.topic} guidance is explicitly excluded from monetization. The video can publish, but it cannot earn.`,
        ["inauthentic-content"],
        { fix: "Use a real named presenter, or move to a non-restricted topic." },
      ),
    ];
  },
};

const templateCollapse: Rule = {
  id: "D003",
  title: "episode is structurally identical to the series",
  run: (spec) => {
    const sim = spec.series?.structuralSimilarity;
    if (typeof sim !== "number" || sim < 0.7) return [];
    const severe = sim >= 0.85;
    return [
      f(
        "D003",
        severe ? "error" : "warn",
        severe ? "Mass-produced shape detected" : "Low variation across episodes",
        `Structural similarity to prior episodes is ${(sim * 100).toFixed(0)}%. A consistent format is allowed; near-identical substance is not, and this is what the inauthentic-content rule targets.`,
        ["inauthentic-content"],
        {
          fix:
            "Vary the argument, the visual evidence, and the opening beat — not just the subject name.",
        },
      ),
    ];
  },
};

// ---------------------------------------------------------------------------
// Housekeeping
// ---------------------------------------------------------------------------

const provenanceIncomplete: Rule = {
  id: "H001",
  title: "third-party asset has no content hash",
  run: (spec) =>
    assetsOf(spec)
      .filter(
        (a) =>
          !a.sha256 &&
          (a.origin === "third-party" || a.origin === "library" || a.origin === "public-domain"),
      )
      .map((a) =>
        f(
          "H001",
          "warn",
          "Provenance hash missing",
          `"${a.id}" was sourced externally but has no sha256, so the manifest cannot prove which bytes were licensed.`,
          ["copyright-strike"],
          { assetId: a.id, fix: "Hash the file you actually rendered: `sha256sum file`." },
        ),
      ),
};

const trademarks: Rule = {
  id: "H002",
  title: "brand or trade dress visible in frame",
  run: (spec) =>
    assetsOf(spec).flatMap((a) => {
      if (!a.trademarks?.length) return [];
      return [
        f(
          "H002",
          "warn",
          "Trademark in frame",
          `"${a.id}" contains ${a.trademarks.join(", ")}. Trademark is not copyright, but brand policing still produces takedowns and blocks sponsorship deals.`,
          ["trademark"],
          { assetId: a.id, fix: "Blur, crop, or use a generic stand-in." },
        ),
      ];
    }),
};

export const RULES: Rule[] = [
  licenseMissing,
  licenseUnknown,
  nonCommercial,
  noDerivatives,
  kindMismatch,
  shareAlike,
  attributionMissing,
  referenceAssetsUsed,
  referenceUndeclared,
  referenceUnknown,
  contentIdRisk,
  likeness,
  voiceClone,
  disclosure,
  aiPersonaSensitive,
  templateCollapse,
  provenanceIncomplete,
  trademarks,
];

/** Build the credit block from asset attribution strings. */
export function buildCredits(spec: VideoSpec): string[] {
  const credits = new Set<string>();
  for (const a of assetsOf(spec)) {
    const lic = getLicense(a.license);
    if (!lic) continue;
    if (a.attribution) {
      credits.add(a.attribution);
    } else if (lic.attributionRequired && a.author) {
      credits.add(`${a.author} / ${lic.name}`);
    }
  }
  return [...credits];
}
