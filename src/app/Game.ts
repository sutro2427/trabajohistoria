import { bakeArt } from '../art/SpriteBaker.js';
import { GameLoop } from '../core/GameLoop.js';
import { getUnitDef, WORLD } from '../domain/balance/balance.js';
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
import { ResultOverlay } from '../ui/ResultOverlay.js';

/**
 * ============================================================================
 * RAÍZ DE COMPOSICIÓN de la aplicación
 * ============================================================================
 *
 * Une la simulación (que no sabe nada del navegador) con el render, la
 * interfaz y la entrada. Es el único punto del proyecto donde ambos mundos se
 * tocan, y por eso es el único que necesita saber que existe un `<canvas>`.
 */
export class Game {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly atlas: SpriteAtlas;
  private readonly camera: Camera;
  private readonly loop: GameLoop;
  private readonly overlay = new ResultOverlay();

  private session!: GameSession;
  private renderer!: Renderer;
  private fx!: FxSystem;
  private hud!: Hud;
  private commandBar!: CommandBar;

  /** Semilla de la partida actual; se puede fijar por URL para reproducir bugs. */
  private seed: number;
  private levelId = 1;
  /** `true` mientras el jugador puede dar órdenes. */
  private interactive = false;

  constructor(
    canvas: HTMLCanvasElement,
    private readonly progressRepo: IProgressRepository,
    options: { seed?: number; timeScale?: number } = {},
  ) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('No se pudo obtener el contexto 2D del canvas');
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = false;

    this.seed = options.seed ?? Math.floor(Math.random() * 1_000_000);
    this.camera = new Camera(WORLD.logicalWidth);

    // El arte se hornea una única vez, al arrancar, y se reutiliza en todos
    // los niveles: es TypeScript puro convertido en lienzos.
    this.atlas = new SpriteAtlas(bakeArt());

    new InputManager(canvas, this.camera, WORLD.logicalWidth);

