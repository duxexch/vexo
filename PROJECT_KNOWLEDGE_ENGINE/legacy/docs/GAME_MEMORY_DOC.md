# VEX Memory Challenge — Game Documentation

## Overview
**File**: `client/public/games/memory.html`
**Type**: Color Sequence Memory (Simon-like) — Single Player
**Category**: puzzle / memory / casual
**Status**: Production Ready

---

## Source & Legal
- **Original Source**: Color-Sequence-Memory-main (rskworld.in)
- **Action Taken**: Complete rewrite from scratch — zero original code retained
- **Removed**: All original branding, PHP backend, ad scripts (profitableratecpm.com), author info
- **Design**: Fully custom VEX theme — 4 custom pads (indigo, cyan, purple, gold) with radial glow effects

---

## Features

| Feature | Description |
|---------|-------------|
| 4 Color Pads | Indigo (#6366f1), Cyan (#22d3ee), Purple (#a855f7), Gold (#fbbf24) |
| Sequence Play | Computer plays growing sequence, player repeats |
| Levels | Progressive — each success adds +1 to sequence length |
| Scoring | 10×level per correct pad + 50×level per round completion |
| Lives System | 3 hearts — lose one per wrong answer |
| Strict Mode | Toggle — one mistake = game over (no lives) |
| Hints | 3 per game — flashes the next correct pad (-30 score) |
| Replay | Re-watch current sequence at any time (-20 score) |
| Speed Control | 3 speeds: Fast (600ms), Normal (400ms), Rocket (250ms) |
| Best Score | Persisted in localStorage |
| Sound | WebAudio sine tones: E4, G4, C5, E5 (one per pad) |
| Error Sound | Sawtooth 120Hz buzz on wrong input |
| Keyboard | 1–4 keys map to pads, R = replay |
| Share | Web Share API / clipboard fallback |
| Game Over Modal | Shows level, score, longest sequence |

---

## Technical Architecture

```
Single self-contained HTML file (~300 lines)
├── CSS: VEX design system with pad-specific gradients
├── HTML: RTL Arabic UI, 2×2 pad grid, stats bar, modals
└── JS: IIFE module pattern
    ├── State (G object): seq, level, score, lives, hints, speed
    ├── Audio engine: 4 sine oscillators (E4/G4/C5/E5) + error buzz
    ├── Sequence player: async/await with configurable speed
    ├── Input handler: click + touchstart with lock mechanism
    ├── Lives system: visual hearts with loss animation
    ├── Hint system: flashes next correct pad
    ├── Score persistence: localStorage key 'vex-mem-best'
    └── Game over flow: modal with share + restart
```

## Pad Design (No Original Colors Used)
| Pad | Original Game | VEX Version |
|-----|--------------|-------------|
| 0 | Green | Indigo (#6366f1 → #4338ca) |
| 1 | Red | Cyan (#22d3ee → #0891b2) |
| 2 | Yellow | Purple (#a855f7 → #7c3aed) |
| 3 | Blue | Gold (#fbbf24 → #d97706) |

## Audio Tones
| Pad | Frequency | Note |
|-----|-----------|------|
| 0 | 329.6 Hz | E4 |
| 1 | 392.0 Hz | G4 |
| 2 | 523.3 Hz | C5 |
| 3 | 659.3 Hz | E5 |

## Speed Settings
| Label | Delay (ms) | Description |
|-------|-----------|-------------|
| سريع (Fast) | 600ms | Beginner friendly |
| عادي (Normal) | 400ms | Default |
| صاروخ (Rocket) | 250ms | Expert challenge |

---

## Scoring Formula
```
Per correct pad:   +10 × current_level
Per round clear:   +50 × current_level
Hint used:         -30
Replay used:       -20
```

---

## Integration Notes
- Served statically from `/games/memory.html`
- No backend dependency — fully client-side
- Mobile responsive (75vw pad grid on desktop, 85vw on mobile)
- RTL Arabic interface
- localStorage key: `vex-mem-best`
- Touch-optimized with passive:false for pad input
