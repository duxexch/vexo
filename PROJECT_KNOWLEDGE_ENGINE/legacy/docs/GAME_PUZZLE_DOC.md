# VEX Puzzle Challenge — Game Documentation

## Overview
**File**: `client/public/games/puzzle.html`
**Type**: Jigsaw Puzzle — Single Player
**Category**: puzzle / casual
**Status**: Production Ready

---

## Source & Legal
- **Original Source**: Jigsaw-Puzzle-main (rskworld.in)
- **Action Taken**: Complete rewrite from scratch — zero original code retained
- **Removed**: All original branding, PHP backend, ad scripts (profitableratecpm.com), author info, phone numbers
- **Design**: Fully custom VEX theme — indigo/purple/cyan palette with glass effects

---

## Features

| Feature | Description |
|---------|-------------|
| Difficulty | 4 levels: 3×3, 4×4, 5×5, 7×7 |
| Drag & Drop | Mouse + touch support with snap detection |
| Rotation Mode | Optional — pieces can be rotated via scroll/double-click |
| Grid Overlay | Toggle guide lines to help placement |
| Preview | Hold button to show full image overlay |
| Timer | Real-time timer, pauses when game paused |
| Moves Counter | Tracks total piece movements |
| Score System | 0–1000 scale (time penalty + excess moves penalty) |
| Best Time | Per-difficulty localStorage persistence |
| Hint | Random unplaced piece glows briefly |
| Pause | Full pause with modal overlay |
| Gallery | 9 Unsplash nature images + custom image upload |
| Share | Web Share API or clipboard fallback |
| Confetti | Canvas confetti animation on completion |
| Sound | WebAudio API beeps (placement + win) |
| Keyboard | P=pause, H=hint, N=new game, Space=preview |

---

## Technical Architecture

```
Single self-contained HTML file (~350 lines)
├── CSS: VEX design system (--pri, --acc, --gold, glass/blur effects)
├── HTML: RTL Arabic UI, semantic structure
└── JS: IIFE module pattern
    ├── State management (S object)
    ├── Audio engine (WebAudio oscillator)
    ├── Drag system (mouse + touch unified)
    ├── Snap detection (proportional threshold: 10% of tile size)
    ├── Score calculator (time + move penalties)
    ├── Timer system (performance.now + requestAnimationFrame)
    ├── Confetti renderer (canvas 2D particles)
    └── localStorage persistence (best times per difficulty)
```

## CSS Variables (VEX Design System)
```css
--bg: #07060f       /* Dark background */
--surface: #0f0e1a  /* Card surface */
--pri: #6366f1      /* Primary indigo */
--pri-l: #818cf8    /* Primary light */
--acc: #a78bfa      /* Accent purple */
--gold: #fbbf24     /* Score/stat highlight */
--ok: #22c55e       /* Success green */
--danger: #ef4444   /* Error red */
```

## Image Sources
- Unsplash (free commercial license): nature landscapes, oceans, forests
- User can upload their own images via file input

## Scoring Formula
```
score = max(0, (placed/total * 1000) - elapsedSeconds - max(0, moves - totalPieces))
```

---

## Integration Notes
- Served statically from `/games/puzzle.html`
- No backend dependency — fully client-side
- Mobile responsive (85vw board on desktop, 95vw on mobile)
- RTL Arabic interface with English fallback
- localStorage keys: `vex-pz-best-{cols}x{rows}[-r]`
