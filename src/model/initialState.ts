import type { Channel, EngineState, Pattern, Sequence, Step, GateLengthKind } from './types';

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

function createRandomTrunk(): Sequence {
    const steps = Array.from({ length: 32 }, () => {
        const isNote = Math.random() > 0.6; // 40% chance of note
        return {
            pitch: Math.floor(Math.random() * 24) - 12, // -12 to +11
            gateOn: isNote,
            ratchets: 1,
            slew: 0,
            gateLength: (Math.random() > 0.8 ? 'p90' : 'p50') as GateLengthKind,
        };
    });

    return {
        steps,
        length: 8,
        scale: 'minor',
        playbackOrder: 'forward',
    };
}

function createChannel(id: 1 | 2, randomizeFirst: boolean = false): Channel {
    const patterns = Array.from({ length: 8 }, createDefaultPattern);

    if (randomizeFirst) {
        patterns[0].trunk = createRandomTrunk();
    }

    return {
        id,
        currentPatternIndex: 0,
        patterns,
        generatedTree: null,
    };
}

export function createInitialState(): EngineState {
    return {
        channels: [createChannel(1, true), createChannel(2, false)],
        bpm: 120,
        useInternalClock: true,
        isPlaying: false,
        ratchetsEnabled: false,
        outputMode: 'audio',
        masterVolume: 1.0,
        selectedMidiOutput: null,
    };
}
