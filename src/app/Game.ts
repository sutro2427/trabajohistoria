import { bakeArt } from '../art/SpriteBaker.js';
import { GameLoop } from '../core/GameLoop.js';
import { getUnitDef, WORLD } from '../domain/balance/balance.js';
import { getLevel, TOTAL_LEVELS } from '../domain/balance/levels.js';
import { GameSession } from '../domain/GameSession.js';
import type { Stance } from '../domain/balance/types.js';
import { InputManager } from '../input/InputManager.js';
import type { IProgressRepository } from '../persistence/IProgressRepository.js';
import { Camera } from '../render/Camera.js';
import { FxSystem } from '../render/FxSystem.js';
import { Renderer } from '../render/Renderer.js';
import { SpriteAtlas } from '../render/SpriteAtlas.js';
import { CommandBar } from '../ui/CommandBar.js';
import { Hud } from '../ui/Hud.js';
import { LobbyScreen } from '../ui/LobbyScreen.js';
import { ResultOverlay } from '../ui/ResultOverlay.js';
import { ScoreBoard } from '../ui/ScoreBoard.js';
import type { ICompetition, LobbySnapshot } from '../campaign/ICompetition.js';
import {
  createRun,
  isComplete,
  recordDefeat,
  recordVictory,
  summarize,
  toScoreEntry,
  type CampaignRun,
} from '../campaign/CampaignRun.js';

/**
 * ============================================================================
 * RAÍZ DE COMPOSICIÓN de la aplicación
 * ============================================================================
 *
 * Une cuatro mundos que no se conocen entre sí: la simulación (sin DOM), el
 * render, la interfaz y la competencia en red. Es el único punto del proyecto
 * que sabe que existen a la vez.
 *
 * Ciclo de vida completo:
 *
 *   ACCESO ─nombre─► SALA ─salida─► OPERACIÓN 1 ─► 2 ─► 3 ─► CAMPAÑA COMPLETA
 *                                        │                        │
 *                                    derrota                 tabla de
 *                                        └──repetir            posiciones
 *
 * Detrás de cada pantalla corre el campo de batalla real, sin simular: el
 * fondo del menú es el propio juego, así que no hay una segunda escena que
 * mantener.
 */
export class Game {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly atlas: SpriteAtlas;
  private readonly camera: Camera;
  private readonly loop: GameLoop;
  private readonly overlay = new ResultOverlay();
  private readonly lobby: LobbyScreen;
  private readonly board: ScoreBoard;
  private readonly input: InputManager;

  private session!: GameSession;
  private renderer!: Renderer;
  private fx!: FxSystem;
  private hud!: Hud;
  private commandBar!: CommandBar;

  /** Intento de campaña en curso; `null` hasta que el alumno se identifica. */
  private run: CampaignRun | null = null;
  private levelId = 1;

  private seed: number;
  private readonly fixedSeed: number | undefined;

  /** `true` mientras el jugador puede dar órdenes. */
  private interactive = false;
  /** Segundos en pantalla de espera, o `null` durante la partida. */
  private menuTime: number | null = 0;
  /** Último estado conocido de la sala. */
  private snapshot: LobbySnapshot = { state: 'lobby', startedAt: null, participants: [] };
  /** Evita arrancar dos veces si la salida llega mientras ya se está jugando. */
  private started = false;

  constructor(
    canvas: HTMLCanvasElement,
    private readonly progressRepo: IProgressRepository,
    private readonly competition: ICompetition,
    options: { seed?: number; timeScale?: number; admin?: boolean } = {},
  ) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('No se pudo obtener el contexto 2D del canvas');
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = false;

    this.fixedSeed = options.seed;
    this.seed = options.seed ?? Math.floor(Math.random() * 1_000_000);
    this.camera = new Camera(WORLD.logicalWidth);

    // El arte se hornea una sola vez y sirve para toda la campaña.
    this.atlas = new SpriteAtlas(bakeArt());

    // Se guarda la referencia: la versión anterior descartaba el objeto y por
    // eso el desplazamiento de cámara con el teclado nunca llegaba a ejecutarse.
    this.input = new InputManager(canvas, this.camera, WORLD.logicalWidth);

    this.board = new ScoreBoard();
    this.lobby = new LobbyScreen({
      onJoin: (name) => this.joinCompetition(name),
      onPlaySolo: () => this.beginCampaign(),
    });

    if (options.admin) {
      this.board.enableAdmin(
        () => void this.competition.startCompetition(),
        () => void this.competition.resetCompetition(),
      );
    }

