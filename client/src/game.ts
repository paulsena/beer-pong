// In-game controller: turns server state into scene/HUD/avatar updates, runs the thrower's physics,
// streams and replays the ball, and drives the re-rack, bounce-pick and swat flows.
import * as THREE from 'three';
import {
  type BallSample, type GameEvent, type GameState, type Seat, type ThrowResult, type Vec3,
  CUP, NET, RERACK_SHAPES, TABLE, cupWorldPosition, eyePosition, otherSeat,
} from '@bp/shared';
import { createScene, type GameScene } from './scene';
import { Physics, type PhysicsEvent } from './physics';
import { aimVelocity, createThrowInput, type ThrowInput } from './throw';
import { createFx, type Fx } from './fx';
import { createAvatar, type Avatar } from './avatar';
import type { AudioSystem } from './audio';
import type { UI } from './ui';
import type { Session } from './session';

/** Opponent ball replay runs this far behind the newest sample, for smooth interpolation. */
const REPLAY_DELAY_MS = 100;
/** How long a finished throw's ball stays visible before it is cleared. */
const BALL_LINGER = 0.9;
/** How much the camera turns toward the ball in flight (0..1). */
const CAMERA_TRACK = 0.6;
/** Swat hit radius around the ball (m); generous because the ball is small and fast. */
const SWAT_RADIUS = 0.12;
/** Drop an opponent replay after this long without samples. */
const REPLAY_STALL_MS = 2500;

export interface GameOptions {
  canvas: HTMLCanvasElement;
  session: Session;
  ui: UI;
  audio: AudioSystem;
  seat: Seat;
  state: GameState;
  /** Offline practice: the local player also makes the defender's bounce pick. */
  practice?: boolean;
}

export class Game {
  readonly gs: GameScene;
  private readonly fx: Fx;
  private readonly throwInput: ThrowInput;
  private readonly opponent: Avatar;
  private readonly unsubs: (() => void)[] = [];
  private readonly clock = new THREE.Clock();
  private readonly lookTarget = new THREE.Vector3();
  private readonly defaultLook = new THREE.Vector3();
  private physics: Physics | null = null;
  private state: GameState;
  private raf = 0;

  // Local throw (I am throwing).
  private myThrowId: number | null = null;
  private sampleTimer = 0;
  private throwClock = 0;
  private linger = -1;

  // Remote throw replay (opponent is throwing).
  private replay: { throwId: number; samples: BallSample[]; start: number; bounced: boolean } | null = null;

  private rerackOffered = -1;
  private pickerOpen = false;
  private gameOverShown = false;
  /** throwId of a result we sent that the server hasn't acknowledged yet. */
  private resultPending: number | null = null;
  /** Wall-clock ms of the last opponent ball sample, to drop a replay whose thrower vanished. */
  private lastSampleAt = 0;

  constructor(private readonly opts: GameOptions) {
    const { canvas, seat, state } = opts;
    this.state = state;
    this.gs = createScene(canvas, state.table);
    this.gs.setSeatView(seat);
    // Aim a little above the far rack so the opponent's head clears the HUD.
    this.defaultLook.set(0, 0.15, (seat === 0 ? -1 : 1) * TABLE.length * 0.4);
    this.lookTarget.copy(this.defaultLook);
    this.fx = createFx(this.gs.scene, this.gs.camera);

    const opp = otherSeat(seat);
    this.opponent = createAvatar(state.players[opp]?.color ?? '#888888');
    const oppEye = eyePosition(opp);
    this.opponent.object.position.set(0, -TABLE.height, oppEye.z + Math.sign(oppEye.z) * 0.05);
    // Avatars face +Z by default; turn seat 0's avatar around to face the table.
    this.opponent.object.rotation.y = opp === 0 ? Math.PI : 0;
    this.gs.scene.add(this.opponent.object);

    // Aim from the seat's fixed facing, not the camera (which turns to follow the ball).
    this.throwInput = createThrowInput(canvas, this.gs.camera, seat === 0 ? 0 : Math.PI);
    this.throwInput.onRelease((p, v) => this.launch(p, v));
    this.gs.scene.add(this.throwInput.object);

    canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('resize', this.onResize);
    this.listen();
    this.wireSocial();
    opts.ui.showHud();
    opts.ui.onUiSound?.(() => opts.audio.play('ui_click'));
    opts.ui.setMuteHandler?.(opts.audio.isMuted?.() ?? false, (m) => opts.audio.setMuted(m));
    opts.audio.setAmbience(state.table);
    this.applyState(state, []);
  }

