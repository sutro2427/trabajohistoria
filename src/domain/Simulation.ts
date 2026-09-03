import type { CommandQueue, ICommand } from './commands/ICommand.js';
import type { ISystem } from './systems/ISystem.js';
import type { World } from './world/World.js';

/**
 * Orquestador de la simulación.
 *
 * Ejecuta los sistemas en un **orden fijo** dentro de cada paso. Ese orden es
 * parte del diseño, no un detalle: si el daño se aplicara antes que el
 * movimiento de los proyectiles, las balas impactarían un paso tarde.
 *
 * La clase no conoce ningún sistema concreto — recibe la lista ya compuesta.
 * Añadir comportamiento al juego (minas, refuerzos aéreos, moral) es añadir un
 * sistema a esa lista en `CompositionRoot`, sin tocar este archivo. Es
 * Inversión de Dependencias y Abierto/Cerrado en la misma costura.
 */
export class Simulation {
  constructor(
    private readonly world: World,
    private readonly systems: readonly ISystem[],
    private readonly commands: CommandQueue,
  ) {}

  /** Encola una orden. Se aplicará al inicio del paso siguiente. */
  issue(command: ICommand): void {
    this.commands.push(command);
  }

  /**
   * Avanza la simulación un paso.
   *
   * @param dt Siempre el paso fijo (1/60 s). No aceptar un `dt` variable es lo
   *           que mantiene la simulación reproducible.
   */
  step(dt: number): void {
    const world = this.world;

    // 1. Guardar la posición previa: el render interpola entre ella y la nueva.
    for (const unit of world.units) {
      unit.transform.prevX = unit.transform.x;
      unit.transform.prevY = unit.transform.y;
    }

    // 2. Aplicar las órdenes del jugador, siempre en el mismo punto del ciclo.
    this.commands.drain(world);

    // 3. Ejecutar los sistemas en su orden fijo.
    if (!world.finished) {
      world.elapsed += dt;
      for (const system of this.systems) system.update(world, dt);
    }

    // 4. Retirar lo que haya muerto, una vez que ningún sistema recorre ya las listas.
    world.collectGarbage();
  }

  getWorld(): World {
    return this.world;
  }
}
