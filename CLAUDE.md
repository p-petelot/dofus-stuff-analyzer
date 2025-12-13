# KrosPalette - Dofus Stuff Analyzer

## Project Overview

KrosPalette is a web application for creating and analyzing Dofus character skins. It extracts dominant colors from reference images and suggests matching in-game equipment items based on visual similarity and color palette matching.

**Repository:** https://github.com/p-petelot/dofus-stuff-analyzer

## Tech Stack

### Current (Next.js - Legacy)
- **Framework:** Next.js 14.2.5
- **UI:** React 18.3.1
- **Language:** TypeScript 5.4.5 / JavaScript (mixed)
- **Image Processing:** Sharp 0.33.4
- **ML/AI:** TensorFlow.js 4.16.0 + WASM backend
- **Testing:** Vitest 1.6.0

### Target (Vue.js - Migration)
- **Build Tool:** Vite
- **Framework:** Vue 3.4+ (Composition API)
- **Language:** TypeScript 5.4+
- **State Management:** Pinia
- **Routing:** Vue Router 4
- **HTTP Client:** ofetch / native fetch
- **Styling:** CSS Variables + SCSS modules

## Project Structure

```
dofus-stuff-analyzer/
├── src/                      # Vue.js source (new)
│   ├── assets/               # Static assets, styles
│   ├── components/           # Reusable Vue components
│   │   ├── common/           # Shared components (Button, Card, Modal)
│   │   ├── layout/           # Layout components (Navbar, Footer)
│   │   ├── palette/          # Color palette components
│   │   └── items/            # Item display components
│   ├── composables/          # Vue composables (hooks)
│   │   ├── useTheme.ts       # Theme management
│   │   ├── useLanguage.ts    # i18n management
│   │   ├── useItems.ts       # Items fetching & caching
│   │   └── usePalette.ts     # Color extraction
│   ├── stores/               # Pinia stores
│   │   ├── theme.ts          # Theme state
│   │   ├── items.ts          # Items catalog state
│   │   └── selection.ts      # User selections state
│   ├── services/             # API services
│   │   ├── dofusApi.ts       # DofusDB API client
│   │   └── suggestionApi.ts  # Suggestion engine
│   ├── lib/                  # Core business logic
│   │   ├── colors/           # Color manipulation
│   │   ├── vision/           # ML/Image processing
│   │   └── items/            # Item matching logic
│   ├── locales/              # Translation files
│   ├── pages/                # Page components
│   │   ├── HomePage.vue      # Main palette studio
│   │   ├── InspirationPage.vue
│   │   └── VisionPage.vue
│   ├── router/               # Vue Router config
│   ├── types/                # TypeScript definitions
│   ├── App.vue               # Root component
│   └── main.ts               # Entry point
├── public/                   # Static files
├── server/                   # API routes (if SSR needed)
└── tests/                    # Test files
```

## Key Concepts

### Equipment Slots (Types d'items)
- `coiffe` - Hat/Headgear (typeIds: 16, 246)
- `cape` - Cloak (typeIds: 17, 247)
- `bouclier` - Shield (typeIds: 82, 248)
- `familier` - Companion/Pet (typeIds: 18, 97, 121, 196, 207, 249, 250)
- `epauliere` - Shoulder pads (typeId: 299)
- `costume` - Costume/Body (typeId: 199)
- `ailes` - Wings (typeId: 300)

### Color System
- Uses LAB color space for perceptual uniformity
- DeltaE2000 for color distance calculation
- 12 fixed Dofus palette colors for snapping
- Primary, secondary, tertiary color extraction

### Theme System
- **dark** - Dark purple/blue theme
- **light** - Light blue theme
- **dofus** - Green/gold Dofus-inspired theme
- **intelligent** - Adaptive theme based on uploaded image palette

### Internationalization
Supported languages: French (default), English, Spanish, Portuguese, German, Italian, Japanese, Korean, Chinese

## API Integrations

### DofusDB API
```
Base URL: https://api.dofusdb.fr
Endpoints:
  GET /breeds - Character classes
  GET /items - Equipment items
  GET /look - Character look rendering
```

### External Renderers
- Souff: `https://skin.souff.fr/renderer/`
- DofusDB: `https://renderer.dofusdb.fr/kool`

## Commands

```bash
# Development
npm run dev

# Build
npm run build

# Run tests
npm run test

# Type check
npm run typecheck
```

## Architecture Notes

### Suggestion Pipeline
1. Normalize input image to 512x512
2. Locate equipment slots (ROI detection)
3. Extract LAB palettes (global + per-slot)
4. Snap to Dofus palette
5. Run item mode (CLIP + ORB + SSIM verification)
6. Fallback to color mode if needed
7. Apply set bonuses
8. Rank and finalize results

### State Persistence
- Theme: localStorage `krospalette.theme`
- Selections: localStorage `krospalette.selections.v1`
- Items catalog: In-memory cache with request deduplication

## Code Style

- Use TypeScript strict mode
- Vue 3 Composition API with `<script setup>`
- Prefer composables over mixins
- Use Pinia for global state
- CSS custom properties for theming
- Keep components small and focused
