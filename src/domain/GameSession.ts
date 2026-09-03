import { getLevel } from './balance/levels.js';
import { getAiProfile, isDifficultyId, type DifficultyId } from './balance/difficulty.js';
import { getPowerDef, getStructureDef, getUnitDef, UNITS, WORLD } from './balance/balance.js';
import type { LevelDef, Stance, UnitDef } from './balance/types.js';
import { CommandQueue } from './commands/ICommand.js';
import { LaunchPowerCommand } from './commands/LaunchPowerCommand.js';
import { SetStanceCommand } from './commands/SetStanceCommand.js';
import { TrainUnitCommand } from './commands/TrainUnitCommand.js';
import { StructureFactory, UnitFactory } from './factories/UnitFactory.js';
import { Simulation } from './Simulation.js';
import { StateRegistry } from './states/StateRegistry.js';
import { EconomicAiStrategy } from './ai/EconomicAiStrategy.js';
import { AiDirectorSystem } from './systems/AiDirectorSystem.js';
import { AnimationSystem } from './systems/AnimationSystem.js';
import { CombatSystem } from './systems/CombatSystem.js';
import { DamageSystem } from './systems/DamageSystem.js';
import { MovementSystem } from './systems/MovementSystem.js';
import { ProjectileSystem } from './systems/ProjectileSystem.js';
import { StateMachineSystem } from './systems/StateMachineSystem.js';
import { StrikeSystem } from './systems/StrikeSystem.js';
import { TrainingSystem } from './systems/TrainingSystem.js';
import { VictorySystem } from './systems/VictorySystem.js';
import type { PowerState } from './world/Strike.js';
import { World } from './world/World.js';

/**
 * ============================================================================
 * RAÍZ DE COMPOSICIÓN de la simulación
 * ============================================================================
 *
 * Único lugar donde se instancian las clases concretas y se cablean entre sí.
 * Todo lo demás depende de interfaces (`ISystem`, `IAiStrategy`, `IUnitState`),
 * nunca de implementaciones: eso es Inversión de Dependencias aplicada.
 *
 * La ventaja práctica es directa: esta clase no toca el DOM, así que un test
 * de Node puede crear una partida completa y jugarla entera en milisegundos.
 */
export class GameSession {
  readonly world: World;
  readonly simulation: Simulation;
  readonly level: LevelDef;
  readonly difficulty: DifficultyId;

  private readonly commands = new CommandQueue();
  private readonly training: TrainingSystem;

  /** `true` si el jugador ya capturó los planos del tanque (nivel 2). */
  blueprintUnlocked = false;

  constructor(
    levelId: number,
    seed: number,
    blueprintUnlocked = false,
    startingBonus = 0,
    difficulty?: DifficultyId,
  ) {
    this.level = getLevel(levelId);
    // La dificultad la fija el NIVEL, no el jugador: así todos los alumnos
    // compiten bajo las mismas condiciones y el ranking es comparable.
    // El parámetro explícito existe solo para los tests de balance.
    this.difficulty = difficulty ?? resolveDifficulty(this.level.difficulty);
    this.blueprintUnlocked = blueprintUnlocked;
    this.world = new World(this.level, seed);
    this.world.teams.US.supplies += startingBonus;

    // --- Fábricas ---
    const unitFactory = new UnitFactory(getUnitDef);
    const structureFactory = new StructureFactory(getStructureDef);

    // --- Sistemas ---
    // El orden de esta lista ES el orden de ejecución de cada paso.
    const damage = new DamageSystem();
    const cheapest = Math.min(...this.level.buildable.map((id) => getUnitDef(id).cost));

    this.training = new TrainingSystem(unitFactory, getUnitDef);

    // La IA recibe la misma cola de entrenamiento que el jugador. Es lo que
    // garantiza que no pueda producir nada que no haya pagado.
    const ai = new EconomicAiStrategy(
      // El techo del nivel manda sobre el del perfil: es lo que permite
      // calibrar cada operación por separado.
      { ...getAiProfile(this.difficulty), populationCap: this.level.enemyPopulationCap },
      pickByRole(this.level.enemyBuildable, 'harvester'),
      pickByRole(this.level.enemyBuildable, 'infantry'),
    );

    const systems = [
      this.training,
      new AiDirectorSystem(ai, this.training, getUnitDef),
      new StateMachineSystem(new StateRegistry(), getUnitDef),
      new MovementSystem(getUnitDef),
      new AnimationSystem(),
      new CombatSystem(getUnitDef),
      new ProjectileSystem(getUnitDef, damage),
      new StrikeSystem(getUnitDef, damage),
      damage,
      new VictorySystem(cheapest),
    ];

    this.simulation = new Simulation(this.world, systems, this.commands);

    // --- Estado inicial del campo de batalla ---
    structureFactory.create(this.world, this.level.playerStructure, WORLD.usBaseX);
    structureFactory.create(this.world, this.level.enemyStructure, WORLD.vcBaseX);

    // Guarnición enemiga: los defensores que ya están en la posición. Ocupan
    // población como cualquier otra unidad — no son un regalo sin coste de
    // hueco, solo el equivalente a que la posición ya estuviera guarnecida.
    this.level.garrison.forEach((defId, i) => {
      unitFactory.create(this.world, defId, WORLD.vcBaseX - 40 - i * 18);
    });
  }

