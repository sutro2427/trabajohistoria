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
 *
 * Con el tope de población en 50 por bando hubo que darle una segunda
 * dimensión. Empujando solo en X, cincuenta soldados a 11 px formaban una fila
 * de 550 px — más ancha que la pantalla — y el frente dejaba de leerse. El
 * empuje elíptico (11 px de ancho por 5 de fondo) reparte la misma tropa en
 * cuatro filas dentro del carril, que es como se lee una escuadra.
 */
export class MovementSystem implements ISystem {
  readonly name = 'Movement';

  /** Píxeles por segundo a los que una unidad puede ser desplazada por sus compañeros. */
  private static readonly PUSH_SPEED = 30;

  constructor(private readonly defOf: (id: string) => UnitDef) {}

  update(world: World, dt: number): void {
    const units = world.units;
    const sepX = WORLD.unitSeparation;
    const sepY = WORLD.unitSeparationY;
    const maxPush = MovementSystem.PUSH_SPEED * dt;

    // --- Separación: empuje suave entre unidades del mismo bando ---
    for (let i = 0; i < units.length; i++) {
      const a = units[i];
      if (!a?.alive) continue;

      for (let j = i + 1; j < units.length; j++) {
        const b = units[j];
        if (!b?.alive || b.team !== a.team) continue;

        const dx = b.transform.x - a.transform.x;
        // Descarte temprano por X: es la comprobación más barata y la que
        // elimina la inmensa mayoría de los pares en un frente extendido.
        if (dx >= sepX || dx <= -sepX) continue;
        const dy = b.transform.y - a.transform.y;
        if (dy >= sepY || dy <= -sepY) continue;

        // Distancia normalizada a la elipse de separación: < 1 = solapadas.
        const nx = dx / sepX;
        const ny = dy / sepY;
        const d = Math.hypot(nx, ny);

        let ux: number;
        let uy: number;
        if (d < 0.001) {
          // Exactamente encima: se desempata con el identificador para que la
          // simulación siga siendo determinista.
          ux = a.id < b.id ? -1 : 1;
          uy = 0;
        } else {
          ux = nx / d;
          uy = ny / d;
        }

        // Se reparte el solapamiento entre las dos: ninguna tiene prioridad,
        // así el grupo se abre de forma simétrica y estable.
        const overlap = (1 - d) * 0.5;
        const pushX = Math.min(overlap * sepX, maxPush);
        const pushY = Math.min(overlap * sepY, maxPush);

        a.transform.x -= ux * pushX;
        a.transform.y -= uy * pushY;
        b.transform.x += ux * pushX;
        b.transform.y += uy * pushY;
      }
    }

    // --- Límites del mapa y del carril ---
    const laneTop = WORLD.groundY - WORLD.laneJitter;
    const laneBottom = WORLD.groundY + WORLD.laneJitter;

    for (const unit of units) {
      const t = unit.transform;
      const def = this.defOf(unit.defId);
      // Los recolectores pueden pegarse más al borde para alcanzar el depósito
      // más retrasado; el resto se queda dentro del campo de batalla.
      const minX = def.harvest ? 4 : 12;
      t.x = clamp(t.x, minX, WORLD.battlefieldWidth - 12);
      // Sin este límite el empuje vertical acumulado sacaría a las unidades del
      // carril y acabarían caminando por el cielo o por debajo del suelo.
      t.y = clamp(t.y, laneTop, laneBottom);
    }
  }
}
