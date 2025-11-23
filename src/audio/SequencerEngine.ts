import * as Tone from 'tone';
import type { Channel, EngineState, GateLengthKind, Sequence, Step } from '../model/types';
import { buildPlaybackSequence, quantizePitch } from './FractalTree';

export class SequencerEngine {
    private state: EngineState;
    private synth: Tone.PolySynth; // Single channel now
    private filter: Tone.Filter;
    private reverb: Tone.Freeverb;
    private delay: Tone.FeedbackDelay;
    private loopId: number | null = null;
    private channelState: {
        currentBaseStep: number;
        currentRatchetCount: number;
        nextNoteTime: number;
        lastTriggeredStepIndex: number;
    };

    private reverbGain: Tone.Gain;
    private delayGain: Tone.Gain;

    constructor(state: EngineState) {
        this.state = state;

        // Setup audio chain: Parallel Effects
        // Synth -> Filter -> Destination (Dry)
        // Synth -> Delay -> DelayGain -> Filter (Wet)
        // Synth -> Reverb -> ReverbGain -> Filter (Wet)

        this.filter = new Tone.Filter(2000, 'lowpass').toDestination();

        // Reverb Path
        this.reverb = new Tone.Freeverb({ roomSize: 0.7, dampening: 3000 });
        this.reverb.wet.value = 1; // 100% wet for send
        this.reverbGain = new Tone.Gain(0.3).connect(this.filter);
        this.reverb.connect(this.reverbGain);

        // Delay Path
        this.delay = new Tone.FeedbackDelay("8n", 0.5);
        this.delay.wet.value = 1; // 100% wet for send
        this.delayGain = new Tone.Gain(0).connect(this.filter);
        this.delay.connect(this.delayGain);

        // Synth
        this.synth = new Tone.PolySynth(Tone.Synth, {
            oscillator: { type: 'sine' },
            envelope: { attack: 0.005, decay: 0.1, sustain: 0.3, release: 0.8 }
        });

        // Connect Synth to Filter (Dry) and Effects (Sends)
        this.synth.connect(this.filter);
        this.synth.connect(this.reverb);
        this.synth.connect(this.delay);

        // Initialize single channel state
        this.channelState = {
            currentBaseStep: 0,
            currentRatchetCount: 0,
            nextNoteTime: 0,
            lastTriggeredStepIndex: -1,
        };

        // Set initial BPM
        Tone.Transport.bpm.value = this.state.bpm;
    }

    public start() {
        if (this.state.isPlaying) return;

        Tone.start();
        Tone.Transport.start();
        this.state.isPlaying = true;

        // Schedule the loop
        // We'll use a fast interval to check if we need to schedule the next step
        // This is a custom scheduler to handle variable step lengths (ratchets) and div/mults
        this.loopId = Tone.Transport.scheduleRepeat((time) => {
            this.tick(time);
        }, "32n"); // Check every 32nd note
    }

    public stop() {
        Tone.Transport.stop();
        Tone.Transport.cancel();
        this.state.isPlaying = false;
        this.loopId = null;

        // Reset state
        this.channelState.currentBaseStep = 0;
        this.channelState.currentRatchetCount = 0;
        this.channelState.nextNoteTime = 0;
        this.channelState.lastTriggeredStepIndex = -1;
    }

    public updateBpm(bpm: number) {
        this.state.bpm = bpm;
        Tone.Transport.bpm.value = bpm;
    }

    private tick(time: number) {
        // Process only first channel
        this.processChannel(this.state.channels[0], time);
    }

