import type { World } from '../world/World.js';

/**
 * ============================================================================
 * PATRÓN COMMAND — las órdenes del jugador
 * ============================================================================
 *
 * Toda intención del jugador se convierte en un objeto y se encola. La cola se
 * vacía al principio de cada paso de simulación, nunca en mitad de uno.
 *
 * Esto tiene tres consecuencias prácticas:
 *
 *  1. **Determinismo.** El clic del ratón no muta el mundo en un instante
 *     arbitrario del frame, sino siempre en el mismo punto del ciclo.
 *  2. **Testabilidad.** Un test inyecta comandos igual que lo haría un
 *     jugador, sin simular eventos del navegador.
 *  3. **Extensibilidad.** Añadir una orden nueva es añadir una clase; no se
 *     modifica ninguna existente (Principio Abierto/Cerrado).
 */
export interface ICommand {
  readonly name: string;
  execute(world: World): void;
}

/** Cola de órdenes pendientes de aplicar. */
export class CommandQueue {
  private readonly pending: ICommand[] = [];

  push(command: ICommand): void {
    this.pending.push(command);
  }

  /** Ejecuta y vacía todo lo pendiente. */
  drain(world: World): void {
    // Se vacía la lista ANTES de ejecutar: si un comando encola otro, ese irá
    // al paso siguiente en lugar de alargar este indefinidamente.
    const batch = this.pending.splice(0, this.pending.length);
    for (const command of batch) command.execute(world);
  }

  get size(): number {
    return this.pending.length;
  }

  clear(): void {
    this.pending.length = 0;
  }
}