    this.loop = new GameLoop({
      fixedUpdate: (dt) => this.fixedUpdate(dt),
      render: (alpha) => this.render(alpha),
    });
    if (options.timeScale) this.loop.setTimeScale(options.timeScale);
  }

  /** Muestra la sesión informativa y deja la partida lista para empezar. */
  start(): void {
    const progress = this.progressRepo.load();
    this.levelId = 1;
    this.buildSession();

    this.overlay.show(
      {
        title: 'Operación Delta',
        body: this.session.level.briefing,
        stats: [
          { label: 'Sector', value: this.session.level.title },
          { label: 'Objetivo', value: this.session.level.objective },
          { label: 'Victorias', value: String(progress.victories) },
        ],
        actionLabel: 'Desplegar',
      },
      () => this.beginBattle(),
    );

    this.loop.start();
  }

  /** Construye una partida nueva y cablea la interfaz con ella. */
  private buildSession(): void {
    const progress = this.progressRepo.load();
    this.session = new GameSession(
      this.levelId,
      this.seed,
      progress.tankBlueprintUnlocked,
      // El botín del nivel anterior se acredita como suministros iniciales.
      this.levelId > 1 ? progress.loot : 0,
    );

    const bus = this.session.world.bus;
    this.fx = new FxSystem(bus, this.camera);
    this.renderer = new Renderer(this.ctx, this.atlas, this.camera, this.fx, getUnitDef);

    // El HUD y la barra se recrean por partida porque se suscriben al bus de
    // esa partida concreta; un bus nuevo necesita suscriptores nuevos.
    this.hud = new Hud(bus);
    this.commandBar = new CommandBar(bus, {
      onTrain: (defId) => {
        if (this.interactive) this.session.trainUnit(defId);
      },
      onStance: (stance: Stance) => {
        if (this.interactive) this.session.setStance(stance);
      },
    });

    const team = this.session.world.teams.US;
    this.hud.reset(team.supplies, team.population, team.populationMax, this.session.level.objective);
    this.commandBar.highlightStance('defend');

    bus.on('level:ended', (payload) => this.onLevelEnded(payload));

    this.camera.snapTo(WORLD.usBaseX + 60);
    this.fx.clear();
    this.interactive = false;
  }

  private beginBattle(): void {
    this.interactive = true;
  }

  private fixedUpdate(dt: number): void {
    if (this.interactive) this.session.step(dt);
    this.fx.update(dt);
    this.hud.update(dt, this.session.world.elapsed);

    const team = this.session.world.teams.US;
    this.commandBar.update(
      dt,
      team.supplies,
      (defId) => this.session.costOf(defId),
      team.queue[0],
      (defId) => getUnitDef(defId).name,
      this.interactive,
    );

    this.camera.update(dt, this.focusPoint());
  }

  /**
   * Centro de interés de la cámara: el punto medio entre la unidad aliada más
   * avanzada y la enemiga más avanzada.
   *
   * Encuadrar el frente —y no al jugador— es lo que mantiene el combate a la
   * vista mientras la línea se desplaza por el mapa.
   */
  private focusPoint(): number {
    const world = this.session.world;
    // `WORLD` está congelado, así que sus campos se infieren como literales;
    // se anota el tipo para poder acumular máximos y mínimos sobre ellos.
    let friendlyFront: number = WORLD.usBaseX;
    let enemyFront = Infinity;

    for (const unit of world.units) {
      if (!unit.alive) continue;
      if (unit.team === 'US') {
        // Los recolectores trabajan en retaguardia: si contaran, la cámara se
        // quedaría mirando la zona de acopio en lugar de la batalla.
        if (unit.defId === 'us_harvester') continue;
        friendlyFront = Math.max(friendlyFront, unit.transform.x);
      } else {
        enemyFront = Math.min(enemyFront, unit.transform.x);
      }
    }

    // Punto de interés por defecto: justo delante de la línea propia.
    const ownFocus = friendlyFront + 70;

    // El punto medio entre ambos frentes solo sirve si están razonablemente
    // cerca. Con la guarnición enemiga esperando al otro extremo del mapa, la
    // media caería en mitad de la selva vacía y la cámara enfocaría la nada:
    // por eso, si el enemigo más próximo queda más allá de este umbral, se
    // sigue al ejército propio.
    const CONTACT_RANGE = 260;
    if (enemyFront - friendlyFront > CONTACT_RANGE) return ownFocus;

    return (friendlyFront + enemyFront) * 0.5;
  }

  private render(alpha: number): void {
    this.renderer.render(this.session.world, this.interactive ? alpha : 0);
  }

  /** Cierra la partida: guarda el progreso y muestra el resultado. */
  private onLevelEnded({ won, loot, elapsed }: { won: boolean; loot: number; elapsed: number }): void {
    this.interactive = false;
    const world = this.session.world;

    if (won) {
      const progress = this.progressRepo.load();
      progress.victories++;
      progress.loot = loot;
      progress.tankBlueprintUnlocked = true;
      progress.unlockedLevel = Math.max(progress.unlockedLevel, this.levelId + 1);
      const key = String(this.levelId);
      const best = progress.bestTimeSec[key];
      if (best === undefined || elapsed < best) progress.bestTimeSec[key] = elapsed;
      this.progressRepo.save(progress);

      this.overlay.show(ResultOverlay.victory(loot, elapsed, world.teams.US.kills), () =>
        this.restart(),
      );
    } else {
      const reason = world.structureOf('US')
        ? 'Tu fuerza ha quedado aniquilada y no queda con qué reponerla.\n' +
          'Recuerda: la economía sostiene al ejército, pero sin ejército no hay economía que valga.'
        : 'La base de fuego ha caído. La posición se ha perdido.';
      this.overlay.show(ResultOverlay.defeat(elapsed, reason), () => this.restart());
    }
  }

  /** Reinicia el nivel con una semilla nueva. */
  restart(): void {
    this.seed = Math.floor(Math.random() * 1_000_000);
    this.buildSession();
    this.beginBattle();
  }

  // --- Acceso controlado para el puente de depuración ---

  getSession(): GameSession {
    return this.session;
  }

  isInteractive(): boolean {
    return this.interactive;
  }

  setTimeScale(scale: number): void {
    this.loop.setTimeScale(scale);
  }

  getFps(): number {
    return this.loop.getFps();
  }

  /** Salta la sesión informativa. Lo usan los tests automatizados. */
  skipBriefing(): void {
    if (this.overlay.visible) {
      this.overlay.hide();
      this.beginBattle();
    }
  }
}
