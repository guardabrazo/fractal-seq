import type { Channel, EngineState, Pattern, Sequence, Step } from './types';

function createDefaultStep(): Step {
    return {
        pitch: 0,
        gateOn: false,
        ratchets: 1,
        slew: 0,
        gateLength: 'p50',
    };
}

function createDefaultSequence(): Sequence {
    return {
        steps: Array.from({ length: 32 }, createDefaultStep),
        length: 8,
        scale: 'chromatic',
        playbackOrder: 'forward',
    };
}

function createDefaultPattern(): Pattern {
    return {
        trunk: {
            ...createDefaultSequence(),
            scale: 'minor',
        },
        branchesCount: 0,
        pathValue: 0,
        mutationAmount: 0,
        rootOffsetSemitones: 0,
        divMult: 1,
        branchConfig: [
            { left: 'transpose', right: 'transpose', leftParam: 3, rightParam: -3 },   // Depth 1: minor third up/down
            { left: 'invert', right: 'transpose', leftParam: 0, rightParam: 7 },        // Depth 2: invert left, fifth up right
            { left: 'mutate', right: 'invert', leftParam: 3, rightParam: 0 },           // Depth 3: mutate left, invert right
        ],
        branchPlaybackOrder: 'forward',
    };
}

function createChannel(id: 1 | 2): Channel {
    return {
        id,
        currentPatternIndex: 0,
        patterns: Array.from({ length: 8 }, createDefaultPattern),
        generatedTree: null,
    };
}

export function createInitialState(): EngineState {
    return {
        channels: [createChannel(1), createChannel(2)],
        bpm: 120,
        useInternalClock: true,
        isPlaying: false,
        ratchetsEnabled: false,
    };
}
