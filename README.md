# Fractal Sequencer

A generative music sequencer that creates evolving patterns using fractal tree structures. Each branch of the tree can transform the sequence through transposition, inversion, or mutation, creating complex and organic musical patterns.

🎵 **[Live Demo](https://guardabrazo.github.io/fractal-seq/)**

## Features

- **Fractal Tree Generation**: Create branching sequences with configurable depth
- **Branch Transformations**: Transform sequences using:
  - **Transpose**: Shift pitch up/down by semitones
  - **Invert**: Mirror the melody around a pivot point
  - **Mutate**: Introduce controlled randomness
- **Path Selection**: Navigate different branches of the fractal tree
- **Ratcheting**: Add rhythmic subdivisions to steps
- **Real-time Audio**: Powered by Tone.js for high-quality synthesis
- **Visual Feedback**: Interactive radial visualization of the fractal structure
- **Mobile Responsive**: Works on desktop and mobile devices

## Controls

### Fractal Controls
- **Branches**: Set the depth of the fractal tree (0-3 levels)
- **Path**: Choose which path through the tree to play
- **Playback**: Select playback order (forward, reverse, pendulum, random)

### Branch Behavior
Configure how each level of the tree transforms the sequence:
- Set independent behaviors for left and right branches
- Adjust transformation parameters per branch

### Sequence Settings
- **Length**: Number of steps in the sequence (1-32)
- **Scale**: Choose from major, minor, or chromatic scales
- **Order**: Pattern playback order

### Sound
- **Waveform**: Sine, square, sawtooth, or triangle
- **Filter**: Cutoff frequency and resonance controls
- **Reverb**: Mix amount for spatial depth

## Local Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Deployment

Deploy to GitHub Pages:

```bash
npm run deploy
```

## Technical Stack

- **TypeScript** - Type-safe development
- **Vite** - Fast build tooling
- **Tone.js** - Web Audio framework
- **Vanilla HTML/CSS** - No framework overhead

## Credits

Created by [Guardabrazo](https://guardabrazo.com)

Orchestrated by Google Antigravity

## License

MIT
