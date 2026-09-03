import { bakeArt } from '../art/SpriteBaker.js';
import { GameLoop } from '../core/GameLoop.js';
import { getUnitDef, WORLD } from '../domain/balance/balance.js';
import { isDifficultyId, type DifficultyId } from '../domain/balance/difficulty.js';
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
import { MainMenu } from '../ui/MainMenu.js';
import { ResultOverlay } from '../ui/ResultOverlay.js';

/**
 * ============================================================================
 * RAÍZ DE COMPOSICIÓN de la aplicación
 * ============================================================================
 *
 * Une la simulación (que no sabe nada del navegador) con el render, la
 * interfaz y la entrada. Es el único punto del proyecto donde ambos mundos se
 * tocan, y por eso es el único que necesita saber que existe un `<canvas>`.
 *
 * El ciclo de vida es de tres estados y no tiene más:
 *
 *      MENÚ ──JUGAR──► PARTIDA ──fin de nivel──► RESULTADO ──► MENÚ
 *
 * El menú corre sobre una sesión ya construida: el campo de batalla que se ve
 * detrás del título es real, con su selva y su base, solo que sin simular. Eso
 * evita tener una segunda escena de fondo que mantener.
 */
export class Game {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly atlas: SpriteAtlas;
  private readonly camera: Camera;
  private readonly loop: GameLoop;
  private readonly overlay = new ResultOverlay();
  private readonly menu: MainMenu;

  private session!: GameSession;
  private renderer!: Renderer;
  private fx!: FxSystem;
  private hud!: Hud;
  private commandBar!: CommandBar;

  /** Semilla de la partida actual; se puede fijar por URL para reproducir bugs. */
  private seed: number;
  /** Semilla pedida por URL, si la hubiera: fija todas las partidas de la sesión. */
  private readonly fixedSeed: number | undefined;
  /** Dificultad impuesta por URL; tiene prioridad sobre la última guardada. */
  private readonly forcedDifficulty: DifficultyId | undefined;
  private levelId = 1;
  private difficulty: DifficultyId = 'normal';
  /** `true` mientras el jugador puede dar órdenes. */
  private interactive = false;
  /** Segundos en el menú, o `null` si el menú no está visible. Anima el fondo. */
  private menuTime: number | null = 0;

  constructor(
    canvas: HTMLCanvasElement,
    private readonly progressRepo: IProgressRepository,
    options: { seed?: number; timeScale?: number; difficulty?: DifficultyId } = {},
  ) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('No se pudo obtener el contexto 2D del canvas');
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = false;

    this.fixedSeed = options.seed;
    this.seed = options.seed ?? Math.floor(Math.random() * 1_000_000);
    // Una dificultad pedida explícitamente (por URL) manda sobre la guardada.
    this.forcedDifficulty = options.difficulty;
    if (options.difficulty) this.difficulty = options.difficulty;
    this.camera = new Camera(WORLD.logicalWidth);

    // El arte se hornea una única vez, al arrancar, y se reutiliza en todos
    // los niveles: es TypeScript puro convertido en lienzos.
    this.atlas = new SpriteAtlas(bakeArt());

    new InputManager(canvas, this.camera, WORLD.logicalWidth);

    this.menu = new MainMenu();

    this.loop = new GameLoop({
      fixedUpdate: (dt) => this.fixedUpdate(dt),
      render: (alpha) => this.render(alpha),
    });
    if (options.timeScale) this.loop.setTimeScale(options.timeScale);
  }

  /** Arranca la aplicación en el menú principal. */
  start(): void {
    // El menú abre en la última dificultad jugada, salvo que la URL imponga otra.
    const progress = this.progressRepo.load();
    if (!this.forcedDifficulty && isDifficultyId(progress.difficulty)) {
      this.difficulty = progress.difficulty;
    }

    this.levelId = 1;
    this.buildSession();
    this.loop.start();
    this.openMenu();
  }

  /** Vuelve al menú principal con el campo de batalla de fondo. */
  private openMenu(): void {
    this.interactive = false;
    this.menuTime = 0;
    const progress = this.progressRepo.load();
    this.menu.show(this.session.level, progress, this.difficulty, (difficulty) =>
      this.beginBattle(difficulty),
    );
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
      this.difficulty,
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

  /**
   * Empieza una partida con la dificultad elegida.
   *
   * Se reconstruye la sesión aunque ya hubiera una: la dificultad se inyecta en
   * el constructor de `GameSession` y la IA es inmutable una vez cableada, que
   * es justo lo que se quiere — nadie puede cambiarla a mitad de partida.
   */
  private beginBattle(difficulty: DifficultyId): void {
    this.difficulty = difficulty;

    const progress = this.progressRepo.load();
    progress.difficulty = difficulty;
    this.progressRepo.save(progress);

    // Con `?seed=` se respeta la semilla pedida para poder reproducir una
    // partida exacta; sin ella, cada despliegue es distinto.
    this.seed = this.fixedSeed ?? Math.floor(Math.random() * 1_000_000);
    this.buildSession();

    this.menuTime = null;
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

    if (this.menuTime !== null) {
      // En el menú la cámara pasea despacio por el valle. Se coloca de forma
      // directa en lugar de con `pan`, que activaría el temporizador de
      // control manual y dejaría la cámara clavada al empezar la partida.
      this.menuTime += dt;
      this.camera.snapTo(WORLD.usBaseX + 150 + Math.sin(this.menuTime * 0.12) * 120);
      return;
    }

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
      // Los recolectores trabajan por delante de la base, hacia el centro: si
      // contaran, la cámara los seguiría hasta el depósito más avanzado y
      // perdería de vista dónde está de verdad la línea de combate.
      if (getUnitDef(unit.defId).harvest) continue;
      if (unit.team === 'US') {
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
    this.renderer.render(
      this.session.world,
      this.interactive ? alpha : 0,
      this.menuTime,
    );
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

      this.overlay.show(
        ResultOverlay.victory(loot, elapsed, world.teams.US.kills, this.difficulty),
        () => this.openMenu(),
      );
    } else {
      const reason = world.structureOf('US')
        ? 'Tu fuerza ha quedado aniquilada y no queda con qué reponerla.\n' +
          'Recuerda: la economía sostiene al ejército, pero sin ejército no hay economía que valga.'
        : 'La base de fuego ha caído. La posición se ha perdido.';
      this.overlay.show(ResultOverlay.defeat(elapsed, reason, this.difficulty), () =>
        this.openMenu(),
      );
    }
  }

  /** Reinicia el nivel con la dificultad actual. Lo usa el puente de depuración. */
  restart(): void {
    this.overlay.hide();
    this.menu.hide();
    this.beginBattle(this.difficulty);
  }

  // --- Acceso controlado para el puente de depuración ---

  getSession(): GameSession {
    return this.session;
  }

  isInteractive(): boolean {
    return this.interactive;
  }

  getDifficulty(): DifficultyId {
    return this.difficulty;
  }

  setTimeScale(scale: number): void {
    this.loop.setTimeScale(scale);
  }

  getFps(): number {
    return this.loop.getFps();
  }

  /** Cambia la dificultad marcada en el menú, sin empezar la partida. */
  selectDifficulty(difficulty: DifficultyId): void {
    this.difficulty = difficulty;
    if (this.menu.visible) this.menu.select(difficulty);
  }

  /** Salta el menú y despliega ya. Lo usan los tests automatizados. */
  skipMenu(): void {
    if (!this.menu.visible) return;
    this.menu.hide();
    this.beginBattle(this.difficulty);
  }
}
