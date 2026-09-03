import { approach, sign1 } from '../../core/math.js';
import { setClip } from '../world/components.js';
import { BaseUnitState, type StateId, type UnitStateContext } from './IUnitState.js';

/**
 * ============================================================================
 * CICLO DE RECOLECCIÓN
 * ============================================================================
 *
 *      toNode ──► gathering ──► returning ──► depositing ──┐
 *         ▲                                                 │
 *         └─────────────────────────────────────────────────┘
 *
 * Es el equivalente funcional del minero de Stick War, y se ha construido
 * como un viaje real y no como un contador que sube solo, por dos razones:
 *
 *  1. Se *ve* trabajar. El jugador entiende de dónde sale su economía.
 *  2. Es *vulnerable*. Un recolector puede morir, y perderlo duele.
 *
 * Cuando la postura del bando es RETIRARSE, los recolectores abandonan el
 * ciclo y se refugian en la base — igual que al fortificar en Stick War.
 */

/** Ida a la zona de acopio, en la retaguardia del campamento. */
export class ToNodeState extends BaseUnitState {
  readonly id = 'toNode' as const;

  override onEnter(ctx: UnitStateContext): void {
    setClip(ctx.entity.anim, 'walk');
  }

  onUpdate(ctx: UnitStateContext, dt: number): StateId | null {
    const { entity, def, world } = ctx;
    const h = entity.harvester;
    if (!h) return 'idle';

    // En repliegue el trabajo se interrumpe: primero sobrevivir.
    if (world.teams[entity.team].stance === 'retreat') return 'idle';

    const t = entity.transform;
    t.facing = sign1(h.nodeX - t.x);
    t.x = approach(t.x, h.nodeX, def.speed * dt);

    if (Math.abs(t.x - h.nodeX) < 1) return 'gathering';
    return null;
  }
}

/**
 * Cargando suministros.
 *
 * Se recogen `carryCapacity` cargas, cada una tras `gatherTime` segundos. La
 * animación es cíclica y su fotograma con evento marca cuándo se suma cada
 * carga, de modo que el gesto de agacharse y el incremento coinciden.
 */
export class GatheringState extends BaseUnitState {
  readonly id = 'gathering' as const;

  override onEnter(ctx: UnitStateContext): void {
    setClip(ctx.entity.anim, 'harvest');
    if (ctx.entity.harvester) ctx.entity.harvester.timer = 0;
  }

  onUpdate(ctx: UnitStateContext, dt: number): StateId | null {
    const { entity, def, world } = ctx;
    const h = entity.harvester;
    const cfg = def.harvest;
    if (!h || !cfg) return 'idle';

    if (world.teams[entity.team].stance === 'retreat') return 'returning';

    h.timer += dt;
    if (h.timer >= cfg.gatherTime) {
      h.timer -= cfg.gatherTime;
      h.carried++;
      if (h.carried >= cfg.carryCapacity) return 'returning';
    }
    return null;
  }
}

/** Vuelta a la base con la carga al hombro. */
export class ReturningState extends BaseUnitState {
  readonly id = 'returning' as const;

  override onEnter(ctx: UnitStateContext): void {
    // Animación de marcha cargada: más lenta y encorvada que la normal.
    setClip(ctx.entity.anim, 'carry');
  }

  onUpdate(ctx: UnitStateContext, dt: number): StateId | null {
    const { entity, def } = ctx;
    const h = entity.harvester;
    if (!h) return 'idle';

    const t = entity.transform;
    t.facing = sign1(h.depotX - t.x);
    t.x = approach(t.x, h.depotX, def.speed * dt);

    if (Math.abs(t.x - h.depotX) < 1) return 'depositing';
    return null;
  }
}

/**
 * Entregando la carga en la base.
 *
 * Aquí es donde los suministros entran realmente en la cuenta del jugador.
 * Se emite `harvest:delivered` para que la interfaz pueda mostrar el "+3"
 * flotante sobre el campamento.
 */
export class DepositingState extends BaseUnitState {
  readonly id = 'depositing' as const;

  override onEnter(ctx: UnitStateContext): void {
    const { entity, world, bus } = ctx;
    const h = entity.harvester;
    if (!h) return;

    setClip(entity.anim, 'idle');

    if (h.carried > 0) {
      const team = world.teams[entity.team];
      team.supplies += h.carried;
      team.harvested += h.carried;
      bus.emit('harvest:delivered', {
        entityId: entity.id,
        amount: h.carried,
        x: entity.transform.x,
        y: entity.transform.y,
      });
      bus.emit('supplies:changed', {
        team: team.id,
        value: team.supplies,
        delta: h.carried,
      });
      h.carried = 0;
    }
    h.timer = 0;
  }

  onUpdate(ctx: UnitStateContext, dt: number): StateId | null {
    const { entity, world } = ctx;
    const h = entity.harvester;
    if (!h) return 'idle';

    // Breve pausa de entrega: da ritmo visual al ciclo y evita el efecto
    // "rebote" de una unidad que da media vuelta en el mismo fotograma.
    h.timer += dt;
    if (h.timer < 0.25) return null;

    if (world.teams[entity.team].stance === 'retreat') return 'idle';
    return 'toNode';
  }
}
