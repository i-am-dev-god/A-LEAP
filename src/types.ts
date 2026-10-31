/**
 * Core data model for A-LEAP.
 *
 * The unit of work is a *video spec*: a declarative description of a video where
 * every input asset carries its own license and provenance record. The analyzer
 * reads the spec and decides whether the video may be built at all.
 */

/** What kind of bytes an asset contributes. */
export type AssetKind =
  | "video"
  | "image"
  | "audio"
  | "music"
  | "sfx"
  | "voice"
  | "font"
  | "data";

/** How bad a finding is. `block` means the renderer must refuse. */
export type Severity = "block" | "error" | "warn" | "info";

/** The distinct ways a video can hurt you. They have different remedies. */
export type PolicySurface =
  | "copyright-strike"
  | "content-id"
  | "reused-content"
  | "inauthentic-content"
  | "likeness"
  | "disclosure"
  | "trademark";

/** Topic of the video. Drives the synthetic-presenter monetization rules. */
export type TopicCategory =
  | "science"
  | "engineering"
  | "history"
  | "education"
  | "finance"
  | "health"
  | "legal"
  | "politics"
  | "gaming"
  | "sports"
  | "entertainment"
  | "other";

/** Where a pixel or sample actually came from. */
export type AssetOrigin =
  | "original"
  | "generated"
  | "public-domain"
  | "library"
  | "third-party"
  | "reference-derived";

/** How a reference video was used. Only `verbatim`/`resampled` are fatal. */
export type ReferenceUse =
  /** Geometry, pacing, caption style, shot count. Not copyrightable. */
  | "structure-only"
  /** Actual frames or samples lifted out of the reference. */
  | "assets"
  | "unknown";

export interface Asset {
  /** Stable id, referenced by the shot list. */
  id: string;
  kind: AssetKind;
  /** Where it lands: "b-roll", "score", "vo", "diagram", ... */
  slot?: string;
  /** URL, repo path, or generation model id. */
  source?: string;
  /** Key into the license registry (see licenses.ts). */
  license?: string;
  licenseUrl?: string;
  author?: string;
  /** Credit line required by the license, e.g. "NASA / ISS ECLSS diagram". */
  attribution?: string;
  /** Content hash of the exact bytes used. The provenance fingerprint. */
  sha256?: string;
  origin?: AssetOrigin;
  /** Set when the bytes trace back to the reference video. */
  derivedFrom?: {
    referenceId: string;
    /** verbatim = same bytes; resampled = trimmed/retimed/re-encoded. */
    method: "verbatim" | "resampled" | "restyled" | "regenerated";
  };
  /**
   * Whether the audio is enrolled in a fingerprinting system.
   * `unknown` is treated as registered for audio, because the downside is
   * asymmetric: an unnoticed claim costs you the video's revenue.
   */
  contentIdRegistered?: boolean | "unknown";
  /** Identifiable real people visible or audible in this asset. */
  persons?: string[];
  /** Signed model/likeness releases on file for `persons`. */
  releasesOnFile?: boolean;
  /** Produced by a generative model. */
  synthetic?: boolean;
  /** Synthetic and photorealistic enough to require platform disclosure. */
  realistic?: boolean;
  /** Logos, brands, or protected trade dress in frame. */
  trademarks?: string[];
  notes?: string;
}

export interface ReferenceVideo {
  title?: string;
  url?: string;
  creator?: string;
  /** The single most important field in the whole spec. */
  used: ReferenceUse;
  referenceId?: string;
}

export interface VideoSpec {
  id: string;
  title: string;
  format: "documentary" | "short" | "ad" | "episode" | "other";
  durationSec?: number;
  topic: TopicCategory;
  /** Will this video earn money (AdSense, sponsorship, or a paid client brief)? */
  commercialUse: boolean;
  assets: Asset[];
  /** The viral video this one was modeled on, if any. */
  reference?: ReferenceVideo;
  disclosure?: {
    /** Creator Studio "altered or synthetic content" toggle. */
    syntheticRealistic?: boolean;
    /** Paid promotion disclosure. */
    paidPromotion?: boolean;
  };
  /** Series metadata, used to police the mass-production / inauthentic rule. */
  series?: {
    templateId: string;
    priorEpisodes?: number;
    /** 0..1 — how structurally identical this episode is to the others. */
    structuralSimilarity?: number;
  };
  presenter?: {
    kind: "human" | "synthetic" | "none";
    person?: string;
  };
  territory?: string;
}

export interface Finding {
  ruleId: string;
  severity: Severity;
  title: string;
  detail: string;
  assetId?: string;
  /** What the user must change to clear this. */
  fix?: string;
  surfaces: PolicySurface[];
}

export type Verdict = "cleared" | "review" | "needs-work" | "blocked";

export interface RightsManifest {
  schemaVersion: "1.0";
  generatedAt: string;
  project: {
    id: string;
    title: string;
    format: VideoSpec["format"];
    durationSec?: number;
    topic: TopicCategory;
    commercialUse: boolean;
    territory: string;
  };
  assets: Array<{
    id: string;
    kind: AssetKind;
    slot?: string;
    source?: string;
    license: string;
    licenseName: string;
    origin?: AssetOrigin;
    sha256?: string;
    author?: string;
    attribution?: string;
  }>;
  credits: string[];
  disclosures: {
    syntheticRealistic: boolean;
    paidPromotion: boolean;
  };
  reference?: {
    title?: string;
    creator?: string;
    url?: string;
    usedFor: ReferenceUse;
  };
  attestation: string;
}

export interface RiskReport {
  spec: VideoSpec;
  verdict: Verdict;
  score: number;
  findings: Finding[];
  counts: Record<Severity, number>;
  credits: string[];
  manifest: RightsManifest;
}
