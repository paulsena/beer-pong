# Beer Pong 3D: 2-Player Online Game

## Context
A 3D beer pong game for two players online, playable in a desktop browser by sending a friend a link. It is built mostly by Claude Code, with Claude subagents and the Codex plugin working in parallel for a fast first pass. This is a new project with no existing code.

## Stack
| Layer | Choice |
|---|---|
| Language | TypeScript (client, server, shared) |
| 3D rendering | Three.js + `postprocessing` (bloom, SMAA) |
| Physics | Rapier (`@dimforge/rapier3d-compat`) |
| Build/dev | Vite; npm workspaces; `concurrently` for `npm run dev` |
| Multiplayer | Node + `ws` WebSocket server, room codes |
| Tests | Vitest (server/rules), Playwright (screenshots + 2-tab smoke test) |
| Hosting (later) | Client on Cloudflare Pages/Netlify; server on Fly.io/Render |

We use a web stack rather than Unity or Godot because it is all text files, reloads instantly, and multiplayer only needs a shared URL.

## Game design
- **Platform:** desktop browsers only.
- **Camera:** first-person at eye level, looking down the table. It tracks the ball a little while it flies, and you see the opponent's avatar across the table.
- **Throwing:** mouse flick. Grab the ball, drag and release; release speed and direction set power and aim, with a small random wobble.
- **Tables (picked by the host in the main menu):**
  - *Frat basement:* sticky wood table, string lights, red Solo cups, posters, couch, a dim warm feel.
  - *Backyard at sunset:* folding table on grass, golden-hour sky, fairy lights, a cooler, a fence.
- **Rules:**
  - 10 cups per side in a 4-3-2-1 triangle; the first to clear the opponent's cups wins.
  - 2 throws per turn; if both land, you get both balls back.
  - Bounce shot: the ball hits the table, then a cup. It counts for 2 cups (the defender picks the second). After the bounce, the defender can **swat** by clicking the ball.
  - Re-racks: 2 per game, chosen from preset shapes (diamond, line, triangle, zipper) at the start of your turn.
- **Social:** low-poly avatar with a color you pick, an emote wheel (cheer, taunt, facepalm, "NICE") and short quick-chat messages.
- **Main menu:** name + avatar color → Create room (pick table) / Join by code.

## Art direction: will it look good?
Yes, if we treat lighting and color as their own task, not an afterthought. Code-only games usually look like "programmer art" because they have flat lighting and random colors, not because of the shapes. The plan:
- **Renderer:** ACES tone mapping, sRGB output, soft shadows (PCFSoft). The environment map comes from `RoomEnvironment`, so plastic and glossy surfaces catch light.
- **Lighting per table:**
  - Basement: warm key light, low ambient light, emissive string-light bulbs + bloom.
  - Backyard: low orange sun, blue hemisphere fill, gradient sky dome, light fog.
- **Fixed palettes:** each environment file starts with a small fixed palette of 6-8 colors, and every material uses only those.
- **Materials:** flat-shaded `MeshStandardMaterial`. Cups are red outside and white inside, with a beer surface inside. The ball is slightly glossy and white.
- **Assets:** CC0 low-poly packs (Kenney, Quaternius, Poly Pizza) as glTF for furniture, props and avatars. Kenney audio packs for the clink, splash and crowd sounds. Cups, ball and table are built in code so they match the physics exactly. Each asset's source and license go in `client/public/assets/CREDITS.md`.
- **Juice:** the cup wobbles when hit, a splash particle on a sink, a short camera shake, a floating text pop ("SPLASH!", "BOUNCE x2"), and a ball trail.
- **Visual check:** a Playwright script takes screenshots of each table from fixed camera angles (`npm run shots`). I look at them after each visual change and fix what looks off. This is the main guard against ugly results.

## Networking model
- The server is authoritative on rooms, turns, cup state, re-racks remaining and the win.
- The thrower's client runs the physics and streams the ball's position and rotation at about 30 Hz. The opponent interpolates between updates. The thrower reports the result: sink(cupId, bounced), miss, or swatted.
- **Swat:** the defender sends a `swat` message, and the thrower's physics applies it if the ball hasn't sunk yet.
- Emotes, chat and re-rack choices are relayed by the server. If a player disconnects, the room stays open for 60 seconds so they can rejoin.

