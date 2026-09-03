import { COMBAT, WORLD } from '../balance/balance.js';
import type { UnitDef } from '../balance/types.js';
import type { Entity, Projectile, Structure } from '../world/Entity.js';
import type { World } from '../world/World.js';
import type { ISystem } from './ISystem.js';
import type { DamageSystem } from './DamageSystem.js';

/**
 * Mueve los proyectiles y detecta sus impactos.
 *
 * La detección se hace por segmento (de la posición anterior a la actual) y no
 * por punto. Con balas a 420 px/s y pasos de 1/60 s, cada bala recorre 7 px
 * por paso: una comprobación puntual atravesaría a un enemigo delgado sin
 * tocarlo. Es el clásico bug de "las balas fantasma".
 */
export class ProjectileSystem implements ISystem {
  readonly name = 'Projectile';

  /** Media anchura del cuerpo de una unidad, en píxeles. */
  private static readonly HIT_HALF_WIDTH = 5;
  /** Media altura del cuerpo, medida desde los pies. */
  private static readonly HIT_HEIGHT = 20;

  constructor(
    private readonly defOf: (id: string) => UnitDef,
    private readonly damage: DamageSystem,
  ) {}

  update(world: World, dt: number): void {
    for (const p of world.projectiles) {
      if (!p.alive) continue;

      p.prevX = p.x;
      p.prevY = p.y;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;

      // Fuera del mapa, bajo tierra o agotada: desaparece sin más.
      if (p.life <= 0 || p.x < 0 || p.x > WORLD.battlefieldWidth || p.y > WORLD.groundY + 6) {
        p.alive = false;
        continue;
      }

      const victim = this.findVictim(world, p);
      if (victim) this.resolveHit(world, p, victim);
    }
  }

  /** Primer enemigo cuyo cuerpo cruza el segmento recorrido por la bala. */
  private findVictim(world: World, p: Projectile): Entity | Structure | undefined {
    // --- Unidades ---
    for (const unit of world.units) {
      if (!unit.alive || unit.team === p.team || unit.id === p.ownerId) continue;
      const t = unit.transform;
      if (
        segmentHitsBox(
          p.prevX, p.prevY, p.x, p.y,
          t.x - ProjectileSystem.HIT_HALF_WIDTH,
          t.y - ProjectileSystem.HIT_HEIGHT,
          ProjectileSystem.HIT_HALF_WIDTH * 2,
          ProjectileSystem.HIT_HEIGHT,
        )
      ) {
        return unit;
      }
    }

    // --- Estructuras ---
    for (const s of world.structures) {
      if (!s.alive || s.team === p.team) continue;
      if (
        segmentHitsBox(
          p.prevX, p.prevY, p.x, p.y,
          s.x - s.width * 0.5, s.y - s.height, s.width, s.height,
        )
      ) {
        return s;
      }
    }

    return undefined;
  }

  /** Aplica el daño (puntual o en área) y retira el proyectil. */
  private resolveHit(world: World, p: Projectile, victim: Entity | Structure): void {
    p.alive = false;
    world.bus.emit('projectile:hit', { x: p.x, y: p.y, splashRadius: p.splashRadius });

    if (p.splashRadius <= 0) {
      this.applyTo(world, victim, p.damage);
      return;
    }

    // Daño en área: alcanza a todo enemigo dentro del radio, con atenuación
    // lineal hacia el borde. Es lo que hace temible al tanque frente a un grupo.
    for (const unit of world.units) {
      if (!unit.alive || unit.team === p.team) continue;
      const d = Math.abs(unit.transform.x - p.x);
      if (d > p.splashRadius) continue;
      const falloff = 1 - (d / p.splashRadius) * 0.6;
      this.applyTo(world, unit, p.damage * falloff);
    }
    for (const s of world.structures) {
      if (!s.alive || s.team === p.team) continue;
      if (Math.abs(s.x - p.x) <= p.splashRadius + s.width * 0.5) {
        this.applyTo(world, s, p.damage);
      }
    }
  }

  private applyTo(world: World, victim: Entity | Structure, amount: number): void {
    if ('transform' in victim) {
      this.damage.damageUnit(world, victim, amount, this.defOf(victim.defId));
    } else {
      this.damage.damageStructure(world, victim, amount);
    }
  }
}

/**
 * ¿El segmento AB atraviesa el rectángulo?
 *
 * Se resuelve con el algoritmo de recorte de Liang-Barsky: en lugar de
 * muestrear puntos a lo largo del segmento (que puede saltarse blancos
 * estrechos), calcula analíticamente el tramo del segmento que queda dentro
 * del rectángulo. Es exacto y cuesta unas pocas divisiones.
 */
function segmentHitsBox(
  x0: number, y0: number, x1: number, y1: number,
  bx: number, by: number, bw: number, bh: number,
): boolean {
  const dx = x1 - x0;
  const dy = y1 - y0;
  let tMin = 0;
  let tMax = 1;

  const edges: readonly [number, number][] = [
    [-dx, x0 - bx],
    [dx, bx + bw - x0],
    [-dy, y0 - by],
    [dy, by + bh - y0],
  ];

  for (const [p, q] of edges) {
    if (p === 0) {
      // Segmento paralelo a este borde: si empieza fuera, nunca entra.
      if (q < 0) return false;
      continue;
    }
    const t = q / p;
    if (p < 0) {
      if (t > tMax) return false;
      if (t > tMin) tMin = t;
    } else {
      if (t < tMin) return false;
      if (t < tMax) tMax = t;
    }
  }
  return true;
}

/** Se reexporta para los tests: la geometría merece verificarse por separado. */
export { segmentHitsBox };

/** Constante usada por los tests de vida útil del proyectil. */
export const PROJECTILE_LIFETIME = COMBAT.projectileLifetime;
