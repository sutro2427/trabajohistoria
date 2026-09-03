import type { World } from '../world/World.js';

/**
 * Contrato de un sistema de simulación.
 *
 * Cada sistema hace UNA cosa (Responsabilidad Única) y se ejecuta en un orden
 * fijo dentro de cada paso. El orden lo compone `CompositionRoot`, así que
 * añadir o quitar comportamiento del juego no obliga a modificar `Simulation`.
 */
export interface ISystem {
  /** Nombre legible; aparece en los perfiles y en los mensajes de error. */
  readonly name: string;
  update(world: World, dt: number): void;
}
