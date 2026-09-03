import type { AiProfile } from '../balance/difficulty.js';
import type { AiStrategyContext, IAiStrategy } from './IAiStrategy.js';

/**
 * ============================================================================
 * IA CON ECONOMÍA PROPIA
 * ============================================================================
 *
 * Sustituye a la antigua IA por oleadas, que cobraba una renta invisible y
 * hacía aparecer guerrilleros gratis. Esta juega al mismo juego que el jugador:
 *
 *   · manda porteadores a los depósitos de su mitad del mapa;
 *   · esos porteadores caminan, cargan y vuelven, y se pueden matar;
 *   · con lo que entra compra —pagando el precio de catálogo— más porteadores
 *     o más guerrilleros, por la misma cola de una sola ranura;
 *   · y decide cuándo defender y cuándo empujar.
 *
 * La consecuencia de diseño es la que se buscaba: matarle los porteadores ya no
 * es un adorno, es cortarle la producción. Y una IA a la que se le agotan los
 * depósitos cercanos se ralentiza igual que el jugador.
 *
 * ---------------------------------------------------------------------------
 * Las dos decisiones de cada turno
 * ---------------------------------------------------------------------------
 *
 *  1. **Qué comprar.** Economía primero hasta `harvesterTarget`; a partir de
 *     ahí sigue ampliando mientras el ejército acompañe (`armyPerHarvester`),
 *     y en cualquier otro caso, tropa. La regla de acompañamiento es la que
 *     evita los dos suicidios clásicos: la IA que solo mina y la que solo
 *     produce soldados y se queda sin con qué pagarlos.
 *
 *  2. **Qué postura.** Defensa reactiva si le entran en casa; si no, atacar
 *     solo con la ventaja que exija su perfil.
 *
 * La dificultad no toca ni una cifra de economía: cambia cada cuánto piensa,
 * cuánta ventaja exige, cuánto tarda en reaccionar y con qué frecuencia se
 * equivoca a propósito.
 */
export class EconomicAiStrategy implements IAiStrategy {
  readonly id: string;

  /** Segundos acumulados desde la última decisión. */
  private thinkTimer = 0;
  /** Segundos restantes del empuje ofensivo en curso. */
  private pushTimer = 0;
  /**
   * Segundos que lleva viendo al enemigo dentro de su territorio.
   *
   * Es el temporizador de reacción: en Normal hacen falta 2,5 s de amenaza
   * sostenida para que el bando entero se dé la vuelta, en Imposible un
   * cuarto de segundo. Ahí está buena parte de la diferencia percibida.
   */
  private threatTimer = 0;

  constructor(
    private readonly profile: AiProfile,
    /** Identificador de la unidad de economía. */
    private readonly harvesterId: string,
    /** Identificador de la unidad de combate. */
    private readonly soldierId: string,
  ) {
    this.id = `economic:${profile.id}`;
  }

  tick(ctx: AiStrategyContext, dt: number): void {
    if (this.pushTimer > 0) this.pushTimer -= dt;

    // La detección de amenazas corre en cada paso, no al ritmo de las
    // decisiones: si solo se comprobara al pensar, una IA lenta podría no
    // enterarse nunca de un ataque relámpago entre dos turnos.
    this.trackThreat(ctx, dt);

    this.thinkTimer += dt;
    if (this.thinkTimer < this.profile.thinkInterval) return;
    this.thinkTimer = 0;

    this.manageEconomy(ctx);
    this.decideStance(ctx);
  }

  // -------------------------------------------------------------------------
  // 1. Economía
  // -------------------------------------------------------------------------

  /**
   * Decide la siguiente compra. Nunca gasta lo que no tiene: `ctx.train`
   * rechaza la orden si faltan suministros, población o ranura libre.
   */
  private manageEconomy(ctx: AiStrategyContext): void {
    // Con la ranura ocupada no hay nada que decidir: es el mismo cuello de
    // botella que tiene el jugador.
    if (ctx.me.queue.length > 0) return;

    // Techo propio de la IA: por debajo del límite del nivel. Es lo que evita
    // que gane por saturación a un jugador humano, que no puede pulsar botones
    // al ritmo de un bucle de simulación.
    if (ctx.me.population >= this.profile.populationCap) return;

    // Error deliberado: dejar pasar el turno de compra. Es la forma más
    // honesta de hacer a una IA peor sin quitarle recursos — pierde tempo,
    // que es exactamente lo que pierde un jugador despistado.
    if (this.profile.mistakeChance > 0 && ctx.rng.chance(this.profile.mistakeChance)) return;

    const harvesters = ctx.countUnits(ctx.me.id, this.harvesterId);
    const soldiers = ctx.countUnits(ctx.me.id, this.soldierId);

    if (this.wantsHarvester(harvesters, soldiers) && ctx.train(this.harvesterId)) return;

    // Si el porteador no cabe o no se puede pagar, se intenta la tropa: dejar
    // la ranura vacía por orgullo sería el peor error posible.
    ctx.train(this.soldierId);
  }

