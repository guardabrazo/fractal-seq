import type {
    Channel,
    GeneratedTree,
    ModificationKind,
    Pattern,
    ScaleName,
    Sequence,
    Step,
    TreeNode,
} from '../model/types';

// --- Scale Quantization ---

const SCALES: Record<ScaleName, number[]> = {
    chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    major: [0, 2, 4, 5, 7, 9, 11],
    minor: [0, 2, 3, 5, 7, 8, 10],
    'major-pentatonic': [0, 2, 4, 7, 9],
    'minor-pentatonic': [0, 3, 5, 7, 10],
    'harmonic-minor': [0, 2, 3, 5, 7, 8, 11],
    'whole-tone': [0, 2, 4, 6, 8, 10],
    unquantized: [], // Special case
};

export function quantizePitch(pitchSemitones: number, scale: ScaleName): number {
    if (scale === 'unquantized') return pitchSemitones;

    const intervals = SCALES[scale];
    if (!intervals || intervals.length === 0) return pitchSemitones;

    const octave = Math.floor(pitchSemitones / 12);
    const note = Math.round(pitchSemitones % 12); // Normalize to 0-11 (mostly)

    // Handle negative modulo correctly if needed, though pitch is usually relative to root
    const normalizedNote = ((note % 12) + 12) % 12;

    // Find nearest interval
    let minDiff = Infinity;
    let nearest = intervals[0];

    for (const interval of intervals) {
        const diff = Math.abs(normalizedNote - interval);
        if (diff < minDiff) {
            minDiff = diff;
            nearest = interval;
        }
    }

    // Handle wrap-around case (e.g. 11 is closer to 0 in next octave)
    const diffUpper = Math.abs((normalizedNote - 12) - intervals[0]);
    if (diffUpper < minDiff) {
        return (octave + 1) * 12 + intervals[0];
    }

    const diffLower = Math.abs((normalizedNote + 12) - intervals[intervals.length - 1]);
    if (diffLower < minDiff) {
        return (octave - 1) * 12 + intervals[intervals.length - 1];
    }

    return octave * 12 + nearest;
}

// --- Modifications ---

function cloneSequence(seq: Sequence): Sequence {
    return {
        ...seq,
        steps: seq.steps.map((s) => ({ ...s })),
    };
}

function transposeSequence(seq: Sequence, semitones: number): Sequence {
    const newSeq = cloneSequence(seq);
    newSeq.steps.forEach((step) => {
        step.pitch += semitones;
    });
    return newSeq;
}

function invertSequence(seq: Sequence): Sequence {
    const newSeq = cloneSequence(seq);
    if (newSeq.steps.length === 0) return newSeq;

    let minPitch = Infinity;
    let maxPitch = -Infinity;

    newSeq.steps.forEach((s) => {
        if (s.pitch < minPitch) minPitch = s.pitch;
        if (s.pitch > maxPitch) maxPitch = s.pitch;
    });

    newSeq.steps.forEach((s) => {
        s.pitch = maxPitch - (s.pitch - minPitch);
    });
    return newSeq;
}

function reverseSequence(seq: Sequence): Sequence {
    const newSeq = cloneSequence(seq);
    // Only reverse the active steps (0 to length)
    const activeSteps = newSeq.steps.slice(0, newSeq.length).reverse();

    // Apply reversed steps back to the sequence
    for (let i = 0; i < newSeq.length; i++) {
        newSeq.steps[i] = activeSteps[i];
    }

    return newSeq;
}

function mutateSequence(seq: Sequence, range: number): Sequence {
    const newSeq = cloneSequence(seq);
    // range is semitones (e.g. 2 means +/- 2)
    if (range === 0) return newSeq;

    newSeq.steps.forEach((step) => {
        // Only mutate if the step is active
        if (step.gateOn) {
            // Mutate pitch: +/- range semitones
            // We want a random integer between -range and +range
            const offset = Math.floor(Math.random() * (range * 2 + 1)) - range;
            step.pitch += offset;
        }
    });
    return newSeq;
}

// --- Tree Generation ---

