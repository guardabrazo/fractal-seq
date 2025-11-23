export type ScaleName =
  | 'chromatic'
  | 'major'
  | 'minor'
  | 'major-pentatonic'
  | 'minor-pentatonic'
  | 'harmonic-minor'
  | 'whole-tone'
  | 'unquantized';

export type GateLengthKind =
  | 'trigger'   // about 6 ms
  | 'p10'       // 10% of step
  | 'p25'       // 25% of step
  | 'p50'       // 50% of step
  | 'p75'       // 75% of step
  | 'p90'       // 90% of step
  | 'tied';     // full / held

export interface Step {
  /** Base pitch in semitones relative to root, before scale quantization */
  pitch: number;
  /** Whether this step produces a gate at all */
  gateOn: boolean;
  /** Ratchets: how many clocks this step repeats before advancing (>=1) */
  ratchets: number;
  /** Slew amount 0–1 (for portamento between this step and next) */
  slew: number;
  /** Gate length mode */
  gateLength: GateLengthKind;
  depth?: number;
  originalIndex?: number; // Added for visualization
}

export type PlaybackOrder = 'forward' | 'backward' | 'pendulum' | 'random';

export interface Sequence {
  steps: Step[];          // up to 32
  length: number;         // 1–32 active steps
  scale: ScaleName;
  playbackOrder: PlaybackOrder;
}

export interface BranchConfig {
  left: ModificationKind;
  right: ModificationKind;
  leftParam: number;
  rightParam: number;
}

export interface Pattern { // Fractal Parameters
  trunk: Sequence;
  branchesCount: number; // 0 to 3
  pathValue: number; // 0.0 to 1.0 (determines which branch to follow)
  mutationAmount: number; // 0.0 to 1.0
  rootOffsetSemitones: number;
  divMult: number;
  branchConfig: BranchConfig[]; // Index 0 = Depth 1, Index 1 = Depth 2, etc.
  branchPlaybackOrder: BranchPlaybackOrder;
}

export type ModificationKind = 'transpose' | 'invert' | 'reverse' | 'mutate';
export type BranchPlaybackOrder = 'forward' | 'reverse' | 'pendulum' | 'random';

export interface TreeNode {
  sequence: Sequence;       // the pattern at this node
  depth: number;            // 0 = trunk
  modificationFromParent: ModificationKind | null;
  left?: TreeNode;
  right?: TreeNode;
}

export interface GeneratedTree {
  root: TreeNode;           // trunk at depth 0
  maxDepth: number;         // up to 7
}

export interface Channel {
  id: 1 | 2;
  currentPatternIndex: number;    // 0–7
  patterns: Pattern[];            // 8 patterns per channel
  generatedTree: GeneratedTree | null;
  activeSequence?: Sequence; // The flattened sequence currently being played
}

export interface EngineState {
  channels: [Channel, Channel];
  bpm: number;
  useInternalClock: boolean;
  isPlaying: boolean;
  ratchetsEnabled: boolean;
}
