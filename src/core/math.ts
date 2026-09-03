/**
 * Utilidades matemáticas puras. Sin estado, sin DOM, sin dependencias.
 */

/** Restringe `v` al intervalo [min, max]. */
export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/** Interpolación lineal: t=0 devuelve `a`, t=1 devuelve `b`. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Interpolación exponencial independiente de la tasa de refresco.
 *
 * `lerp(a, b, 0.1)` por frame produce velocidades distintas a 30 y 144 fps.
 * Esta versión compensa con el `dt` real, así que la cámara se siente igual
 * en cualquier equipo.
 *
 * @param rate Velocidad de aproximación (unidades por segundo). Mayor = más rápido.
 */
export function damp(a: number, b: number, rate: number, dt: number): number {
  return lerp(a, b, 1 - Math.exp(-rate * dt));
}

/** Avanza `from` hacia `to` como mucho `maxDelta`, sin sobrepasarlo. */
export function approach(from: number, to: number, maxDelta: number): number {
  const diff = to - from;
  if (Math.abs(diff) <= maxDelta) return to;
  return from + Math.sign(diff) * maxDelta;
}

/** Distancia euclídea entre dos puntos. */
export function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay);
}

/**
 * Distancia al cuadrado. Preferida en comparaciones de rango porque evita
 * la raíz cuadrada, que se ejecutaría miles de veces por segundo.
 */
export function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
}

/** Signo estricto: nunca devuelve 0, útil para orientar sprites (facing). */
export function sign1(v: number): 1 | -1 {
  return v < 0 ? -1 : 1;
}

/** Redondea al entero más cercano; alias legible para el ajuste al píxel. */
export function snap(v: number): number {
  return Math.round(v);
}

/** Formatea segundos como "m:ss" para el cronómetro del HUD. */
export function formatTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
