import { WORLD } from '../balance/balance.js';
import { clamp } from '../../core/math.js';
import type { UnitDef } from '../balance/types.js';
import type { World } from '../world/World.js';
import type { ISystem } from './ISystem.js';

/**
 * Aplica las restricciones de movimiento después de que los estados hayan
 * movido a las unidades: separación entre compañeros y límites del mapa.
 *
 * La separación es lo que convierte un montón de sprites superpuestos en algo
 * que parece una formación. Sin ella todas las unidades convergen al mismo
 * punto y se dibujan una encima de otra.
 */
export class MovementSystem implements ISystem {
  readonly name = 'Movement';

  constructor(private readonly defOf: (id: string) => UnitDef) {}

  update(world: World, dt: number): void {
    const units = world.units;

    // --- Separación: empuje suave entre unidades del mismo bando ---
    for (let i = 0; i < units.length; i++) {
      const a = units[i];
      if (!a?.alive) continue;

      for (let j = i + 1; j < units.length; j++) {
        const b = units[j];
        if (!b?.alive || b.team !== a.team) continue;

        const dx = b.transform.x - a.transform.x;
        const absDx = Math.abs(dx);
        if (absDx >= WORLD.unitSeparation) continue;

        // Se reparte el solapamiento entre las dos: ninguna tiene prioridad,
        // así el grupo se abre de forma simétrica y estable.
        const overlap = (WORLD.unitSeparation - absDx) * 0.5;
        // Si están exactamente encima, se desempata con el identificador para
        // que la simulación siga siendo determinista.
        const dir = absDx < 0.001 ? (a.id < b.id ? -1 : 1) : Math.sign(dx);
        const push = Math.min(overlap, 30 * dt);
        a.transform.x -= dir * push;
        b.transform.x += dir * push;
      }
    }

    // --- Límites del mapa y ajuste de la posición previa para el render ---
    for (const unit of units) {
      const t = unit.transform;
      const def = this.defOf(unit.defId);
      // Los recolectores pueden salir del borde izquierdo hacia su zona de
      // acopio; el resto se queda dentro del campo de batalla.
      const minX = def.harvest ? 4 : 12;
      t.x = clamp(t.x, minX, WORLD.battlefieldWidth - 12);
    }
  }
}
