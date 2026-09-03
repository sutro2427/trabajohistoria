import { getLevel } from './balance/levels.js';
import { getStructureDef, getUnitDef, UNITS, WORLD } from './balance/balance.js';
import type { LevelDef, Stance } from './balance/types.js';
import { CommandQueue } from './commands/ICommand.js';
import { SetStanceCommand } from './commands/SetStanceCommand.js';
import { TrainUnitCommand } from './commands/TrainUnitCommand.js';
import { StructureFactory, UnitFactory } from './factories/UnitFactory.js';
import { Simulation } from './Simulation.js';
import { StateRegistry } from './states/StateRegistry.js';
import { WaveAiStrategy } from './ai/WaveAiStrategy.js';
import { AiDirectorSystem } from './systems/AiDirectorSystem.js';
import { AnimationSystem } from './systems/AnimationSystem.js';
import { CombatSystem } from './systems/CombatSystem.js';
import { DamageSystem } from './systems/DamageSystem.js';
import { MovementSystem } from './systems/MovementSystem.js';
import { ProjectileSystem } from './systems/ProjectileSystem.js';
import { StateMachineSystem } from './systems/StateMachineSystem.js';
import { TrainingSystem } from './systems/TrainingSystem.js';
import { VictorySystem } from './systems/VictorySystem.js';
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

  private readonly commands = new CommandQueue();
  private readonly training: TrainingSystem;

  /** `true` si el jugador ya capturó los planos del tanque (nivel 2). */
  blueprintUnlocked = false;

  constructor(levelId: number, seed: number, blueprintUnlocked = false, startingBonus = 0) {
    this.level = getLevel(levelId);
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

    const ai = new WaveAiStrategy(
      this.level.ai,
      'vc_guerrilla',
      getUnitDef('vc_guerrilla').cost,
    );

    const systems = [
      this.training,
      new AiDirectorSystem(ai, unitFactory, getUnitDef),
      new StateMachineSystem(new StateRegistry(), getUnitDef),
      new MovementSystem(getUnitDef),
      new AnimationSystem(),
      new CombatSystem(getUnitDef),
      new ProjectileSystem(getUnitDef, damage),
      damage,
      new VictorySystem(cheapest),
    ];

    this.simulation = new Simulation(this.world, systems, this.commands);

    // --- Estado inicial del campo de batalla ---
    structureFactory.create(this.world, this.level.playerStructure, WORLD.usBaseX);
    structureFactory.create(this.world, this.level.enemyStructure, WORLD.vcBaseX);

    // Guarnición enemiga: los defensores que ya están en la posición.
    this.level.garrison.forEach((defId, i) => {
      unitFactory.create(this.world, defId, WORLD.vcBaseX - 40 - i * 18);
    });
  }

  /** Avanza la simulación un paso fijo. */
  step(dt: number): void {
    this.simulation.step(dt);
  }

  // -------------------------------------------------------------------------
  // API de órdenes del jugador. La interfaz solo llama a estos tres métodos.
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

  /** Unidades producibles en este nivel. */
  get buildable(): readonly string[] {
    return this.level.buildable;
  }

  /**
   * Suministros por segundo que produce actualmente la economía del jugador.
   * Se calcula a partir del balance para que el dato del HUD no pueda
   * desincronizarse del comportamiento real.
   */
  get incomePerSecond(): number {
    let income = 0;
    for (const unit of this.world.units) {
      if (!unit.alive || unit.team !== 'US') continue;
      const def = UNITS[unit.defId];
      const h = def?.harvest;
      if (!def || !h) continue;
      const travel = (Math.abs(h.nodeOffsetX) / def.speed) * 2;
      income += h.carryCapacity / (travel + h.gatherTime * h.carryCapacity);
    }
    return income;
  }
}
