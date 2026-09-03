import { CLIPS } from '../../art/AnimationCatalog.js';
import { COMBAT } from '../balance/balance.js';
import type { UnitDef } from '../balance/types.js';
import type { Projectile } from '../world/Entity.js';
import type { World } from '../world/World.js';
import type { ISystem } from './ISystem.js';

/**
 * Resuelve los disparos: crea los proyectiles en el fotograma exacto de la
 * animación de disparo.
 *
 * Sincronizar la bala con `eventFrame` en lugar de con un temporizador propio
 * es lo que hace que el fogonazo, el retroceso del arma y el proyectil ocurran
 * en el mismo instante. Es un detalle pequeño del que depende que disparar se
 * sienta contundente en vez de flojo.
 */
export class CombatSystem implements ISystem {
  readonly name = 'Combat';

  constructor(private readonly defOf: (id: string) => UnitDef) {}

  update(world: World, dt: number): void {
    for (const entity of world.units) {
      const combat = entity.combat;
      if (!entity.alive || !combat) continue;

      if (combat.cooldown > 0) combat.cooldown -= dt;

      // Solo se dispara desde el estado de ataque, en el fotograma del disparo
      // y una única vez por reproducción del clip.
      if (entity.state !== 'attack') continue;
      if (entity.anim.clip !== 'shoot') continue;
      if (entity.anim.eventFired) continue;

      const clip = CLIPS.shoot;
      if (clip.eventFrame === undefined || entity.anim.frame < clip.eventFrame) continue;

      entity.anim.eventFired = true;
      if (combat.cooldown > 0) continue;

      const def = this.defOf(entity.defId);
      this.fire(world, entity.id, def, entity.transform.x, entity.transform.y, entity.transform.facing, combat.targetId, combat.targetIsStructure);
      combat.cooldown = 1 / def.fireRate;
    }
  }

  /** Crea el proyectil y anuncia el fogonazo. */
  private fire(
    world: World,
    ownerId: number,
    def: UnitDef,
    x: number,
    y: number,
    facing: 1 | -1,
    targetId: number,
    targetIsStructure: boolean,
  ): void {
    // La boca del cañón está a la altura del pecho, adelantada según orientación.
    const muzzleX = x + facing * 10;
    const muzzleY = y - 11;

    // Altura del blanco, para que la bala vuele hacia donde de verdad está.
    const target = targetIsStructure ? world.findStructure(targetId) : world.findUnit(targetId);
    const targetY = target
      ? 'transform' in target
        ? target.transform.y - 11
        : target.y - target.height * 0.5
      : muzzleY;

    // Dispersión: una fracción de los disparos se va desviada. Los fallos
    // visibles hacen que los aciertos se sientan ganados.
    const missed = !world.rng.chance(COMBAT.accuracy);
    const scatter = world.rng.range(-def.spread, def.spread) + (missed ? world.rng.range(6, 14) * (world.rng.chance(0.5) ? 1 : -1) : 0);

    const dx = facing * def.range;
    const dy = targetY - muzzleY + scatter;
    const length = Math.hypot(dx, dy) || 1;

    const projectile: Projectile = {
      id: world.allocateId(),
      team: def.team,
      x: muzzleX,
      y: muzzleY,
      prevX: muzzleX,
      prevY: muzzleY,
      vx: (dx / length) * def.projectileSpeed,
      vy: (dy / length) * def.projectileSpeed,
      damage: def.damage,
      splashRadius: def.splashRadius,
      life: COMBAT.projectileLifetime,
      ownerId,
      alive: true,
    };
    world.projectiles.push(projectile);

    world.bus.emit('weapon:fired', { entityId: ownerId, muzzleX, muzzleY, facing });
  }
}
