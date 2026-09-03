import type { Stance, TeamId } from '../balance/types.js';
import { requestState } from './Entity.js';
import type { World } from './World.js';

/**
 * Aplica una orden de escuadra a un bando.
 *
 * Existe como función compartida —y no duplicada en el comando del jugador y
 * en el director de la IA— por un fallo concreto que costó media economía
 * enemiga: el director de la IA reevaluaba la postura varias veces por segundo
 * y, al hacerlo, sacaba a **todas** sus unidades de su estado actual,
 * porteadores incluidos. Cada cambio de postura interrumpía el ciclo de
 * recolección y los dejaba parados en la línea de defensa. El efecto era
 * perverso: cuanto más lista era la IA (más a menudo pensaba), menos
 * recolectaba, así que Imposible ingresaba *menos* que Normal.
 *
 * Con una sola implementación, la regla "los recolectores solo abandonan su
 * trabajo para replegarse" no puede volver a divergir entre los dos caminos.
 */
export function applyStance(world: World, teamId: TeamId, stance: Stance): boolean {
  const team = world.teams[teamId];
  if (team.stance === stance) return false;

  team.stance = stance;

  // Se saca a las unidades de su estado actual para que reevalúen de
  // inmediato. Sin esto, una unidad esperando en `idle` tardaría hasta un
  // paso entero en reaccionar y la orden se sentiría con retardo.
  for (const unit of world.units) {
    if (!unit.alive || unit.team !== teamId) continue;
    // Ni los muertos ni los aturdidos interrumpen su estado.
    if (unit.state === 'die' || unit.state === 'hit') continue;
    // Los recolectores solo cambian de rutina para replegarse; en cualquier
    // otra postura siguen produciendo, que es su trabajo.
    if (isHarvesting(unit.state) && stance !== 'retreat') continue;

    requestState(unit, 'idle');
  }

  world.bus.emit('stance:changed', { team: teamId, stance });
  return true;
}

/** `true` si el estado forma parte del ciclo de recolección. */
function isHarvesting(state: string): boolean {
  return (
    state === 'toNode' ||
    state === 'gathering' ||
    state === 'returning' ||
    state === 'depositing'
  );
}