## Project layout: `~/beer-pong` (WSL Linux filesystem)
```
beer-pong/
  package.json               # workspaces: shared, server, client
  shared/src/protocol.ts     # ALL message types (client<->server)
  shared/src/constants.ts    # table/cup/ball dimensions, rack layouts, physics tuning
  shared/src/rules.ts        # pure game-state reducer (turns, balls back, bounce, re-rack, win)
  server/src/index.ts        # ws server, rooms, uses shared/rules
  server/test/*.test.ts
  client/src/main.ts         # app bootstrap, state machine (menu -> lobby -> game)
  client/src/scene.ts        # renderer, camera, post-processing
  client/src/environments/   # basement.ts, backyard.ts, palette per env
  client/src/physics.ts      # Rapier world, cup colliders, sink/bounce detection
  client/src/throw.ts        # mouse flick input
  client/src/net.ts          # typed ws client
  client/src/avatar.ts       # glTF avatar + emote anims
  client/src/fx.ts           # particles, trail, shake, text pops
  client/src/audio.ts
  client/src/ui/             # menu, HUD, emote wheel, re-rack picker, cup picker
  client/public/assets/      # CC0 glTF + audio, CREDITS.md
  tools/screenshots.ts       # Playwright scene screenshots
```
Git: `git init`, then a private GitHub repo via `gh repo create`.

## Execution plan: instructions for the orchestrating session
The session that runs this plan is the **orchestrator**. It builds the foundation itself, hands tracks to Claude subagents and Codex, merges their work and does the integration. Codex and subagent sessions start with no context, so every prompt they get must be self-contained.

### Step 0: foundation (orchestrator does this itself; sequential)
1. Create `~/beer-pong`, then run `git init` and `gh repo create beer-pong --private --source . --push`.
2. **Copy this plan into the repo as `PLAN.md`.** Agents read it from there; every agent prompt says "read PLAN.md first".
3. Scaffold the workspaces, Vite, the TypeScript configs (strict), and the `dev`, `test`, `typecheck`, `shots` and `smoke` scripts.
4. Write the **contracts** in full:
   - `shared/src/protocol.ts`: every message type, as a discriminated union.
   - `shared/src/constants.ts`: dimensions, rack layouts, physics tuning.
   - `shared/src/rules.ts`: the `GameState` type, the action types and the `reduce(state, action)` signature, with a `TODO` body.
5. Create a stub `scene.ts` that renders the table and cups, plus a stub `main.ts`. Each track gets an empty module with the agreed exports.
6. Add `tools/screenshots.ts` (Playwright).
7. Commit as "foundation".
8. Confirm Codex is still ready: `node "$PLUGIN/scripts/codex-companion.mjs" setup --json` should show `"ready": true`. (It was verified on 2026-10-17: codex-cli 0.125.0, ChatGPT login active.) If it isn't ready, give tracks B and C to Claude subagents instead.

