import { approach, sign1 } from '../../core/math.js';
import { setClip } from '../world/components.js';
import { pickNodeFor } from '../world/ResourceNode.js';
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
 * Con los depósitos finitos aparece una tercera: el viaje **cambia**. El
 * recolector no vuelve a un punto fijo, sino al mejor depósito que quede en
 * pie, y la elección se rehace en cada vuelta. Por eso `toNode` reasigna el
 * destino en su `onEnter` en lugar de confiar en el que trajera de antes: un
 * depósito vaciado por un compañero mientras estaba de camino no debe dejar a
 * nadie plantado delante de un agujero.
 *
 * Cuando la postura del bando es RETIRARSE, los recolectores abandonan el
 * ciclo y se refugian en la base — igual que al fortificar en Stick War.
 */

/** Ida al depósito de suministros asignado. */
export class ToNodeState extends BaseUnitState {
  readonly id = 'toNode' as const;

  override onEnter(ctx: UnitStateContext): void {
    setClip(ctx.entity.anim, 'walk');
    assignNode(ctx);
  }

  onUpdate(ctx: UnitStateContext, dt: number): StateId | null {
    const { entity, def, world } = ctx;
    const h = entity.harvester;
    if (!h) return 'idle';

    // En repliegue el trabajo se interrumpe: primero sobrevivir.
    if (world.teams[entity.team].stance === 'retreat') return 'idle';

    // Sin depósito asignado no hay a dónde ir. Se reintenta cada medio segundo
    // en vez de en cada paso: si el mapa está seco, preguntarlo sesenta veces
    // por segundo no lo va a llenar.
    if (h.nodeId === 0) {
      setClip(entity.anim, 'idle');
      h.timer += dt;
      if (h.timer >= 0.5) {
        h.timer = 0;
        assignNode(ctx);
        if (h.nodeId !== 0) setClip(entity.anim, 'walk');
      }
      return null;
    }

    // El depósito puede haberse vaciado mientras se iba hacia él.
    const node = world.findNode(h.nodeId);
    if (!node || node.amount <= 0) {
      assignNode(ctx);
      return null;
    }

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
 * Se recogen `carryCapacity` cargas, cada una tras `gatherTime` segundos, y
 * **cada carga se descuenta del depósito**. Ese descuento es todo el mecanismo
 * de agotamiento: no hay un temporizador aparte que vacíe los depósitos, se
 * vacían porque alguien se llevó los suministros.
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

    const node = world.findNode(h.nodeId);
    if (!node || node.amount <= 0) {
      // Se acabó a media carga: se entrega lo que se lleve, y si no se lleva
      // nada se busca otro depósito sin pasar por la base.
      return h.carried > 0 ? 'returning' : 'toNode';
    }

    h.timer += dt;
    if (h.timer >= cfg.gatherTime) {
      h.timer -= cfg.gatherTime;
      node.amount -= 1;
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
 * Aquí es donde los suministros entran realmente en la cuenta del bando.
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

/**
 * Asigna al recolector el mejor depósito disponible desde donde está.
 *
 * Se busca desde su posición actual y no desde la base porque un recolector al
 * que se le acaba de agotar el depósito está *allí fuera*: lo razonable es que
 * se mueva al bolsillo de al lado, no que vuelva a casa a replantearse la vida.
 */
function assignNode(ctx: UnitStateContext): void {
  const h = ctx.entity.harvester;
  if (!h) return;

  const node = pickNodeFor(ctx.world.nodes, ctx.entity.team, ctx.entity.transform.x);
  if (node) {
    h.nodeId = node.id;
    h.nodeX = node.x;
  } else {
    // No queda un solo suministro en el mapa. El recolector se queda en la
    // base: la partida ya se decide únicamente con lo que haya en caja.
    h.nodeId = 0;
    h.nodeX = h.depotX;
  }
}
