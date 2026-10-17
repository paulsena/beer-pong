# Asset credits

Every third-party asset in this folder must be CC0 (fonts: OFL) and listed here with its source URL and license.

## Audio (Track E: `client/public/assets/audio/`)

All files below are CC0 1.0 (public domain, https://creativecommons.org/publicdomain/zero/1.0/), by Kenney (https://www.kenney.nl). Renamed; otherwise unmodified.

| File | Source pack | Original file |
|---|---|---|
| `table_bounce_1.ogg`, `table_bounce_2.ogg`, `table_bounce_3.ogg` | [Impact Sounds](https://kenney.nl/assets/impact-sounds) | `impactPlate_light_000/001/002.ogg` |
| `cup_hit_1.ogg`, `cup_hit_2.ogg` | [Impact Sounds](https://kenney.nl/assets/impact-sounds) | `impactSoft_medium_000/001.ogg` |
| `swat_1.ogg` | [Impact Sounds](https://kenney.nl/assets/impact-sounds) | `impactPunch_medium_000.ogg` |
| `ui_click_1.ogg` | [Interface Sounds](https://kenney.nl/assets/interface-sounds) | `click_002.ogg` |

Everything else (throw whoosh, splash, crowd cheer/groan, win/lose jingles, basement and backyard ambience) is synthesized at runtime with WebAudio in `client/src/audio.ts`.

## Avatars (Track E)

The avatar is built from Three.js primitives in `client/src/avatar.ts`; no external assets.

## Fonts (Track E)

"Lilita One" (Juan Montoreano) and "Nunito" (Vernon Adams et al.) from Google Fonts, SIL Open Font License 1.1, loaded via `fonts.googleapis.com` in `client/index.html`.

## Environments (Track D)

Both table environments (`client/src/environments/basement.ts`, `backyard.ts`) are built entirely
from Three.js primitives and canvas-drawn textures (brick, wood planks, posters, rug), so they ship
no model or texture files and need no network access at runtime.
