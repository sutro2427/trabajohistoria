import { approach, sign1 } from '../../core/math.js';
import { setClip } from '../world/components.js';
import { BaseUnitState, type StateId, type UnitStateContext } from './IUnitState.js';
import {
  anchorFor,
  atAnchor,
  canFireAt,
  engageRange,
  findNearestEnemy,
  preferredRange,
  shouldBackPedal,
} from './targeting.js';

/**
 * Fracción de la velocidad normal a la que una unidad puede retroceder sin
 * dar la espalda al enemigo. Nadie corre igual hacia atrás.
 */
const BACKPEDAL_SPEED_FACTOR = 0.5;

/**
 * Estados de las unidades de combate.
 *
 * El ciclo normal es:
 *
 *      idle ──(hay orden de moverse)──► move
 *       ▲                                │
 *       │                        (enemigo cerca)
 *       │                                ▼
 *       └───(sin enemigos)────── engage ◄──► attack
 *
 * Y en cualquier momento: `hit` al recibir daño, `die` al llegar a 0 de vida.
 * Cada clase de abajo es una casilla de ese diagrama.
 */

/** En posición, sin nada que hacer. Vigila y espera órdenes. */
export class IdleState extends BaseUnitState {
  readonly id = 'idle' as const;

  override onEnter(ctx: UnitStateContext): void {
    setClip(ctx.entity.anim, 'idle');
  }

  onUpdate(ctx: UnitStateContext): StateId | null {
    const { entity, world, def } = ctx;

    // Un enemigo a tiro tiene prioridad sobre cualquier otra cosa.
    const target = findNearestEnemy(world, entity, engageRange(def));
    if (target.unit ?? target.structure) return 'engage';

    // Si la postura del bando pide estar en otro sitio, ponerse en marcha.
    const anchor = anchorFor(world, entity, world.teams[entity.team].stance);
    if (!atAnchor(entity.transform.x, anchor)) return 'move';

    return null;
  }
}

/** Desplazándose hacia el punto que marca la postura del bando. */
export class MoveState extends BaseUnitState {
  readonly id = 'move' as const;

  override onEnter(ctx: UnitStateContext): void {
    setClip(ctx.entity.anim, 'walk');
  }

  onUpdate(ctx: UnitStateContext, dt: number): StateId | null {
    const { entity, world, def } = ctx;
    const stance = world.teams[entity.team].stance;

    // En repliegue se ignora al enemigo salvo que esté encima: retirarse
    // significa retirarse, no detenerse a pelear a mitad de camino.
    const searchRadius = stance === 'retreat' ? def.range * 0.5 : engageRange(def);
    const target = findNearestEnemy(world, entity, searchRadius);
    if (target.unit ?? target.structure) return 'engage';

    const anchor = anchorFor(world, entity, stance);
    if (atAnchor(entity.transform.x, anchor)) return 'idle';

    // Avance efectivo hacia el destino.
    const t = entity.transform;
    t.facing = sign1(anchor - t.x);
    t.x = approach(t.x, anchor, def.speed * dt);
    return null;
  }
}

/**
 * Enemigo localizado: acercarse hasta tenerlo a tiro y encararlo.
 *
 * Este estado existe para separar "ver al enemigo" de "dispararle". Sin él,
 * las unidades se quedarían clavadas en el borde exacto del alcance entrando
 * y saliendo de rango — el clásico baile de las unidades mal programadas.
 */
export class EngageState extends BaseUnitState {
  readonly id = 'engage' as const;

  override onEnter(ctx: UnitStateContext): void {
    setClip(ctx.entity.anim, 'walk');
    if (ctx.entity.combat) ctx.entity.combat.aimTimer = 0;
  }

  onUpdate(ctx: UnitStateContext, dt: number): StateId | null {
    const { entity, world, def } = ctx;
    const combat = entity.combat;
    if (!combat) return 'idle';

    const target = findNearestEnemy(world, entity, engageRange(def) * 1.4);
    const targetX = target.unit?.transform.x ?? target.structure?.x;
    if (targetX === undefined) {
      combat.targetId = 0;
      return 'idle';
    }

    // Se memoriza el blanco para que el sistema de combate sepa a quién apuntar.
    combat.targetId = target.unit?.id ?? target.structure?.id ?? 0;
    combat.targetIsStructure = target.unit === undefined;

    const t = entity.transform;
    t.facing = sign1(targetX - t.x);
    const distance = Math.abs(targetX - t.x);

    // Ya está a su distancia de tiro preferida: dejar de avanzar y disparar.
    // La infantería usa todo su alcance; el francotirador se planta antes.
    if (distance <= preferredRange(def)) return 'attack';

    // En repliegue no se persigue: se prefiere volver a la base.
    if (world.teams[entity.team].stance === 'retreat') return 'move';

    setClip(entity.anim, 'walk');
    t.x += t.facing * def.speed * dt;
    return null;
  }
}

