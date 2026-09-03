import type { Progress } from './Progress.js';

/**
 * Contrato de persistencia (patrón Repository + Inversión de Dependencias).
 *
 * El juego depende de esta interfaz, nunca de `localStorage`. Sustituirla por
 * un `FirebaseProgressRepository` —para guardar en la nube o publicar una
 * clasificación— no obliga a cambiar ni una línea del resto del proyecto: solo
 * el objeto que se construye en `main.ts`.
 */
export interface IProgressRepository {
  load(): Progress;
  save(progress: Progress): void;
  reset(): void;
}
