import * as Tone from 'tone';
import { SequencerEngine } from '../audio/SequencerEngine';
import { generateTreeForChannel, buildPlaybackSequence, getEffectivePathValue } from '../audio/FractalTree';
import { createInitialState } from '../model/initialState';
import type { EngineState, Channel, Pattern, ScaleName, PlaybackOrder, TreeNode } from '../model/types';

export class App {
    private state: EngineState;
    private engine: SequencerEngine;

    // Transport
    private playBtn: HTMLButtonElement;
    private stopBtn: HTMLButtonElement;
    private bpmSlider: HTMLInputElement;
    private bpmDisplay: HTMLElement;

    // Fractal
    // Fractal
    private branchesSlider: HTMLInputElement;
    private branchesVal: HTMLElement;
    private pathSlider: HTMLInputElement;
    private pathVal: HTMLElement;
    private branchPlaybackSelect: HTMLSelectElement;
    private randomizeBtn: HTMLButtonElement;

    // Branch Behavior
    private branchConfigContainer: HTMLElement;

    // Sequence Settings
    private scaleSelect: HTMLSelectElement;
    private orderSelect: HTMLSelectElement;
    private lengthInput: HTMLInputElement;

    // Sound Parameters
    private waveformSelect: HTMLSelectElement;
    private filterCutoff: HTMLInputElement;
    private filterCutoffVal: HTMLElement;
    private filterQ: HTMLInputElement;
    private filterQVal: HTMLElement;
    private reverbMix: HTMLInputElement;
    private reverbMixVal: HTMLElement;
    private reverbSize: HTMLInputElement;
    private reverbSizeVal: HTMLElement;
    private delayMix: HTMLInputElement;
    private delayMixVal: HTMLElement;
    private delayTime: HTMLSelectElement;

    // Visualizer
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;

    constructor() {
        this.state = createInitialState();
        this.engine = new SequencerEngine(this.state);

        // Bind UI elements
        this.playBtn = document.getElementById('play-btn') as HTMLButtonElement;
        this.stopBtn = document.getElementById('stop-btn') as HTMLButtonElement;
        this.bpmSlider = document.getElementById('bpm-slider') as HTMLInputElement;
        this.bpmDisplay = document.getElementById('bpm-display') as HTMLElement;

        this.branchesSlider = document.getElementById('branches-slider') as HTMLInputElement;
        this.branchesVal = document.getElementById('branches-val') as HTMLElement;
        this.pathSlider = document.getElementById('path-slider') as HTMLInputElement;
        this.pathVal = document.getElementById('path-val') as HTMLElement;
        this.branchPlaybackSelect = document.getElementById('branch-playback-select') as HTMLSelectElement;
        this.randomizeBtn = document.getElementById('randomize-btn') as HTMLButtonElement;

        this.branchConfigContainer = document.getElementById('branch-config-container') as HTMLElement;

        this.scaleSelect = document.getElementById('scale-select') as HTMLSelectElement;
        this.orderSelect = document.getElementById('order-select') as HTMLSelectElement;
        this.lengthInput = document.getElementById('length-input') as HTMLInputElement;

        this.waveformSelect = document.getElementById('waveform-select') as HTMLSelectElement;
        this.filterCutoff = document.getElementById('filter-cutoff') as HTMLInputElement;
        this.filterCutoffVal = document.getElementById('filter-cutoff-val') as HTMLElement;
        this.filterQ = document.getElementById('filter-q') as HTMLInputElement;
        this.filterQVal = document.getElementById('filter-q-val') as HTMLElement;
        this.reverbMix = document.getElementById('reverb-mix') as HTMLInputElement;
        this.reverbMixVal = document.getElementById('reverb-mix-val') as HTMLElement;
        this.reverbSize = document.getElementById('reverb-size') as HTMLInputElement;
        this.reverbSizeVal = document.getElementById('reverb-size-val') as HTMLElement;
        this.delayMix = document.getElementById('delay-mix') as HTMLInputElement;
        this.delayMixVal = document.getElementById('delay-mix-val') as HTMLElement;
        this.delayTime = document.getElementById('delay-time') as HTMLSelectElement;

        this.canvas = document.getElementById('visualizer') as HTMLCanvasElement;
        this.ctx = this.canvas.getContext('2d')!;

        this.init();
    }