export function generateTreeForChannel(channel: Channel): GeneratedTree {
    const pattern = channel.patterns[channel.currentPatternIndex];
    const trunk = pattern.trunk;
    const maxDepth = pattern.branchesCount;

    const root: TreeNode = {
        sequence: trunk,
        depth: 0,
        modificationFromParent: null,
    };

    if (maxDepth === 0) {
        return { root, maxDepth };
    }

    // Recursive builder
    function buildChildren(node: TreeNode) {
        if (node.depth >= maxDepth) return;

        const d = node.depth + 1;
        let leftMod: ModificationKind = 'transpose';
        let rightMod: ModificationKind = 'transpose';

        // Use configuration from pattern
        // Depth is 1-based here, array is 0-based
        const configIndex = d - 1;
        const config = pattern.branchConfig[configIndex] || {
            left: 'transpose', right: 'transpose', leftParam: 7, rightParam: -5
        };

        leftMod = config.left;
        rightMod = config.right;

        let leftSeq: Sequence;
        let rightSeq: Sequence;

        // Apply Left Modification
        if (leftMod === 'transpose') leftSeq = transposeSequence(node.sequence, config.leftParam);
        else if (leftMod === 'invert') leftSeq = invertSequence(node.sequence);
        else if (leftMod === 'reverse') leftSeq = reverseSequence(node.sequence);
        else leftSeq = mutateSequence(node.sequence, config.leftParam || 0.3);

        // Apply Right Modification
        if (rightMod === 'transpose') rightSeq = transposeSequence(node.sequence, config.rightParam);
        else if (rightMod === 'invert') rightSeq = invertSequence(node.sequence);
        else if (rightMod === 'reverse') rightSeq = reverseSequence(node.sequence);
        else rightSeq = mutateSequence(node.sequence, config.rightParam || 0.3);

        node.left = {
            sequence: leftSeq,
            depth: d,
            modificationFromParent: leftMod
        };
        buildChildren(node.left);

        node.right = {
            sequence: rightSeq,
            depth: d,
            modificationFromParent: rightMod
        };
        buildChildren(node.right);
    }

    buildChildren(root);

    return { root, maxDepth };
}

// --- Playback Sequence Construction ---

export function getEffectivePathValue(pattern: Pattern): number {
    return pattern.pathValue;
}

export function buildPlaybackSequence(channel: Channel): Sequence {
    const pattern = channel.patterns[channel.currentPatternIndex];
    if (!channel.generatedTree) {
        return pattern.trunk;
    }

    const branchesCount = pattern.branchesCount;
    // Even if branchesCount is 0, we might want to apply per-node ordering to trunk?
    // But usually trunk is just trunk. Let's proceed with path logic.

    const maxPaths = Math.pow(2, branchesCount);
    const effectivePathValue = getEffectivePathValue(pattern);
    const pathIndex = Math.floor(effectivePathValue * (maxPaths - 0.0001));
    const pathBits = pathIndex.toString(2).padStart(branchesCount, '0');

    // Collect all nodes in the path first
    const pathNodes: TreeNode[] = [];
    let currentNode: TreeNode | undefined = channel.generatedTree.root;

    pathNodes.push(currentNode);

    for (let i = 0; i < branchesCount; i++) {
        if (!currentNode) break;
        const bit = pathBits[i];
        currentNode = bit === '0' ? currentNode.left : currentNode.right;
        if (currentNode) pathNodes.push(currentNode);
    }

    // Reorder pathNodes based on branchPlaybackOrder
    let orderedNodes: TreeNode[] = [];
    const branchOrder = pattern.branchPlaybackOrder || 'forward';

    if (branchOrder === 'forward') {
        orderedNodes = pathNodes;
    } else if (branchOrder === 'reverse') {
        orderedNodes = [...pathNodes].reverse();
    } else if (branchOrder === 'pendulum') {
        orderedNodes = [...pathNodes];
        for (let i = pathNodes.length - 2; i > 0; i--) {
            orderedNodes.push(pathNodes[i]);
        }
    } else if (branchOrder === 'random') {
        // Shuffle deterministically? No, user wants random.
        // But to avoid chaos, we should rely on the cached sequence in App.ts.
        // Here we just shuffle. App.ts controls when this is called.
        orderedNodes = [...pathNodes];
        for (let i = orderedNodes.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [orderedNodes[i], orderedNodes[j]] = [orderedNodes[j], orderedNodes[i]];
        }
    }

    const collectedSteps: Step[] = [];
    const seqOrder = pattern.trunk.playbackOrder || 'forward';

    // Process each node
    // Process each node
    orderedNodes.forEach(node => {
        // 1. Get active steps and tag with original index
        let steps = node.sequence.steps.slice(0, node.sequence.length).map((s, idx) => ({
            ...s,
            originalIndex: idx
        }));

        // 2. Apply Sequence Order PER NODE
        if (seqOrder === 'backward') {
            steps = steps.reverse();
        } else if (seqOrder === 'pendulum') {
            // 0, 1, 2, 1
            const pendSteps = [...steps];
            for (let i = steps.length - 2; i > 0; i--) {
                pendSteps.push(steps[i]);
            }
            steps = pendSteps;
        } else if (seqOrder === 'random') {
            // Shuffle steps within this node
            for (let i = steps.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [steps[i], steps[j]] = [steps[j], steps[i]];
            }
        }

        // 3. Tag with depth and collect
        steps.forEach(s => {
            // Clone step to avoid mutating the tree source (already cloned above via map)
            const taggedStep = { ...s, depth: node.depth };
            collectedSteps.push(taggedStep);
        });
    });

    return {
        steps: collectedSteps,
        length: collectedSteps.length,
        scale: pattern.trunk.scale,
        playbackOrder: 'forward' // Baked in!
    };
}

export function applyMutationToTrunk(pattern: Pattern): void {
    pattern.trunk = mutateSequence(pattern.trunk, pattern.mutationAmount);
}
