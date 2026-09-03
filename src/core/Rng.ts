/**
 * Generador de números pseudoaleatorios con semilla (mulberry32).
 *
 * ¿Por qué no `Math.random()`? Porque el determinismo es lo que hace posible:
 *  - hornear sprites byte-idénticos en cada ejecución (tests de regresión de arte);
 *  - reproducir una partida completa a partir de una semilla (tests de balance);
 *  - depurar un bug de combate volviendo a ejecutar exactamente la misma partida.
 */
export class Rng {
  private state: number;

  constructor(seed: number = 1) {
    // `>>> 0` fuerza a entero de 32 bits sin signo, que es el dominio del algoritmo.
    this.state = seed >>> 0;
  }

  /** Flotante en [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Flotante en [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Entero en [min, max], ambos incluidos. */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  /** `true` con probabilidad `p` (0..1). */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Elemento al azar de un array no vacío. */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Rng.pick: el array está vacío');
    return items[Math.floor(this.next() * items.length)] as T;
  }

  /** Copia independiente con el mismo estado, para ramificar sin interferir. */
  fork(): Rng {
    const child = new Rng(1);
    child.state = this.state;
    return child;
  }
}
