import { PALETTE } from '../art/palette.js';
import type { EventBus } from '../core/EventBus.js';
import { Rng } from '../core/Rng.js';
import type { GameEvents } from '../domain/events.js';
import type { Camera } from './Camera.js';

/**
 * Partículas y textos flotantes.
 *
 * Se alimenta **exclusivamente del bus de eventos**: no lee el mundo ni sabe
 * qué es una unidad. La simulación anuncia "alguien disparó aquí" y este
 * sistema decide que eso se ve como un fogonazo. Se puede borrar entero sin
 * que el juego deje de funcionar — solo se verá más soso.
 */

type ParticleKind = 'spark' | 'smoke' | 'blood' | 'debris' | 'muzzle';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  kind: ParticleKind;
  size: number;
}

/** Número que sube y se desvanece sobre la base (por ejemplo "+3"). */
interface FloatingText {
  x: number;
  y: number;
  text: string;
  life: number;
  color: string;
}

export class FxSystem {
  private readonly particles: Particle[] = [];
  private readonly texts: FloatingText[] = [];
  private readonly rng = new Rng(1337);

  /**
   * Tope de partículas simultáneas.
   * Con muchas unidades disparando a la vez, sin tope el número crece sin
   * control y hunde la tasa de refresco justo en el momento más intenso.
   */
  private static readonly MAX_PARTICLES = 260;

  constructor(bus: EventBus<GameEvents>, private readonly camera: Camera) {
    bus.on('weapon:fired', ({ muzzleX, muzzleY, facing }) => {
      this.muzzleFlash(muzzleX, muzzleY, facing);
    });

    bus.on('damage:dealt', ({ x, y, killed }) => {
      this.impact(x, y, killed);
    });

    bus.on('projectile:hit', ({ x, y, splashRadius }) => {
      if (splashRadius > 0) {
        this.explosion(x, y);
        // La sacudida escala con el radio: un obús de tanque se siente
        // distinto de una bomba de racimo, sin necesitar un evento nuevo.
        this.camera.shake(Math.min(6, 2 + splashRadius * 0.08));
      }
    });

    bus.on('power:launched', ({ x, halfWidth }) => {
      // Silbido de llegada: polvo levantándose por toda la zona antes del
      // primer impacto. Es el aviso visual de que algo está a punto de caer.
      for (let i = 0; i < 10; i++) {
        this.spawn({
          x: x + this.rng.range(-halfWidth, halfWidth),
          y: 206,
          vx: this.rng.range(-8, 8),
          vy: this.rng.range(-30, -12),
          life: this.rng.range(0.4, 0.9),
          maxLife: 0.9,
          kind: 'smoke',
          size: 2,
        });
      }
    });

    bus.on('harvest:delivered', ({ amount, x, y }) => {
      this.addText(x, y - 24, `+${amount}`, '#ffd98a');
    });

    bus.on('structure:destroyed', ({ x, y }) => {
      for (let i = 0; i < 5; i++) {
        this.explosion(x + this.rng.range(-24, 24), y - this.rng.range(4, 34));
      }
      this.camera.shake(7);
    });
  }

  /** Destello y humo en la boca del cañón. */
  private muzzleFlash(x: number, y: number, facing: 1 | -1): void {
    this.spawn({
      x: x + facing * 3, y, vx: facing * 12, vy: -4,
      life: 0.07, maxLife: 0.07, kind: 'muzzle', size: 3,
    });
    for (let i = 0; i < 2; i++) {
      this.spawn({
        x: x + facing * 4, y: y + this.rng.range(-1, 1),
        vx: facing * this.rng.range(16, 40), vy: this.rng.range(-14, -4),
        life: 0.2, maxLife: 0.2, kind: 'spark', size: 1,
      });
    }
    this.spawn({
      x: x + facing * 6, y: y - 1,
      vx: facing * 6, vy: -10,
      life: 0.45, maxLife: 0.45, kind: 'smoke', size: 2,
    });
  }