    private processChannel(channel: Channel, time: number) {
        const pattern = channel.patterns[channel.currentPatternIndex];
        // Use cached active sequence if available (for stable random), otherwise build it
        const sequence = channel.activeSequence || buildPlaybackSequence(channel);

        if (sequence.length === 0) return;

        const channelState = this.channelState;

        // If we are ahead of the scheduled time, don't schedule yet
        // We need a small lookahead window
        if (channelState.nextNoteTime > time + 0.1) return;

        // If nextNoteTime is 0 (start), set it to now
        if (channelState.nextNoteTime === 0) {
            channelState.nextNoteTime = time;
        }

        // Determine current step index based on playback order
        const stepIndex = this.getStepIndexAtTick(sequence, channelState.currentBaseStep);
        const step = sequence.steps[stepIndex];

        if (!step) {
            // Should not happen if logic is correct, but reset if so
            channelState.currentBaseStep = 0;
            return;
        }

        // Calculate duration
        // Base 16th note duration * divMult
        // 120 BPM -> 1 beat = 0.5s. 16th = 0.125s.
        // Tone.Transport.seconds per quarter note is 60/bpm
        const quarterTime = Tone.Transport.toSeconds("4n");
        const sixteenthTime = quarterTime / 4;

        // divMult: 1 = 16th notes. 2 = 8th notes (slower). 0.5 = 32nd notes (faster).
        // Wait, usually div/mult works on clock. 
        // Manual says: "Divisions/Multiplications of the clock".
        // Let's assume 1 = standard 16th note step.
        // 2 = half speed (8th notes). 0.5 = double speed (32nd notes).
        // Actually, usually Mult means FASTER (more notes per beat). Div means SLOWER.
        // Let's stick to the prompt's example: "0.125, 0.25, 0.5, 1, 2, 3, 4, 8"
        // If 1 is normal, 2 is slower? Or 2 is faster?
        // "Div/Mult options: /8, /4, /3, /2, x1, x2, x3, x4, x8"
        // Usually x2 means 2 steps per clock (faster). /2 means 1 step per 2 clocks (slower).
        // So if base is 16th:
        // x2 -> 32nd
        // /2 -> 8th

        let stepDuration = sixteenthTime;
        if (pattern.divMult >= 1) {
            // Multiplier: Faster? Or Slower?
            // If divMult is stored as 2 for x2:
            stepDuration = sixteenthTime / pattern.divMult;
        } else {
            // Divider: Slower
            // If divMult is 0.5 for /2:
            stepDuration = sixteenthTime / pattern.divMult;
        }

        // Ratcheting divides the step duration further
        const ratchets = this.state.ratchetsEnabled ? step.ratchets : 1;
        const ratchetDuration = stepDuration / ratchets;

        // Schedule the note
        const scheduleTime = channelState.nextNoteTime;

        if (step.gateOn) {
            // Update visualization state
            channelState.lastTriggeredStepIndex = stepIndex;

            const pitch = quantizePitch(step.pitch, sequence.scale) + pattern.rootOffsetSemitones + 60;
            const freq = Tone.Frequency(pitch, "midi").toFrequency();

            // Gate Length
            let duration = 0;
            if (step.gateLength === 'tied') {
                duration = ratchetDuration; // Full step
            } else if (step.gateLength === 'trigger') {
                duration = 0.006;
            } else {
                const percentages: Record<string, number> = {
                    'p10': 0.1, 'p25': 0.25, 'p50': 0.5, 'p75': 0.75, 'p90': 0.9
                };
                const p = percentages[step.gateLength] || 0.5;
                duration = ratchetDuration * p;
            }

            this.synth.triggerAttackRelease(freq, duration, scheduleTime);
        }

        // Advance state
        channelState.currentRatchetCount++;
        channelState.nextNoteTime += ratchetDuration;

        if (channelState.currentRatchetCount >= ratchets) {
            channelState.currentRatchetCount = 0;
            channelState.currentBaseStep++;

            // Handle sequence wrapping logic here if needed, but getStepIndexAtTick handles the mapping
            // We just let currentBaseStep grow? No, better to wrap it to avoid overflow issues long term,
            // though JS numbers are huge.
            // But for 'pendulum' we need the linear counter.
            // Let's just let it grow and modulo in getStepIndexAtTick.
        }
    }

    private getStepIndexAtTick(seq: Sequence, baseStepIndex: number): number {
        const len = seq.length;
        if (len === 0) return 0;

        switch (seq.playbackOrder) {
            case 'forward':
                return baseStepIndex % len;
            case 'backward':
                return (len - 1) - (baseStepIndex % len);
            case 'pendulum':
                // 0, 1, 2, 3, 2, 1, 0, 1...
                // Cycle length is 2*len - 2 (for len > 1)
                if (len <= 1) return 0;
                const cycle = 2 * len - 2;
                const pos = baseStepIndex % cycle;
                return pos < len ? pos : cycle - pos;
            case 'random':
                // Deterministic random based on step index? Or pure random?
                // Pure random is easier but "getStepIndexAtTick" implies idempotency?
                // For a sequencer, pure random on each step trigger is fine.
                return Math.floor(Math.random() * len);
            default:
                return 0;
        }
    }

    // Helper to trigger manual notes (preview)
    public previewNote(pitch: number) {
        const freq = Tone.Frequency(pitch, "midi").toFrequency();
        this.synth.triggerAttackRelease(freq, "8n");
    }

    public getCurrentStepIndex(): number {
        return this.channelState.lastTriggeredStepIndex;
    }

    // Sound parameter controls
    public setWaveform(type: 'sine' | 'square' | 'sawtooth' | 'triangle') {
        this.synth.set({ oscillator: { type } });
    }

    public setFilterCutoff(freq: number) {
        this.filter.frequency.rampTo(freq, 0.1);
    }

    public setFilterQ(q: number) {
        this.filter.Q.rampTo(q, 0.1);
    }

    public setReverbMix(wet: number) {
        this.reverbGain.gain.rampTo(wet, 0.1);
    }

    public setReverbDecay(decay: number) {
        // Map 0.1-10 to 0-1 approx for roomSize
        // Freeverb roomSize is 0 to 1
        const size = Math.min(0.99, Math.max(0, decay / 10));
        this.reverb.roomSize.value = size;
    }

    public setDelayMix(wet: number) {
        this.delayGain.gain.rampTo(wet, 0.1);
    }

    public setDelayTime(time: string) {
        this.delay.delayTime.value = time;
    }
}