    this.loop = new GameLoop({
      fixedUpdate: (dt) => this.fixedUpdate(dt),
      render: (alpha) => this.render(alpha),
    });
    if (options.timeScale) this.loop.setTimeScale(options.timeScale);
  }

  /** Arranca la aplicación en la pantalla de acceso. */
  start(): void {
    this.levelId = 1;
    this.buildSession();
    this.loop.start();

    this.competition.subscribe((snapshot) => this.onLobbyChange(snapshot));
    this.lobby.show();
  }

  // -------------------------------------------------------------------------
  // Competencia
  // -------------------------------------------------------------------------

  private async joinCompetition(name: string): Promise<{ ok: boolean; reason?: string }> {
    const result = await this.competition.join(name);
    if (!result.ok) return { ok: false, reason: result.reason };

    this.run = createRun(name);
    this.board.setPlayerName(name);
    await this.competition.setReady(true);
    // Se publica de inmediato para que el alumno se vea en la tabla desde el
    // primer momento, aunque todavía no haya jugado nada.
    await this.competition.publish(toScoreEntry(this.run));
    return { ok: true };
  }

  /** Reacciona a los cambios de la sala: entradas, salidas y la señal de inicio. */
  private onLobbyChange(snapshot: LobbySnapshot): void {
    this.snapshot = snapshot;
    if (this.lobby.visible) this.lobby.render(snapshot, this.competition.online);
    // El panel se refresca SIEMPRE, no solo si está abierto: pintar unas
    // pocas filas de DOM es gratis, y así al pulsar el botón ya está al día.
    // Condicionarlo a que fuera visible dejaba el panel vacío la primera vez.
    this.board.render(snapshot, this.competition.online);

    // La salida la da el profesor y arranca a todos a la vez.
    if (snapshot.state === 'running' && !this.started && this.run !== null) {
      this.beginCampaign();
    }
  }

  /** Empieza la campaña por el nivel 1. */
  private beginCampaign(): void {
    if (this.started) return;
    this.started = true;

    // Quien pulsa "Jugar ahora" sin haberse identificado juega igualmente: en
    // clase es peor que alguien se quede fuera que un jugador anónimo de más.
    this.run ??= createRun('Invitado');

    this.lobby.hide();
    this.board.setToggleVisible(true);
    this.levelId = 1;
    this.showBriefing();
  }

  // -------------------------------------------------------------------------
  // Ciclo de la campaña
  // -------------------------------------------------------------------------

  /** Informe previo a la operación: explica lo que el nivel introduce. */
  private showBriefing(): void {
    this.interactive = false;
    this.menuTime = 0;
    this.buildSession();
    this.overlay.show(ResultOverlay.briefing(getLevel(this.levelId)), () => this.beginBattle());
  }

  /** Construye una partida nueva y cablea la interfaz con ella. */
  private buildSession(): void {
    const progress = this.progressRepo.load();
    this.session = new GameSession(
      this.levelId,
      this.seed,
      // Los planos del tanque se desbloquean al llegar al nivel que los usa.
      this.levelId >= 3 || progress.tankBlueprintUnlocked,
      this.levelId > 1 ? progress.loot : 0,
    );

    const bus = this.session.world.bus;
    this.fx = new FxSystem(bus, this.camera);
    this.renderer = new Renderer(this.ctx, this.atlas, this.camera, this.fx, getUnitDef);

    this.hud = new Hud(bus);

    // La barra anterior se destruye: se suscribe al bus y al teclado, y sin
    // soltar esos oyentes se acumularían nivel tras nivel.
    this.commandBar?.destroy();
    this.commandBar = new CommandBar(
      bus,
      {
        onTrain: (defId) => {
          if (this.interactive) this.session.trainUnit(defId);
        },
        onStance: (stance: Stance) => {
          if (this.interactive) this.session.setStance(stance);
        },
        onLaunchPower: (powerId, worldX) => {
          if (this.interactive) this.session.launchPower(powerId, worldX);
        },
      },
      WORLD.logicalWidth,
    );
    this.commandBar.buildFor(this.session.buildable, this.session.powers);

    const team = this.session.world.teams.US;
    this.hud.reset(team.supplies, team.population, team.populationMax, this.session.level.objective);
    this.commandBar.highlightStance('defend');

    bus.on('level:ended', (payload) => this.onLevelEnded(payload));

    this.camera.snapTo(WORLD.usBaseX + 60);
    this.fx.clear();
    this.interactive = false;
  }

  private beginBattle(): void {
    this.seed = this.fixedSeed ?? Math.floor(Math.random() * 1_000_000);
    this.buildSession();
    this.menuTime = null;
    this.interactive = true;
  }

  /** Cierra el nivel: registra el resultado, publica y decide qué viene después. */
  private onLevelEnded({ won, loot, elapsed }: { won: boolean; loot: number; elapsed: number }): void {
    this.interactive = false;
    const world = this.session.world;
    const level = this.session.level;
    const team = world.teams.US;
    const run = this.run;

    if (!won) {
      if (run) {
        recordDefeat(run);
        void this.competition.publish(toScoreEntry(run));
      }
      const reason = world.structureOf('US')
        ? 'Tu fuerza ha quedado aniquilada y no queda con qué reponerla.\n' +
          'La economía sostiene al ejército, pero sin ejército no hay economía que defender.'
        : 'La base de fuego ha caído. La posición se ha perdido.';
      // Se repite el mismo nivel: la campaña no retrocede.
      this.overlay.show(ResultOverlay.defeat(level, elapsed, reason), () => this.beginBattle());
      return;
    }

    // --- Nivel superado ---
    const progress = this.progressRepo.load();
    progress.victories++;
    progress.loot = loot;
    progress.tankBlueprintUnlocked = true;
    progress.unlockedLevel = Math.max(progress.unlockedLevel, this.levelId + 1);
    const best = progress.bestTimeSec[String(this.levelId)];
    if (best === undefined || elapsed < best) progress.bestTimeSec[String(this.levelId)] = elapsed;
    this.progressRepo.save(progress);

    if (run) {
      recordVictory(run, {
        level: this.levelId,
        seconds: Math.round(elapsed),
        harvested: Math.round(team.harvested),
        leftover: Math.round(team.supplies),
        losses: world.teams.VC.kills,
        kills: team.kills,
        spentOnPowers: Math.round(team.spentOnPowers),
      });
      void this.competition.publish(toScoreEntry(run));
    }

    if (run && isComplete(run)) {
      this.onCampaignComplete(run);
      return;
    }

    this.overlay.show(
      ResultOverlay.levelCleared(level, elapsed, team.kills),
      () => {
        this.levelId = Math.min(TOTAL_LEVELS, this.levelId + 1);
        this.showBriefing();
      },
      () => this.board.show(),
    );
  }

  /** Cierre de la campaña: el mensaje del juego, con las cifras del alumno. */
  private onCampaignComplete(run: CampaignRun): void {
    this.menuTime = 0;
    this.board.render(this.snapshot, this.competition.online);

    this.overlay.show(
      ResultOverlay.campaignComplete(summarize(run), run.playerName),
      () => this.board.show(),
      () => {
        // Volver a intentarlo: se conserva el nombre y el histórico de la sala,
        // pero la campaña empieza de cero.
        this.run = createRun(run.playerName);
        this.levelId = 1;
        this.showBriefing();
      },
    );
  }

  // -------------------------------------------------------------------------
  // Bucle
  // -------------------------------------------------------------------------

  private fixedUpdate(dt: number): void {
    if (this.interactive) this.session.step(dt);
    this.input.update(dt);
    this.fx.update(dt);
    this.hud.update(dt, this.session.world.elapsed);

    const team = this.session.world.teams.US;
    this.commandBar.update(dt, {
      supplies: team.supplies,
      queue: team.queue[0],
      interactive: this.interactive,
      powerCooldowns: new Map(team.powers.map((p) => [p.defId, p.cooldown])),
      cameraX: this.camera.x,
    });

    if (this.menuTime !== null) {
      // Fuera de la partida la cámara pasea despacio por el valle. Se coloca de
      // forma directa y no con `pan`, que activaría el control manual y dejaría
      // la cámara clavada al empezar el nivel.
      this.menuTime += dt;
      this.camera.snapTo(WORLD.usBaseX + 150 + Math.sin(this.menuTime * 0.12) * 120);
    } else {
      this.camera.update(dt, this.focusPoint());
    }
  }

  /**
   * Centro de interés de la cámara: el punto medio entre la unidad aliada más
   * avanzada y la enemiga más avanzada, siempre que estén en contacto.
   */
  private focusPoint(): number {
    const world = this.session.world;
    let friendlyFront: number = WORLD.usBaseX;
    let enemyFront = Infinity;

    for (const unit of world.units) {
      if (!unit.alive) continue;
      if (unit.team === 'US') {
        // Los recolectores trabajan en retaguardia: si contaran, la cámara se
        // quedaría mirando los depósitos en lugar de la batalla.
        if (unit.defId === 'us_harvester') continue;
        friendlyFront = Math.max(friendlyFront, unit.transform.x);
      } else {
        enemyFront = Math.min(enemyFront, unit.transform.x);
      }
    }

    const ownFocus = friendlyFront + 70;
    // Con el enemigo lejos, el punto medio caería en mitad de la selva vacía.
    const CONTACT_RANGE = 260;
    if (enemyFront - friendlyFront > CONTACT_RANGE) return ownFocus;
    return (friendlyFront + enemyFront) * 0.5;
  }

  private render(alpha: number): void {
    this.renderer.render(this.session.world, this.interactive ? alpha : 0);
  }

  // -------------------------------------------------------------------------
  // Acceso controlado para el puente de depuración y los tests
  // -------------------------------------------------------------------------

  getSession(): GameSession {
    return this.session;
  }

  isInteractive(): boolean {
    return this.interactive;
  }

  getLevelId(): number {
    return this.levelId;
  }

  getRun(): CampaignRun | null {
    return this.run;
  }

  setTimeScale(scale: number): void {
    this.loop.setTimeScale(scale);
  }

  getFps(): number {
    return this.loop.getFps();
  }

  /** Salta el acceso y el informe. Lo usan los tests automatizados. */
  skipToBattle(name = 'Prueba Automatizada'): void {
    if (!this.run) {
      this.run = createRun(name);
      this.board.setPlayerName(name);
    }
    this.lobby.hide();
    this.overlay.hide();
    this.started = true;
    this.board.setToggleVisible(true);
    this.beginBattle();
  }

  /** Salta directamente a un nivel concreto. Solo para pruebas. */
  jumpToLevel(levelId: number): void {
    this.levelId = Math.min(TOTAL_LEVELS, Math.max(1, levelId));
    this.skipToBattle();
  }
}