  /** Avanza la simulación un paso fijo. */
  step(dt: number): void {
    this.simulation.step(dt);
  }

  // -------------------------------------------------------------------------
  // API de órdenes del jugador. La interfaz solo llama a estos métodos.
  // -------------------------------------------------------------------------

  /** Encola la producción de una unidad. */
  trainUnit(defId: string): void {
    this.simulation.issue(
      new TrainUnitCommand('US', defId, this.training, this.blueprintUnlocked),
    );
  }

  /** Emite una orden de escuadra al ejército del jugador. */
  setStance(stance: Stance): void {
    this.simulation.issue(new SetStanceCommand('US', stance));
  }

  /** Coste de una unidad, para pintarlo en los botones. */
  costOf(defId: string): number {
    return getUnitDef(defId).cost;
  }

  /**
   * Lanza un poder sobre un punto del mapa.
   *
   * @param worldX Coordenada del mundo (no de pantalla) donde caerá la andanada.
   */
  launchPower(powerId: string, worldX: number): void {
    this.simulation.issue(new LaunchPowerCommand('US', powerId, worldX));
  }

  /** Poderes disponibles en este nivel. */
  get powers(): readonly string[] {
    return this.level.powers;
  }

  /** Estado de un poder del jugador (enfriamiento y usos), si existe. */
  powerState(powerId: string): PowerState | undefined {
    return this.world.teams.US.powers.find((p) => p.defId === powerId);
  }

  /** `true` si el poder puede lanzarse ahora mismo. */
  canLaunch(powerId: string): boolean {
    const state = this.powerState(powerId);
    if (!state || state.cooldown > 0) return false;
    return this.world.teams.US.supplies >= getPowerDef(powerId).cost;
  }

  /** Unidades producibles en este nivel. */
  get buildable(): readonly string[] {
    return this.level.buildable;
  }

  /**
   * Suministros por segundo que produce actualmente la economía del jugador.
   *
   * Se calcula a partir del depósito real que trabaja cada recolector, no de
   * una constante: cuando los bolsillos cercanos se agotan, esta cifra baja
   * sola, que es justo lo que debe comunicar.
   */
  get incomePerSecond(): number {
    return this.incomeOf('US');
  }

  /** Producción por segundo de un bando. Útil para depuración y tests. */
  incomeOf(team: 'US' | 'VC'): number {
    let income = 0;
    for (const unit of this.world.units) {
      if (!unit.alive || unit.team !== team) continue;
      const def = UNITS[unit.defId];
      const h = def?.harvest;
      if (!def || !h) continue;
      const node = unit.harvester ? this.world.findNode(unit.harvester.nodeId) : undefined;
      // Sin depósito asignado el recolector está parado: no produce nada.
      if (!node) continue;
      const travel = (node.distanceFromBase / def.speed) * 2;
      income += h.carryCapacity / (travel + h.gatherTime * h.carryCapacity);
    }
    return income;
  }
}

/**
 * Primera unidad de la lista con el rol pedido.
 *
 * La IA se configura por rol y no por identificador para que añadir un bando o
 * un nivel nuevo no obligue a tocar la estrategia: basta con que su lista de
 * producibles incluya una unidad de economía y otra de combate.
 */
function pickByRole(ids: readonly string[], role: UnitDef['role']): string {
  const found = ids.find((id) => getUnitDef(id).role === role);
  if (!found) {
    throw new Error(`El nivel no define ninguna unidad enemiga con rol "${role}"`);
  }
  return found;
}

/**
 * Traduce la dificultad declarada por un nivel a un identificador válido.
 *
 * Un nivel guarda su dificultad como texto para que `levels.ts` no dependa del
 * módulo de dificultad; si el texto no fuese válido se cae a 'normal' en lugar
 * de reventar la partida, que es el fallo menos dañino posible aquí.
 */
function resolveDifficulty(value: string): DifficultyId {
  return isDifficultyId(value) ? value : 'normal';
}
