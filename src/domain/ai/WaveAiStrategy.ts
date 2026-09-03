import type { AiProfile } from '../balance/types.js';
import type { AiStrategyContext, IAiStrategy } from './IAiStrategy.js';

/**
 * IA por oleadas del nivel 1.
 *
 * Tres reglas, evaluadas siempre en este orden de prioridad:
 *
 *  1. **Defensa reactiva.** Si el jugador cruza la línea de alarma, todo el
 *     bando se repliega a defender de inmediato. Sin esta regla, bastaría con
 *     esperar a que la IA saliera de casa y colarse por detrás: el nivel se
 *     ganaría con un truco en lugar de con estrategia.
 *
 *  2. **Umbral de agresión.** Solo ataca si su poder supera al del jugador por
 *     un margen. Una IA que ataca siempre regala sus unidades de dos en dos;
 *     una que acumula y empuja cuando lleva ventaja produce el vaivén de
 *     tensión característico de Stick War.
 *
 *  3. **Oleadas programadas.** Refuerzos periódicos, crecientes, con un tope
 *     duro total que garantiza que la partida termina.
 *
 * La IA no gestiona recolectores: cobra una renta virtual. Es una decisión
 * deliberada — elimina toda una clase de errores (recolectores enemigos que se
 * atascan o mueren y dejan a la IA sin economía) y hace que la dificultad se
 * ajuste con un solo número.
 */
export class WaveAiStrategy implements IAiStrategy {
  readonly id = 'wave';

  /** Suministros virtuales acumulados. */
  private budget = 0;
  /** Segundos hasta la próxima oleada. */
  private nextWaveIn: number;
  /** Tamaño de la próxima oleada. */
  private waveSize: number;
  /** Segundos restantes del empuje ofensivo en curso. */
  private pushTimer = 0;
  /** Acumulador para reevaluar a 2 Hz en vez de en cada paso. */
  private thinkTimer = 0;

  constructor(
    private readonly profile: AiProfile,
    private readonly unitId: string,
    private readonly unitCost: number,
  ) {
    this.nextWaveIn = profile.firstWaveAt;
    this.waveSize = profile.waveSize;
  }

  tick(ctx: AiStrategyContext, dt: number): void {
    this.budget += this.profile.incomePerSec * dt;
    this.nextWaveIn -= dt;
    if (this.pushTimer > 0) this.pushTimer -= dt;

    // Pensar dos veces por segundo es de sobra para decisiones de este calibre,
    // y evita que la postura oscile de un paso al siguiente.
    this.thinkTimer += dt;
    if (this.thinkTimer < 0.5) return;
    this.thinkTimer = 0;

    this.trySpawnWave(ctx);
    this.decideStance(ctx);
  }

  /** Regla 3: refuerzos periódicos, dentro de los topes. */
  private trySpawnWave(ctx: AiStrategyContext): void {
    if (this.nextWaveIn > 0) return;
    if (ctx.me.totalSpawned >= this.profile.maxTotalSpawned) return;

    const living = ctx.world.countLiving(ctx.me.id);
    if (living >= this.profile.maxConcurrent) return;

    let spawned = 0;
    for (let i = 0; i < this.waveSize; i++) {
      if (this.budget < this.unitCost) break;
      if (ctx.me.totalSpawned >= this.profile.maxTotalSpawned) break;
      if (living + spawned >= this.profile.maxConcurrent) break;
      this.budget -= this.unitCost;
      ctx.spawn(this.unitId);
      spawned++;
    }

    if (spawned > 0) {
      this.nextWaveIn = this.profile.waveInterval;
      this.waveSize += this.profile.waveSizeGrowth;
    } else {
      // Sin presupuesto o sin cupo: se reintenta pronto en vez de perder la ronda.
      this.nextWaveIn = 3;
    }
  }

  /** Reglas 1 y 2: elegir la postura del bando. */
  private decideStance(ctx: AiStrategyContext): void {
    // --- Regla 1: defensa reactiva (máxima prioridad) ---
    const alarmLine = ctx.me.baseX - this.profile.defenseLineOffset;
    for (const unit of ctx.world.units) {
      if (!unit.alive || unit.team !== ctx.enemy.id) continue;
      if (unit.transform.x >= alarmLine) {
        ctx.setStance('defend');
        this.pushTimer = 0;
        return;
      }
    }

    // --- Empuje en curso: no se reevalúa hasta que se agote ---
    if (this.pushTimer > 0) {
      ctx.setStance('attack');
      return;
    }

    // --- Regla 2: umbral de agresión ---
    const myPower = ctx.powerOf(ctx.me.id);
    const theirPower = ctx.powerOf(ctx.enemy.id);
    const living = ctx.world.countLiving(ctx.me.id);

    // El caso `theirPower === 0` es deliberado: si el jugador no tiene ni un
    // soldado, la IA ataca sin más y castiga al que solo invierte en economía.
    const hasAdvantage =
      theirPower === 0 ? myPower > 0 : myPower >= theirPower * this.profile.aggressionRatio;

    if (hasAdvantage && living >= Math.min(2, this.profile.waveSize)) {
      this.pushTimer = this.profile.pushDuration;
      ctx.setStance('attack');
    } else {
      ctx.setStance('defend');
    }
  }
}