### Step 1: parallel tracks (all launched in one turn)
| Track | Owner | Owns (may edit) | Done when |
|---|---|---|---|
| A. Physics + throw feel | Orchestrator | physics.ts, throw.ts, fx.ts | Flick throws feel good; sink + bounce detected |
| B. Rules engine + tests | **Codex** | shared/src/rules.ts, shared/test/** | `reduce` implements all rules in Game design; Vitest covers each rule |
| C. Server + net client | **Codex** | server/**, client/src/net.ts | Room create/join/rejoin, turn gating via `reduce`, relay; server tests pass |
| D. Environments + art | Claude subagent | client/src/environments/**, scene.ts (lighting/post only), client/public/assets/**, CREDITS.md | Both tables match Art direction; screenshots reviewed |
| E. UI + avatars + audio | Claude subagent | client/src/ui/**, avatar.ts, audio.ts, client/index.html styles | Menu, HUD, emote wheel, re-rack + cup pickers, avatar emotes, sounds |

**Rules for all agents (put these in every prompt):**
- Read `PLAN.md` and the `shared/` contracts first.
- **Edit only the files your track owns.** Never change `shared/src/protocol.ts` or `constants.ts`. If a contract needs to change, say so in your final report and the orchestrator will make the change.
- Before finishing, make sure `npm run typecheck` and `npm test` pass. Commit on your branch with a clear message.
- End with a short report: what you built, what you stubbed, and any contract changes you need.

**Launching Claude subagents (tracks D, E):**
- Use the Agent tool with `subagent_type: "general-purpose"` and `isolation: "worktree"`, so each works on its own branch. They run in the background.
- Each prompt contains the track's row from the table, the agent rules above, the plan sections that apply (Art direction for D; Game design → Social/Main menu for E), and the acceptance criteria.
- Track D must run `npm run shots` and look at the PNGs itself before reporting.
- Don't poll: wait for the completion notification.

**Launching Codex (tracks B, C): call the companion script directly, not the `codex-rescue` agent.**
Why: the `codex:codex-rescue` agent passes no `--cwd`, so Codex would run (and write) in the orchestrator's current directory, the main tree. Its `--background` mode also doesn't notify when the job finishes.
- Plugin path: `PLUGIN=/home/psenatil/.claude/plugins/cache/openai-codex/codex/1.0.6` (if the version changed, run `ls ~/.claude/plugins/cache/openai-codex/codex/`).
- **Before writing prompts,** read `$PLUGIN/skills/gpt-5-4-prompting/SKILL.md` and its `references/` (prompt-blocks.md, codex-prompt-recipes.md). Write each Codex prompt in that XML-block style: `<task>`, `<completeness_contract>`, `<verification_loop>`, `<action_safety>` (edit only the owned files) and `<compact_output_contract>` (files touched, tests run, contract changes needed).
- Create one worktree per track: `git worktree add ~/beer-pong-rules -b codex/rules` and `git worktree add ~/beer-pong-server -b codex/server`. Run `npm install` in each.
- Save each prompt to a file in the scratchpad, then launch each with the Bash tool using **`run_in_background: true`**, so the harness reports when it finishes. Don't add the companion's own `--background` flag:
  `node "$PLUGIN/scripts/codex-companion.mjs" task --write --cwd ~/beer-pong-rules --prompt-file <scratchpad>/codex-rules.md`
  (Same for the server track with `--cwd ~/beer-pong-server`.) `--write` gives Codex write access limited to that worktree's git root, so it can't touch the main tree.
- **Follow-ups** (fixes after review) continue the same Codex thread: `... task --write --resume-last --cwd ~/beer-pong-rules "<only the delta instruction>"`.
- **If a job hangs,** check it with `node "$PLUGIN/scripts/codex-companion.mjs" status --cwd <worktree>` and `result`/`cancel <jobId>`.
- **User pre-authorization (overrides the plugin's result-handling rules for this project):** the orchestrator may act on Codex output without asking: review it, request fixes via `--resume-last`, or fix small issues itself during merge. If a Codex track fails twice, give that track to a Claude subagent (`isolation: "worktree"`) and tell the user in one line.
- Each prompt contains: the files the track owns, the agent rules, the rule spec copied word for word from Game design → Rules, and the done criteria. Codex can also read `PLAN.md` in its worktree.
- Track C depends on B's `reduce`. Start C right away anyway: it calls `reduce` through the import and its tests use a simple fake. It moves to the real one after B merges.
- When Codex reports back, follow the `codex:codex-result-handling` guidance. Review the diff before merging, because Codex output gets the same review as any agent's.

**Orchestrator during Step 1:** work on track A in the main tree. Tune the throw by playing it locally, using the screenshot tool for visual checks.

### Step 2: merge + integrate (orchestrator)
1. **Merge order:** B (rules) → C (server/net) → D (environments) → E (UI) → A (main tree). After each merge, run `npm run typecheck && npm test`, and fix breakages before the next merge.
2. Make any contract changes agents asked for, in one commit.
3. Wire `main.ts`: menu → room → game. Physics events feed into rules actions sent over the network, and server state updates the scene, HUD and avatars. Add the bounce/swat flow (including the defender's cup picker) and the re-rack flow.
4. Remove the worktrees: `git worktree remove ...`.

### Step 3: polish + verify
- Run `npm run shots` and review both tables; fix lighting, palette and props.
- Run `npm run smoke` (2-tab Playwright test).
- Use `/code-review` on the integrated branch, then push to GitHub.
- Hand the game to the user for a manual 2-window playtest. List any rough spots honestly rather than claiming it's polished.

## Verification
- `npm test`: Vitest covers the rules reducer (turn order, balls back, bounce = 2 cups, swat, re-rack limits, win) and the server room flow.
- `npm run shots`: Playwright screenshots of both tables, which I review visually.
- `npm run smoke`: Playwright opens 2 tabs, creates and joins a room, makes a scripted throw, and checks that cup and turn state sync on both.
- Manual: you play a game in two browser windows, then against a friend after deploy.