  async start() {
    this.physics = await Physics.create();
    this.physics.setCups(0, this.state.sides[0]);
    this.physics.setCups(1, this.state.sides[1]);
    this.clock.start();
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      this.frame(Math.min(this.clock.getDelta(), 0.05));
    };
    loop();
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.unsubs.forEach((u) => u());
    this.opts.canvas.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('resize', this.onResize);
    this.throwInput.dispose();
    this.opponent.dispose();
    this.gs.dispose();
  }

  get mySeat() {
    return this.opts.seat;
  }

  get currentState() {
    return this.state;
  }

  /** Test hook: throw at one of the opponent's cups (lob, or the given velocity) as if flicked. */
  scriptedThrow(cupId: number, miss = false) {
    if (!this.canThrow()) return false;
    const from = this.handPoint();
    const target = this.state.sides[otherSeat(this.mySeat)].find((c) => c.id === cupId);
    if (!target) return false;
    const w = cupWorldPosition(otherSeat(this.mySeat), target);
    const v = aimVelocity(from, [w.x + (miss ? 0.5 : 0), CUP.height, w.z], 52);
    if (!v) return false;
    this.launch(from, v);
    return true;
  }

  /** Test hook: launch with an exact release point and velocity. */
  scriptedLaunch(p: Vec3, v: Vec3) {
    if (!this.canThrow()) return false;
    this.launch(p, v);
    return true;
  }

  // ---------- networking ----------

  private listen() {
    const { session } = this.opts;
    this.unsubs.push(
      session.on('state', (m) => this.applyState(m.state, m.events)),
      session.on('throw_start', (m) => this.onRemoteThrowStart(m.throwId, m.p)),
      session.on('ball', (m) => this.onRemoteSample(m.sample)),
      session.on('swat', (m) => this.onSwatReceived(m.throwId)),
      session.on('opponent_left', () => {
        this.replay = null;
        this.opts.ui.toast('Opponent left. Share the room code so someone can take their spot.');
      }),
      session.on('presence', (m) => {
        if (m.seat !== this.mySeat) this.opts.ui.toast(m.connected ? 'Opponent is back' : 'Opponent disconnected — waiting 60s');
      }),
      session.on('error', (m) => {
        // A rejected result won't be acknowledged; don't block the next throw waiting for it.
        this.resultPending = null;
        if (m.code !== 'stale_throw') this.opts.ui.toast(`Server: ${m.message}`);
      }),
    );
  }

  private wireSocial() {
    const { ui, session } = this.opts;
    ui.onEmote((emote) => {
      session.send({ t: 'emote', emote });
      ui.showEmote(emote, true);
    });
    ui.onChat((msg) => {
      session.send({ t: 'chat', msg });
      ui.showChat(msg, this.state.players[this.mySeat]?.name ?? 'You', true);
    });
    this.unsubs.push(
      session.on('emote', (m) => {
        this.opponent.playEmote(m.emote);
        ui.showEmote(m.emote, false);
      }),
      session.on('chat', (m) => ui.showChat(m.msg, this.state.players[m.seat]?.name ?? 'Opponent', false)),
    );
  }

  // ---------- state ----------

  private applyState(state: GameState, events: GameEvent[]) {
    const prev = this.state;
    this.state = state;
    if (this.resultPending !== null && state.throwId > this.resultPending) this.resultPending = null;
    if (events.some((e) => e.type === 'game_started')) {
      this.rerackOffered = -1;
      this.resultPending = null;
    }
    const { ui, audio } = this.opts;
    const me = this.mySeat;
    const opp = otherSeat(me);

    for (const side of [0, 1] as const) {
      // Defender-side FX for cups that left the table (the thrower already played them locally).
      for (const ev of events) {
        if (ev.type !== 'cup_removed' || ev.side !== side) continue;
        const mesh = this.gs.cups[side].get(ev.cupId);
        if (!mesh) continue;
        const local = ev.cause === 'sink' && prev.turn === me;
        if (!local) {
          const at = mesh.position.clone().setY(CUP.liquidHeight);
          this.fx.splash(at);
          if (ev.cause === 'bounce_pick') this.fx.textPop('-1', at.clone().setY(0.3), '#ffd166');
        }
      }
      this.gs.setCups(side, state.sides[side]);
      // Rebuilding colliders resets contacts mid-throw, so only do it when the rack changed.
      if (prev === state || JSON.stringify(prev.sides[side]) !== JSON.stringify(state.sides[side])) {
        this.physics?.setCups(side, state.sides[side]);
      }
    }

    for (const ev of events) {
      switch (ev.type) {
        case 'bounce_sink':
          if (prev.turn !== me) audio.play('groan');
          break;
        case 'cup_removed':
          if (ev.side === me && ev.cause === 'sink') audio.play('splash');
          break;
        case 'balls_back':
          ui.toast(ev.seat === me ? 'Balls back!' : 'Opponent gets balls back');
          if (ev.seat === me) audio.play('cheer');
          break;
        case 'turn_changed':
          ui.toast(ev.turn === me ? 'Your throw' : "Opponent's throw");
          break;
        case 'reracked':
          ui.toast(ev.side === me ? 'Opponent re-racked your cups' : 'Re-racked');
          break;
        case 'game_started':
          ui.toast(state.turn === me ? 'Game on — your throw' : 'Game on — opponent throws first');
          break;
        case 'game_over':
          audio.play(ev.winner === me ? 'win' : 'lose');
          break;
        default:
          break;
      }
    }

    this.throwInput.setTargets(state.sides[opp].map((c) => {
      const w = cupWorldPosition(opp, c);
      return new THREE.Vector3(w.x, w.y, w.z);
    }));
    this.opponent.setColor(state.players[opp]?.color ?? '#888888');
    this.opponent.setThrowing(state.phase === 'playing' && state.turn === opp);
    ui.updateHud(state, me);
    this.updatePrompts();
  }

  /** Show/hide the re-rack picker, cup picker and game-over banner for the current state. */
  private updatePrompts() {
    const { ui, session } = this.opts;
    const s = this.state;
    const me = this.mySeat;

    const pickMine = s.phase === 'awaiting_pick' && s.pendingPick && (s.pendingPick.defender === me || !!this.opts.practice);
    if (pickMine && !this.pickerOpen) {
      this.pickerOpen = true;
      ui.showCupPicker(s.sides[s.pendingPick!.defender], (cupId) => {
        session.send({ t: 'pick_cup', cupId });
      });
    } else if (!pickMine && this.pickerOpen) {
      this.pickerOpen = false;
      ui.hideCupPicker();
    }

    // Offer a re-rack at the start of a turn, once per opponent cup count (so skipping doesn't nag),
    // and only once some cups are gone.
    const oppCups = s.sides[otherSeat(me)].length;
    const canOffer = s.phase === 'playing' && s.turn === me && s.canRerack && s.reracksLeft[me] > 0 && oppCups > 1 && oppCups < 10;
    if (canOffer && this.rerackOffered !== oppCups) {
      this.rerackOffered = oppCups;
      ui.showRerackPicker(RERACK_SHAPES, s.reracksLeft[me], (shape) => {
        session.send({ t: 'rerack', shape });
        ui.hideRerackPicker();
      }, () => ui.hideRerackPicker(), s.sides[otherSeat(me)].length);
    } else if (!canOffer) {
      ui.hideRerackPicker();
    }

    if (s.phase === 'game_over' && s.winner !== null && !this.gameOverShown) {
      this.gameOverShown = true;
      ui.showGameOver(s.winner === me, () => session.send({ t: 'rematch' }));
    } else if (s.phase === 'game_over' && s.rematchVotes[otherSeat(me)] && !s.rematchVotes[me]) {
      ui.toast('Opponent wants a rematch');
    } else if (s.phase !== 'game_over' && this.gameOverShown) {
      this.gameOverShown = false;
      ui.showHud();
      ui.updateHud(s, me);
    }
  }

  // ---------- my throw ----------

  private canThrow() {
    const s = this.state;
    return s.phase === 'playing' && s.turn === this.mySeat && this.myThrowId === null && this.resultPending === null && !!this.physics && this.linger < 0;
  }

  private handPoint(): Vec3 {
    const p = this.throwInput.releasePoint();
    return [p.x, p.y, p.z];
  }

  private launch(p: Vec3, v: Vec3) {
    if (!this.canThrow()) return;
    const throwId = this.state.throwId;
    this.myThrowId = throwId;
    this.throwClock = 0;
    this.sampleTimer = 0;
    this.opts.ui.hideRerackPicker();
    this.physics!.throwBall(p, v, [-(v[2] ?? 0) * 8, 0, 0]);
    this.opts.session.send({ t: 'throw_start', throwId, p, v });
    this.gs.ball.visible = true;
    this.fx.trailStart(this.gs.ball);
    this.opts.audio.play('throw');
  }

  private onPhysicsEvent(ev: PhysicsEvent) {
    const { audio } = this.opts;
    const throwId = this.myThrowId;
    switch (ev.type) {
      case 'table_hit':
        audio.play('table_bounce');
        return;
      case 'cup_hit': {
        const cup = this.gs.cups[ev.side].get(ev.cupId);
        if (cup) this.fx.wobble(cup);
        audio.play('cup_hit', { volume: 0.7 });
        return;
      }
      case 'sink': {
        // Landing in your own cup doesn't score; report it as a miss.
        if (ev.side !== otherSeat(this.mySeat)) return this.finishThrow(throwId, { kind: 'miss' });
        const cup = this.gs.cups[ev.side].get(ev.cupId);
        const at = (cup?.position.clone() ?? new THREE.Vector3()).setY(CUP.liquidHeight);
        this.fx.splash(at);
        this.fx.shake(ev.bounced ? 0.6 : 0.35);
        this.fx.textPop(ev.bounced ? 'BOUNCE x2' : 'SPLASH!', at.clone().setY(0.32), ev.bounced ? '#ffd166' : '#ffffff');
        audio.play('splash');
        audio.play('cheer', { volume: 0.5 });
        return this.finishThrow(throwId, { kind: 'sink', cupId: ev.cupId, bounced: ev.bounced });
      }
      case 'miss':
        return this.finishThrow(throwId, { kind: 'miss' });
      case 'swatted':
        this.fx.textPop('SWATTED', new THREE.Vector3(0, 0.35, 0), '#ff6b6b');
        return this.finishThrow(throwId, { kind: 'swatted' });
    }
  }

  private finishThrow(throwId: number | null, result: ThrowResult) {
    if (throwId === null) return;
    this.sendSample(true);
    this.opts.session.send({ t: 'throw_result', throwId, result });
    this.resultPending = throwId;
    this.myThrowId = null;
    // A sunk ball disappears into the beer; a miss stays visible for a moment.
    this.linger = result.kind === 'sink' ? 0 : BALL_LINGER;
    this.fx.trailStop();
  }

  private sendSample(force = false) {
    const pose = this.physics?.ballPose();
    if (!pose || this.myThrowId === null) return;
    if (!force && this.sampleTimer < 1 / NET.ballStateHz) return;
    this.sampleTimer = 0;
    this.opts.session.send({
      t: 'ball',
      sample: { throwId: this.myThrowId, t: this.throwClock * 1000, p: pose.p, q: pose.q, bounced: pose.bounced },
    });
  }

  private onSwatReceived(throwId: number) {
    if (throwId !== this.myThrowId || !this.physics?.swat()) return;
    this.opts.audio.play('swat');
    this.fx.shake(0.3);
  }

  // ---------- opponent throw replay ----------

  private onRemoteThrowStart(throwId: number, p: Vec3) {
    this.replay = { throwId, samples: [{ throwId, t: 0, p, q: [0, 0, 0, 1], bounced: false }], start: performance.now(), bounced: false };
    this.lastSampleAt = performance.now();
    this.gs.ball.visible = true;
    this.gs.ball.position.set(...p);
    this.fx.trailStart(this.gs.ball);
    this.opts.audio.play('throw', { volume: 0.6 });
  }

  private onRemoteSample(sample: BallSample) {
    if (!this.replay || sample.throwId !== this.replay.throwId) return;
    const last = this.replay.samples[this.replay.samples.length - 1];
    if (sample.bounced && !this.replay.bounced) this.opts.audio.play('table_bounce');
    this.replay.bounced ||= sample.bounced;
    if (!last || sample.t >= last.t) this.replay.samples.push(sample);
    this.lastSampleAt = performance.now();
  }

  private updateReplay() {
    const r = this.replay;
    if (!r) return;
    const t = performance.now() - r.start - REPLAY_DELAY_MS;
    const s = r.samples;
    let i = s.length - 1;
    while (i > 0 && s[i]!.t > t) i--;
    const a = s[i]!;
    const b = s[Math.min(i + 1, s.length - 1)]!;
    const k = b.t > a.t ? Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))) : 1;
    this.gs.ball.position.set(...a.p).lerp(new THREE.Vector3(...b.p), k);
    this.gs.ball.quaternion.set(...a.q).slerp(new THREE.Quaternion(...b.q), k);
    // The throw is over once the server has moved on and we've replayed the last sample.
    const resolved = this.state.throwId > r.throwId && t > s[s.length - 1]!.t + BALL_LINGER * 1000;
    // The thrower vanished mid-throw (closed the tab, lost connection): don't leave a frozen ball.
    const stalled = performance.now() - this.lastSampleAt > REPLAY_STALL_MS;
    if (resolved || stalled) {
      this.replay = null;
      this.gs.ball.visible = false;
      this.fx.trailStop();
    }
  }

  private readonly raycaster = new THREE.Raycaster();

  private onPointerDown = (e: PointerEvent) => {
    // Swat: defender clicks near the opponent's ball after it bounced.
    const r = this.replay;
    if (!r || !r.bounced || this.state.turn === this.mySeat || this.state.throwId !== r.throwId) return;
    const rect = this.opts.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.gs.camera);
    if (this.raycaster.ray.distanceToPoint(this.gs.ball.position) < SWAT_RADIUS) {
      this.opts.session.send({ t: 'swat', throwId: r.throwId });
      this.opts.audio.play('swat');
      this.fx.textPop('SWAT!', this.gs.ball.position.clone().setY(0.3), '#ff6b6b');
    }
  };

  private onResize = () => this.gs.resize();

  // ---------- frame ----------

  private frame(dt: number) {
    const physics = this.physics!;
    if (this.canThrow()) this.throwInput.enable();
    else this.throwInput.disable();
    this.throwInput.update(dt);

    if (this.myThrowId !== null || this.linger >= 0) {
      this.throwClock += dt;
      this.sampleTimer += dt;
      for (const ev of physics.step(dt)) this.onPhysicsEvent(ev);
      this.sendSample();
      const pose = physics.ballPose();
      if (pose) {
        this.gs.ball.position.set(...pose.p);
        this.gs.ball.quaternion.set(...pose.q);
      }
      if (this.linger >= 0) {
        this.linger -= dt;
        if (this.linger < 0) {
          physics.clearBall();
          this.gs.ball.visible = false;
        }
      }
    } else if (!this.replay) {
      const held = this.throwInput.heldBallPosition();
      this.gs.ball.visible = !!held;
      if (held) this.gs.ball.position.copy(held);
    }
    this.updateReplay();

    // Camera: seat view, turning a little toward the ball in flight.
    this.gs.setSeatView(this.mySeat);
    const flying = this.gs.ball.visible && (this.myThrowId !== null || !!this.replay);
    const want = flying ? this.defaultLook.clone().lerp(this.gs.ball.position, CAMERA_TRACK) : this.defaultLook;
    this.lookTarget.lerp(want, 1 - Math.exp(-dt * 4));
    this.gs.camera.lookAt(this.lookTarget);

    this.fx.update(dt);
    this.opponent.update(dt);
    this.gs.render(dt);
  }
}
