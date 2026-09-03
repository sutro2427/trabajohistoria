import { COMBAT } from '../balance/balance.js';
import type { UnitDef } from '../balance/types.js';
import { requestState, type Entity, type Structure } from '../world/Entity.js';
import type { World } from '../world/World.js';
import type { ISystem } from './ISystem.js';

/**
 * Aplica el daño y resuelve las muertes.
 *
 * Se concentra aquí, y no repartido por los sistemas que causan daño, para que
 * la fórmula (armadura, mínimo, aturdimiento) exista una sola vez. Cuando en
 * el nivel 2 entren las minas o la artillería, usarán este mismo camino y
 * heredarán automáticamente el comportamiento correcto.
 */
export class DamageSystem implements ISystem {
  readonly name = 'Damage';

  /** Descuenta los temporizadores de aturdimiento y de destello. */
  update(world: World, dt: number): void {
    for (const unit of world.units) {
      if (unit.health.flinchCooldown > 0) unit.health.flinchCooldown -= dt;
    }
    for (const s of world.structures) {
      if (s.hitFlash > 0) s.hitFlash -= dt;
    }
  }

  /**
   * Daña a una unidad.
   *
   * @returns `true` si el impacto la ha matado.
   */
  damageUnit(world: World, target: Entity, rawAmount: number, def: UnitDef): boolean {
    if (!target.alive) return false;

    // El suelo de `minDamage` impide que una unidad con armadura ≥ daño sea
    // literalmente invulnerable y bloquee la partida para siempre.
    const amount = Math.max(COMBAT.minDamage, rawAmount - target.health.armor);
    target.health.hp -= amount;

    const killed = target.health.hp <= 0;

    world.bus.emit('damage:dealt', {
      targetId: target.id,
      amount,
      x: target.transform.x,
      y: target.transform.y - 12,
      killed,
    });

    if (killed) {
      target.health.hp = 0;
      // Se *solicita* la transición en lugar de asignar `state` a mano: así la
      // ejecuta la máquina de estados con su ciclo completo y `DieState.onEnter`
      // libera la población y emite el evento de muerte. Asignar el campo
      // directamente dejaría cadáveres marcados como vivos.
      requestState(target, 'die');
      return true;
    }

    // Aturdimiento, solo si la unidad se tambalea y no está en periodo de gracia.
    // Sin ese periodo, el fuego sostenido encadenaría aturdimientos y dejaría a
    // la unidad paralizada: quien dispara primero ganaría siempre.
    if (def.flinchDuration > 0 && target.health.flinchCooldown <= 0 && target.state !== 'die') {
      target.health.flinchTimer = def.flinchDuration;
      target.health.flinchCooldown = def.flinchCooldown;
      requestState(target, 'hit');
    }

    return false;
  }

  /** Daña a una estructura. Devuelve `true` si la ha destruido. */
  damageStructure(world: World, target: Structure, rawAmount: number): boolean {
    if (!target.alive) return false;

    const amount = Math.max(COMBAT.minDamage, rawAmount);
    target.hp -= amount;
    target.hitFlash = 0.08;

    const destroyed = target.hp <= 0;

    world.bus.emit('damage:dealt', {
      targetId: target.id,
      amount,
      x: target.x,
      y: target.y - target.height * 0.6,
      killed: destroyed,
    });

    if (destroyed) {
      target.hp = 0;
      target.alive = false;
      world.bus.emit('structure:destroyed', {
        entityId: target.id,
        team: target.team,
        x: target.x,
        y: target.y,
      });
      return true;
    }
    return false;
  }
}