/**
 * Disparando al blanco.
 *
 * El disparo en sí no se resuelve aquí: este estado solo mantiene a la unidad
 * encarada y con la animación correcta. Quien crea la bala es `CombatSystem`,
 * en el fotograma exacto que marca `eventFrame` de la animación — así el
 * fogonazo y el proyectil ocurren en el mismo instante.
 */
export class AttackState extends BaseUnitState {
  readonly id = 'attack' as const;

  override onEnter(ctx: UnitStateContext): void {
    setClip(ctx.entity.anim, 'aim');
    if (ctx.entity.combat) ctx.entity.combat.aimTimer = 0;
  }

  onUpdate(ctx: UnitStateContext, dt: number): StateId | null {
    const { entity, world, def } = ctx;
    const combat = entity.combat;
    if (!combat) return 'idle';

    // ¿Sigue existiendo el blanco?
    const targetUnit = combat.targetIsStructure ? undefined : world.findUnit(combat.targetId);
    const targetStructure = combat.targetIsStructure
      ? world.findStructure(combat.targetId)
      : undefined;
    const targetX = targetUnit?.transform.x ?? targetStructure?.x;

    if (targetX === undefined) {
      combat.targetId = 0;
      return 'engage';
    }

    const t = entity.transform;
    t.facing = sign1(targetX - t.x);
    const distance = Math.abs(targetX - t.x);

    // Se ha alejado: volver a acercarse.
    if (!canFireAt(entity, targetX, def)) return 'engage';

    // Demasiado cerca para un tirador: retrocede manteniendo la cara al
    // enemigo. Mientras retrocede no dispara, y ahí está su punto débil.
    //
    // El retroceso es deliberadamente MÁS LENTO que la marcha normal. Sin ese
    // freno, un francotirador con más alcance que su perseguidor podía
    // retroceder eternamente sin ser alcanzado jamás: era invencible frente a
    // infantería, y un solo tirador enemigo bastaba para hacer un nivel
    // imposible. Con el freno gana distancia un rato, pero acaba alcanzado si
    // nadie lo cubre — que es exactamente la debilidad que debe tener.
    if (shouldBackPedal(def, distance)) {
      setClip(entity.anim, 'walk');
      t.x -= t.facing * def.speed * BACKPEDAL_SPEED_FACTOR * dt;
      combat.aimTimer = 0;
      return null;
    }

    // Encarar el arma antes del primer disparo da peso a la acción.
    combat.aimTimer += dt;
    if (combat.aimTimer < def.aimTime) {
      setClip(entity.anim, 'aim');
      return null;
    }

    // Listo para disparar: se lanza la animación y `CombatSystem` hace el resto.
    if (combat.cooldown <= 0 && entity.anim.clip !== 'shoot') {
      setClip(entity.anim, 'shoot');
    } else if (entity.anim.clip === 'shoot' && entity.anim.finished) {
      setClip(entity.anim, 'aim');
    }

    return null;
  }
}

/**
 * Aturdido por un impacto.
 *
 * Dura muy poco a propósito. El `flinchCooldown` que impone `DamageSystem`
 * garantiza que el fuego sostenido no pueda encadenar aturdimientos y dejar a
 * la unidad paralizada — un fallo clásico que convierte al primero que dispara
 * en ganador automático.
 */
export class HitState extends BaseUnitState {
  readonly id = 'hit' as const;

  override onEnter(ctx: UnitStateContext): void {
    setClip(ctx.entity.anim, 'hit');
  }

  onUpdate(ctx: UnitStateContext, dt: number): StateId | null {
    const health = ctx.entity.health;
    health.flinchTimer -= dt;
    if (health.flinchTimer > 0) return null;
    // Al recuperarse se vuelve a evaluar la situación desde cero.
    return 'idle';
  }
}

/** Muerta. Reproduce el colapso y deja el cadáver hasta que se desvanece. */
export class DieState extends BaseUnitState {
  readonly id = 'die' as const;

  override onEnter(ctx: UnitStateContext): void {
    const { entity, def, world, bus } = ctx;
    setClip(entity.anim, 'die');
    entity.alive = false;
    entity.corpseTimer = def.corpseFade;

    // Liberar la población que ocupaba: es lo que permite reponer bajas.
    const team = world.teams[entity.team];
    team.population = Math.max(0, team.population - def.population);
    world.teams[entity.team === 'US' ? 'VC' : 'US'].kills++;

    bus.emit('unit:died', {
      entityId: entity.id,
      defId: entity.defId,
      team: entity.team,
      x: entity.transform.x,
      y: entity.transform.y,
    });
    bus.emit('population:changed', {
      team: team.id,
      current: team.population,
      max: team.populationMax,
    });
  }

  onUpdate(): StateId | null {
    // Estado terminal: nunca se sale de aquí.
    return null;
  }
}