  /**
   * ¿Toca ampliar economía?
   *
   * Sí mientras no se alcance el mínimo vital, y después solo si el ejército
   * ya cubre la economía existente en la proporción que marca el perfil.
   */
  private wantsHarvester(harvesters: number, soldiers: number): boolean {
    const p = this.profile;
    if (harvesters < p.harvesterTarget) return true;
    if (harvesters >= p.harvesterMax) return false;
    return soldiers >= harvesters * p.armyPerHarvester;
  }

  // -------------------------------------------------------------------------
  // 2. Postura
  // -------------------------------------------------------------------------

  /** Acumula o descuenta el temporizador de amenaza según lo que se vea. */
  private trackThreat(ctx: AiStrategyContext, dt: number): void {
    const alarmLine = ctx.me.baseX - this.profile.defenseLineOffset;
    let intruder = false;

    for (const unit of ctx.world.units) {
      if (!unit.alive || unit.team !== ctx.enemy.id) continue;
      if (unit.transform.x >= alarmLine) {
        intruder = true;
        break;
      }
    }

    if (intruder) {
      this.threatTimer += dt;
    } else {
      // La alarma se enfría al doble de rápido de lo que sube: la IA vuelve a
      // sus asuntos sin quedarse encerrada en casa el resto de la partida.
      this.threatTimer = Math.max(0, this.threatTimer - dt * 2);
    }
  }

  private decideStance(ctx: AiStrategyContext): void {
    // --- Regla 1: defensa reactiva (máxima prioridad) ---
    // Sin ella bastaría con esperar a que la IA saliera de casa y colarse por
    // detrás: la partida se ganaría con un truco en lugar de con estrategia.
    if (this.threatTimer >= this.profile.reactionDelay) {
      ctx.setStance('defend');
      this.pushTimer = 0;
      return;
    }

    // --- Empuje en curso ---
    if (this.pushTimer > 0) {
      // Un ataque que se ha torcido se corta: la tropa que queda vuelve a casa
      // y se suma a la siguiente oleada en vez de morir a plazos. Los perfiles
      // que no saben hacer esto (`retreatRatio` a 0) queman su ejército en
      // ataques perdidos, que es la forma más cara de equivocarse.
      const ratio = this.profile.retreatRatio;
      if (ratio > 0 && ctx.powerOf(ctx.me.id) < ctx.powerOf(ctx.enemy.id) * ratio) {
        this.pushTimer = 0;
        ctx.setStance('defend');
        return;
      }
      ctx.setStance('attack');
      return;
    }

    // --- Regla 2: umbral de agresión ---
    const myPower = ctx.powerOf(ctx.me.id);
    const theirPower = ctx.powerOf(ctx.enemy.id);
    const army = ctx.countUnits(ctx.me.id, this.soldierId);

    // El caso `theirPower === 0` es deliberado: si el jugador no tiene ni un
    // soldado, la IA ataca sin más y castiga al que solo invierte en economía.
    const hasAdvantage =
      theirPower === 0 ? myPower > 0 : myPower >= theirPower * this.profile.aggressionRatio;

    // Segundo error deliberado: atacar con masa pero sin ventaja. Regala el
    // ejército contra una línea defensiva preparada, que es la equivocación
    // más habitual —y más humana— de este género.
    const impatient =
      this.profile.mistakeChance > 0 && ctx.rng.chance(this.profile.mistakeChance * 0.5);

    if ((hasAdvantage || impatient) && army >= this.profile.minArmyToAttack) {
      this.pushTimer = this.profile.pushDuration;
      ctx.setStance('attack');
    } else {
      ctx.setStance('defend');
    }
  }
}