  /** Salpicadura al recibir un impacto; más aparatosa si es mortal. */
  private impact(x: number, y: number, killed: boolean): void {
    const count = killed ? 9 : 3;
    for (let i = 0; i < count; i++) {
      this.spawn({
        x, y,
        vx: this.rng.range(-34, 34),
        vy: this.rng.range(-46, -10),
        life: this.rng.range(0.3, 0.65),
        maxLife: 0.65,
        kind: 'blood',
        size: 1,
      });
    }
  }

  /** Explosión con chispas, humo y cascotes. */
  private explosion(x: number, y: number): void {
    for (let i = 0; i < 12; i++) {
      this.spawn({
        x, y,
        vx: this.rng.range(-70, 70),
        vy: this.rng.range(-70, -14),
        life: this.rng.range(0.25, 0.6),
        maxLife: 0.6,
        kind: this.rng.chance(0.5) ? 'spark' : 'debris',
        size: this.rng.int(1, 2),
      });
    }
    for (let i = 0; i < 7; i++) {
      this.spawn({
        x: x + this.rng.range(-6, 6), y: y - this.rng.range(0, 8),
        vx: this.rng.range(-12, 12), vy: this.rng.range(-22, -8),
        life: this.rng.range(0.5, 1.1), maxLife: 1.1, kind: 'smoke',
        size: this.rng.int(2, 4),
      });
    }
  }

  private addText(x: number, y: number, text: string, color: string): void {
    this.texts.push({ x, y, text, life: 1.1, color });
    if (this.texts.length > 24) this.texts.shift();
  }

  private spawn(p: Particle): void {
    // Se descartan las nuevas en lugar de expulsar las viejas: sacrificar una
    // partícula que acaba de nacer se nota mucho menos que un parpadeo.
    if (this.particles.length >= FxSystem.MAX_PARTICLES) return;
    this.particles.push(p);
  }

  update(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i] as Particle;
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      // El humo sube; todo lo demás cae.
      p.vy += (p.kind === 'smoke' ? -26 : 150) * dt;
      p.vx *= 0.94;
    }

    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i] as FloatingText;
      t.life -= dt;
      t.y -= 14 * dt;
      if (t.life <= 0) this.texts.splice(i, 1);
    }
  }

  draw(ctx: CanvasRenderingContext2D, cameraX: number): void {
    for (const p of this.particles) {
      const t = p.life / p.maxLife;
      ctx.globalAlpha = p.kind === 'smoke' ? t * 0.55 : t;
      ctx.fillStyle = colorFor(p.kind);
      const size = p.kind === 'smoke' ? p.size * (1.6 - t) : p.size;
      ctx.fillRect(
        Math.round(p.x - cameraX),
        Math.round(p.y),
        Math.max(1, Math.round(size)),
        Math.max(1, Math.round(size)),
      );
    }

    ctx.globalAlpha = 1;
    ctx.font = '7px monospace';
    ctx.textAlign = 'center';
    for (const t of this.texts) {
      ctx.globalAlpha = Math.min(1, t.life);
      // Contorno oscuro para que el número se lea sobre cualquier fondo.
      ctx.fillStyle = '#14140f';
      ctx.fillText(t.text, Math.round(t.x - cameraX) + 1, Math.round(t.y) + 1);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, Math.round(t.x - cameraX), Math.round(t.y));
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }

  clear(): void {
    this.particles.length = 0;
    this.texts.length = 0;
  }
}

function colorFor(kind: ParticleKind): string {
  const c = {
    spark: PALETTE.muzzle,
    muzzle: PALETTE.muzzleHot,
    smoke: PALETTE.smoke,
    blood: PALETTE.blood,
    debris: PALETTE.brownDark,
  }[kind];
  return `rgb(${c.r},${c.g},${c.b})`;
}