    private init() {
        this.setupEventListeners();
        this.populateScales();
        this.regenerateTree();
        this.updateUIState(); // Initial UI state
        this.startAnimationLoop();
    }

    private get channel(): Channel {
        return this.state.channels[0]; // Single channel only
    }

    private get pattern(): Pattern {
        return this.channel.patterns[this.channel.currentPatternIndex];
    }

    private setupEventListeners() {
        // Transport
        this.playBtn.addEventListener('click', async () => {
            await Tone.start();
            this.engine.start();
        });
        this.stopBtn.addEventListener('click', () => {
            this.engine.stop();
        });
        this.bpmSlider.addEventListener('input', (e) => {
            const val = parseInt((e.target as HTMLInputElement).value);
            this.engine.updateBpm(val);
            this.bpmDisplay.textContent = val.toString();
        });

        // Fractal Controls
        this.branchesSlider.addEventListener('input', (e) => {
            this.pattern.branchesCount = parseInt((e.target as HTMLInputElement).value);
            this.branchesVal.textContent = this.pattern.branchesCount.toString();

            // Update path slider step based on number of branches
            const numPaths = Math.pow(2, this.pattern.branchesCount);
            if (numPaths > 1) {
                this.pathSlider.step = (1 / (numPaths - 1)).toString();
            } else {
                this.pathSlider.step = '1';
            }

            this.regenerateTree();
        });
        this.pathSlider.addEventListener('input', (e) => {
            const val = parseFloat((e.target as HTMLInputElement).value);
            this.pattern.pathValue = val;
            this.pathVal.textContent = val.toFixed(2);
            this.regenerateTree();
        });
        this.branchPlaybackSelect.addEventListener('change', (e) => {
            this.pattern.branchPlaybackOrder = (e.target as HTMLSelectElement).value as any;
            this.regenerateTree();
        });
        this.randomizeBtn.addEventListener('click', () => {
            this.randomizeTrunk();
        });

        // Sequence Settings
        this.scaleSelect.addEventListener('change', (e) => {
            this.pattern.trunk.scale = (e.target as HTMLSelectElement).value as ScaleName;
            this.updateActiveSequence();
        });
        this.orderSelect.addEventListener('change', (e) => {
            this.pattern.trunk.playbackOrder = (e.target as HTMLSelectElement).value as PlaybackOrder;
            this.updateActiveSequence();
        });
        this.lengthInput.addEventListener('change', (e) => {
            const len = parseInt((e.target as HTMLInputElement).value);
            this.pattern.trunk.length = Math.max(1, Math.min(32, len));
            this.regenerateTree();
        });

        const ratchetsToggle = document.getElementById('ratchets-toggle') as HTMLInputElement;
        ratchetsToggle.addEventListener('change', (e) => {
            this.state.ratchetsEnabled = (e.target as HTMLInputElement).checked;
        });

        // Sound Parameters
        this.waveformSelect.addEventListener('change', (e) => {
            const type = (e.target as HTMLSelectElement).value as 'sine' | 'square' | 'sawtooth' | 'triangle';
            this.engine.setWaveform(type);
        });
        this.filterCutoff.addEventListener('input', (e) => {
            const val = parseInt((e.target as HTMLInputElement).value);
            this.engine.setFilterCutoff(val);
            this.filterCutoffVal.textContent = val.toString();
        });
        this.filterQ.addEventListener('input', (e) => {
            const val = parseFloat((e.target as HTMLInputElement).value);
            this.engine.setFilterQ(val);
            this.filterQVal.textContent = val.toFixed(1);
        });
        this.reverbMix.addEventListener('input', (e) => {
            const val = parseFloat((e.target as HTMLInputElement).value);
            this.engine.setReverbMix(val);
            this.reverbMixVal.textContent = val.toFixed(2);
        });
        this.reverbSize.addEventListener('input', (e) => {
            const val = parseFloat((e.target as HTMLInputElement).value);
            this.engine.setReverbDecay(val);
            this.reverbSizeVal.textContent = val.toFixed(1);
        });
        this.delayMix.addEventListener('input', (e) => {
            const val = parseFloat((e.target as HTMLInputElement).value);
            this.engine.setDelayMix(val);
            this.delayMixVal.textContent = val.toFixed(2);
        });
        this.delayTime.addEventListener('change', (e) => {
            const val = (e.target as HTMLSelectElement).value;
            this.engine.setDelayTime(val);
        });

        // Canvas Interaction - Click to toggle gate + assign random pitch
        this.canvas.addEventListener('click', (e) => {
            this.handleCanvasClick(e);
        });

        // Branch Behavior Controls
        document.querySelectorAll('.branch-select').forEach(el => {
            el.addEventListener('change', (e) => {
                const target = e.target as HTMLSelectElement;
                const level = parseInt(target.dataset.level!);
                const side = target.dataset.side as 'left' | 'right';
                const val = target.value as any;

                if (this.pattern.branchConfig[level]) {
                    this.pattern.branchConfig[level][side] = val;
                    this.handleBranchSelectChange(target);
                    this.regenerateTree();
                }
            });
        });

        document.querySelectorAll('.branch-param').forEach(el => {
            el.addEventListener('change', (e) => {
                const target = e.target as HTMLInputElement;
                const level = parseInt(target.dataset.level!);
                const side = target.dataset.side as 'left' | 'right';
                const val = parseFloat(target.value);

                if (this.pattern.branchConfig[level]) {
                    if (side === 'left') this.pattern.branchConfig[level].leftParam = val;
                    else this.pattern.branchConfig[level].rightParam = val;
                    this.regenerateTree();
                }
            });
        });

        // Branch Steppers
        document.querySelectorAll('.branch-stepper .btn-stepper').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const target = e.target as HTMLButtonElement;
                const wrapper = target.parentElement!;
                const input = wrapper.querySelector('input') as HTMLInputElement;
                const action = target.dataset.action;

                let val = parseInt(input.value);
                if (action === 'inc') val++;
                else val--;

                input.value = val.toString();
                // Trigger change event manually
                input.dispatchEvent(new Event('change'));
            });
        });

        // Length Steppers
        const lengthInput = this.lengthInput;
        document.getElementById('length-inc')?.addEventListener('click', () => {
            let val = parseInt(lengthInput.value);
            if (val < 32) {
                val++;
                lengthInput.value = val.toString();
                lengthInput.dispatchEvent(new Event('change'));
            }
        });
        document.getElementById('length-dec')?.addEventListener('click', () => {
            let val = parseInt(lengthInput.value);
            if (val > 1) {
                val--;
                lengthInput.value = val.toString();
                lengthInput.dispatchEvent(new Event('change'));
            }
        });
    }

    private populateScales() {
        const scales: ScaleName[] = [
            'chromatic', 'major', 'minor', 'major-pentatonic', 'minor-pentatonic',
            'harmonic-minor', 'whole-tone', 'unquantized'
        ];
        scales.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s;
            opt.textContent = s.toUpperCase();
            if (s === 'minor') opt.selected = true;
            this.scaleSelect.appendChild(opt);
        });
    }

    private regenerateTree() {
        this.channel.generatedTree = generateTreeForChannel(this.channel);
        this.updateActiveSequence();
    }

    private updateActiveSequence() {
        this.channel.activeSequence = buildPlaybackSequence(this.channel);
    }

    private randomizeTrunk() {
        const trunk = this.pattern.trunk;
        for (let i = 0; i < trunk.length; i++) {
            const step = trunk.steps[i];
            step.gateOn = Math.random() > 0.5;
            step.pitch = Math.floor(Math.random() * 25) - 12; // -12 to +12
            step.ratchets = Math.random() > 0.8 ? 2 : 1;
        }
        this.regenerateTree();
    }

    // --- Visualization & Interaction ---

    private handleCanvasClick(e: MouseEvent) {
        const rect = this.canvas.getBoundingClientRect();
        // Scale mouse coordinates to canvas resolution (800x800)
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;

        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;

        const seq = this.pattern.trunk;
        const totalSteps = seq.length;
        const baseRadius = 120; // Depth 0 radius

        let closestIndex = -1;
        let minDist = 20; // Hit radius

        for (let i = 0; i < totalSteps; i++) {
            // Match visual angle calculation for Depth 0
            const angle = ((i + 0.5) / totalSteps) * Math.PI * 2 - Math.PI / 2;
            const sx = centerX + Math.cos(angle) * baseRadius;
            const sy = centerY + Math.sin(angle) * baseRadius;

            const dx = x - sx;
            const dy = y - sy;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < minDist) {
                minDist = dist;
                closestIndex = i;
            }
        }

        if (closestIndex !== -1) {
            const step = seq.steps[closestIndex];
            step.gateOn = !step.gateOn;

            // If toggling ON, assign random pitch (Silent)
            if (step.gateOn) {
                step.pitch = Math.floor(Math.random() * 25) - 12;
            }

            this.regenerateTree();
        }
    }

    private startAnimationLoop() {
        const loop = () => {
            this.draw();
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    }

    private draw() {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;
        const centerX = w / 2;
        const centerY = h / 2;

        // Clear background
        ctx.clearRect(0, 0, w, h);

        const engineStepIndex = this.engine.getCurrentStepIndex();

        const tree = this.channel.generatedTree;
        if (!tree) return;

        const trunk = this.pattern.trunk;
        const maxDepth = this.pattern.branchesCount;
        const seqLen = trunk.length;

        // Calculate path bits for highlighting
        const maxPaths = Math.pow(2, maxDepth);
        const effectivePathValue = getEffectivePathValue(this.pattern);
        const pathIndex = Math.floor(effectivePathValue * (maxPaths - 0.0001));
        const pathBits = pathIndex.toString(2).padStart(maxDepth, '0');

        // Helper to collect nodes by depth
        const nodesByDepth: (TreeNode | null)[][] = [];
        for (let d = 0; d <= maxDepth; d++) {
            nodesByDepth[d] = [];
        }

        const traverse = (node: TreeNode, d: number, idx: number) => {
            nodesByDepth[d][idx] = node;
            if (node.left) traverse(node.left, d + 1, idx * 2);
            if (node.right) traverse(node.right, d + 1, idx * 2 + 1);
        };

        traverse(tree.root, 0, 0);

        // Draw connecting lines and steps
        const baseRadius = 120;
        const ringSpacing = 75;

        // Draw Connecting Lines FIRST
        ctx.lineWidth = 1;

        // We draw lines FROM depth d TO depth d+1
        // So we loop d from 0 to maxDepth - 1
        for (let d = 0; d < maxDepth; d++) {
            const currentRadius = baseRadius + d * ringSpacing;
            const nextRadius = baseRadius + (d + 1) * ringSpacing;

            const nodes = nodesByDepth[d];
            // If no nodes at this depth, skip
            if (!nodes || nodes.length === 0) continue;

            const segmentCount = Math.pow(2, d);

            // Determine active segment index at this depth
            let activeIndex = 0;
            if (d > 0) {
                const currentPathBits = pathBits.substring(0, d);
                activeIndex = parseInt(currentPathBits, 2);
            }

            for (let i = 0; i < segmentCount; i++) {
                const node = nodes[i];
                // If node is missing (shouldn't happen in full tree), skip
                if (!node) continue;

                const isActive = (i === activeIndex);
                const steps = node.sequence.steps;
                const stepCount = Math.min(steps.length, seqLen);

                for (let s = 0; s < stepCount; s++) {
                    // Current Step Position
                    // Interleaved Index: s * 2^d + i
                    const totalSteps = seqLen * Math.pow(2, d);
                    const globalIndex = s * Math.pow(2, d) + i;

                    const angle = (globalIndex + 0.5) / totalSteps * Math.PI * 2 - Math.PI / 2;

                    const sx = centerX + Math.cos(angle) * currentRadius;
                    const sy = centerY + Math.sin(angle) * currentRadius;

                    // Children Indices in Next Ring (Depth d+1)
                    // Left Child: s * 2^(d+1) + 2*i
                    // Right Child: s * 2^(d+1) + 2*i + 1
                    const nextTotalSteps = seqLen * Math.pow(2, d + 1);

                    const leftGlobalIndex = s * Math.pow(2, d + 1) + 2 * i;
                    const rightGlobalIndex = s * Math.pow(2, d + 1) + 2 * i + 1;

                    const angleL = (leftGlobalIndex + 0.5) / nextTotalSteps * Math.PI * 2 - Math.PI / 2;
                    const angleR = (rightGlobalIndex + 0.5) / nextTotalSteps * Math.PI * 2 - Math.PI / 2;

                    const sxL = centerX + Math.cos(angleL) * nextRadius;
                    const syL = centerY + Math.sin(angleL) * nextRadius;
                    const sxR = centerX + Math.cos(angleR) * nextRadius;
                    const syR = centerY + Math.sin(angleR) * nextRadius;

                    // Draw V Shape
                    // Determine which branch is active for highlighting
                    // pathBits string has length maxDepth. 
                    // At depth 'd', the bit at index 'd' tells us if we go Left ('0') or Right ('1')

                    const pathBit = pathBits[d];
                    const isLeftActive = (pathBit === '0');

                    // Get current step to check for gate
                    const step = steps[s];
                    const hasGate = step ? step.gateOn : false;

                    // Only highlight if the PARENT is active AND this is the correct branch AND the step has a gate
                    const highlightLeft = isActive && isLeftActive && hasGate;
                    const highlightRight = isActive && !isLeftActive && hasGate;

                    ctx.beginPath();
                    ctx.moveTo(sx, sy);
                    ctx.lineTo(sxL, syL);
                    ctx.strokeStyle = highlightLeft ? '#bbb' : '#222';
                    ctx.lineWidth = highlightLeft ? 2 : 1;
                    ctx.stroke();

                    ctx.beginPath();
                    ctx.moveTo(sx, sy);
                    ctx.lineTo(sxR, syR);
                    ctx.strokeStyle = highlightRight ? '#bbb' : '#222';
                    ctx.lineWidth = highlightRight ? 2 : 1;
                    ctx.stroke();
                }
            }
        }

        // Draw Rings & Steps
        for (let d = 0; d <= maxDepth; d++) {
            const radius = baseRadius + d * ringSpacing;
            const nodes = nodesByDepth[d];
            const segmentCount = Math.pow(2, d);
            const totalStepsAtDepth = seqLen * segmentCount;

            // Highlight Active Segment (Optional, drawn on top)
            let activeIndex = 0;
            if (d > 0) {
                const currentPathBits = pathBits.substring(0, d);
                activeIndex = parseInt(currentPathBits, 2);
            }

            // Determine if this ring is currently active (playing)
            // Determine if this ring is currently active (playing)
            // engineStepIndex is already defined at top of draw()
            let isRingActive = false;
            if (engineStepIndex !== -1) {
                if (this.channel.activeSequence && this.channel.activeSequence.steps.length > 0) {
                    const seq = this.channel.activeSequence;
                    const stepIdx = engineStepIndex % seq.steps.length;
                    const step = seq.steps[stepIdx];
                    const activeDepth = step.depth !== undefined ? step.depth : 0;
                    if (activeDepth === d) isRingActive = true;
                } else {
                    // Fallback for initial state or error
                    const totalPathSteps = (maxDepth + 1) * seqLen;
                    const currentPos = engineStepIndex % totalPathSteps;
                    const currentDepth = Math.floor(currentPos / seqLen);
                    if (currentDepth === d) isRingActive = true;
                }
            }

            // Draw Full Ring (Polygon)
            ctx.beginPath();
            for (let k = 0; k < totalStepsAtDepth; k++) {
                const angle = (k + 0.5) / totalStepsAtDepth * Math.PI * 2 - Math.PI / 2;
                const x = centerX + Math.cos(angle) * radius;
                const y = centerY + Math.sin(angle) * radius;
                if (k === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.strokeStyle = isRingActive ? '#bbb' : '#222';
            ctx.lineWidth = (d === 0) ? 2 : 1;
            if (isRingActive) ctx.lineWidth = 2;
            ctx.stroke();

            // Draw Steps
            for (let i = 0; i < segmentCount; i++) {
                const node = nodes[i];
                if (!node) continue;

                const isActiveSegment = (i === activeIndex);
                const isTrunk = (d === 0);
                const steps = node.sequence.steps;
                const stepCount = Math.min(steps.length, seqLen);

                for (let s = 0; s < stepCount; s++) {
                    const step = steps[s];
                    const globalIndex = s * Math.pow(2, d) + i;
                    const angle = (globalIndex + 0.5) / totalStepsAtDepth * Math.PI * 2 - Math.PI / 2;

                    const sx = centerX + Math.cos(angle) * radius;
                    const sy = centerY + Math.sin(angle) * radius;

                    // Check if parent has a gate (for branches only)
                    let parentHasGate = true;
                    if (d > 0 && isActiveSegment) {
                        // Parent is at depth d-1, same step index s
                        // Need to find which segment at d-1 is the parent
                        const parentSegmentIndex = Math.floor(i / 2);
                        const parentNode = nodesByDepth[d - 1][parentSegmentIndex];
                        if (parentNode && parentNode.sequence.steps[s]) {
                            parentHasGate = parentNode.sequence.steps[s].gateOn;
                        }
                    }

                    // Highlight Logic
                    // If this step is in the active path (isActiveSegment) AND this ring is active, make it bright
                    // If just in active path, make it semi-bright
                    // But only if parent has a gate

                    let stepColor = '#111';
                    let strokeColor = '#666';

                    if (isActiveSegment && parentHasGate) {
                        strokeColor = '#fff';
                        if (step.gateOn) stepColor = '#aaa';

                        if (isRingActive) {
                            strokeColor = '#fff';
                            if (step.gateOn) stepColor = '#fff';
                        }
                    } else {
                        if (step.gateOn) stepColor = '#888';
                    }

                    ctx.beginPath();
                    const dotSize = isTrunk ? 6 : Math.max(3, 6 - d);
                    ctx.arc(sx, sy, dotSize, 0, Math.PI * 2);

                    ctx.fillStyle = stepColor;
                    ctx.fill();

                    ctx.strokeStyle = strokeColor;
                    ctx.lineWidth = 1;
                    ctx.stroke();

                    // Visualize Ratchets
                    if (step.gateOn && step.ratchets > 1 && this.state.ratchetsEnabled) {
                        ctx.fillStyle = '#000';
                        ctx.beginPath();
                        ctx.arc(sx, sy, dotSize * 0.4, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }
            }
        }

        // Draw Playhead
        // Draw Playhead
        // engineStepIndex is already defined at top of draw()

        if (engineStepIndex !== -1) {
            const totalPathSteps = (maxDepth + 1) * seqLen;

            // Use the cached active sequence to determine the exact step being played
            // The engineStepIndex corresponds to the index in activeSequence.steps
            if (this.channel.activeSequence && this.channel.activeSequence.steps.length > 0) {
                const seq = this.channel.activeSequence;
                const stepIdx = engineStepIndex % seq.steps.length;
                const step = seq.steps[stepIdx];

                // Use the tagged depth directly!
                const currentDepth = step.depth !== undefined ? step.depth : 0;

                // We also need stepInSeq for positioning within the ring.
                // Since we don't have the original index in the step, we have to infer it?
                // Or we can just use the fact that steps are flattened.
                // But wait, if we shuffled, the position in the ring is random?
                // No, the ring visualization is static (Forward).
                // The cursor should jump to the correct spot on the ring.
                // We need to know which "slot" in the ring this step corresponds to.
                // If we shuffled, we lost that info unless we tag it too.
                // But for now, let's just highlight the ring.
                // To highlight the specific dot, we'd need the original index.
                // Let's assume for now we just want to show the correct ring (depth).

                // For the cursor position (angle), if the sequence is random, the cursor should probably 
                // jump to a random position on that ring?
                // If we don't know the original index, we can't place it correctly.
                // Let's add 'originalIndex' to Step in a future update if needed.
                // For now, let's just map linear time to angle for the cursor, 
                // BUT use the correct depth ring.

                // Actually, if we use the linear map for angle, it might look weird if the note is actually elsewhere.
                // But since the visualizer draws the tree in a fixed structure, 
                // and the audio plays a specific step...
                // If we want the cursor to be on the *exact* step that is playing, we need to know which step it is in the tree.
                // The 'step' object reference is the same!
                // So we can find the step in the tree nodes?
                // That's expensive to search every frame.

                // Compromise:
                // 1. Identify the Depth (Ring) -> Done via step.depth.
                // 2. Identify the Angle -> Just use a modulo of the step index? 
                // If we are in Random mode, the step index in the *playback* sequence is sequential (0, 1, 2...).
                // But the step in the *tree* is random.
                // If we want to show the cursor on the correct dot, we need to know the dot's index.

                // Let's just use a simple mapping for now:
                // If Random, just spin around the ring?
                // Or just use the currentStepInSeq calculated linearly as a fallback for angle.

                // Let's stick to the previous linear mapping for angle, but use the CORRECT depth.
                // This ensures the cursor is on the correct ring, even if the angle is "linear" while the sound is "random".
                // It's a reasonable abstraction for "Random" (cursor moves smoothly, notes fire randomly).
                // Wait, user said "Sequence Order RAND jumps from branch to branch".
                // I fixed that in logic.
                // Now user says "Branch highlighting should follow Branch playback".
                // My fix using step.depth ensures the correct Ring is highlighted.

                // Use originalIndex if available (for correct position in Reverse/Random/Pendulum)
                // Fallback to modulo if not (e.g. legacy or error)
                let currentStepInSeq = step.originalIndex !== undefined ? step.originalIndex : (engineStepIndex % seqLen);

                let activeIndex = 0;
                if (currentDepth > 0) {
                    const currentPathBits = pathBits.substring(0, currentDepth);
                    activeIndex = parseInt(currentPathBits, 2);
                }

                // Calculate position using Interleaved Logic
                const totalSteps = seqLen * Math.pow(2, currentDepth);
                const globalIndex = currentStepInSeq * Math.pow(2, currentDepth) + activeIndex;
                const angle = (globalIndex + 0.5) / totalSteps * Math.PI * 2 - Math.PI / 2;

                const radius = baseRadius + currentDepth * ringSpacing;
                const x = centerX + Math.cos(angle) * radius;
                const y = centerY + Math.sin(angle) * radius;

                // Draw Cursor
                ctx.beginPath();
                ctx.arc(x, y, 12, 0, Math.PI * 2);
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
                ctx.lineWidth = 2;
                ctx.stroke();

                // Glow
                ctx.beginPath();
                ctx.arc(x, y, 8, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
                ctx.fill();
            }

        }

    }

    private updateUIState() {
        // Update values
        this.branchesSlider.value = this.pattern.branchesCount.toString();
        this.branchesVal.textContent = this.pattern.branchesCount.toString();
        this.pathSlider.value = this.pattern.pathValue.toString();
        this.pathVal.textContent = this.pattern.pathValue.toFixed(2);

        document.querySelectorAll('.branch-select').forEach(el => {
            this.handleBranchSelectChange(el as HTMLSelectElement);
        });
    }

    private handleBranchSelectChange(select: HTMLSelectElement) {
        const level = select.dataset.level!;
        const side = select.dataset.side!;
        const val = select.value;

        // Find corresponding stepper wrapper
        // The wrapper is a sibling of the select's parent or in the same container
        // Based on HTML: select is sibling to .stepper-wrapper
        const wrapper = select.parentElement?.querySelector('.stepper-wrapper') as HTMLElement;

        if (wrapper) {
            // Hide for invert
            if (val === 'invert') {
                wrapper.style.display = 'none';
            } else {
                wrapper.style.display = 'flex';
                // Ensure input has value
                const input = wrapper.querySelector('input') as HTMLInputElement;
                if (input && input.value === '') input.value = '0';
            }
        }
    }
}

