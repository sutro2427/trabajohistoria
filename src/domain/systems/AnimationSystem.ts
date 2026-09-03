import { CLIPS } from '../../art/AnimationCatalog.js';
import type { World } from '../world/World.js';
import type { ISystem } from './ISystem.js';

/**
 * Hace avanzar los fotogramas de las animaciones.
 *
 * Vive en el dominio y no en el render porque el fotograma no es solo un
 * dibujo: `eventFrame` marca el instante exacto en que la bala sale del cañón
 * o el recolector suelta la carga. Si el avance de la animación dependiera de
 * los FPS, la cadencia de fuego cambiaría según el equipo del jugador.
 *
 * El catálogo de animaciones solo aporta números (fotogramas, fps), no dibujos,
 * así que este sistema sigue sin tocar el DOM.
 */
export class AnimationSystem implements ISystem {
  readonly name = 'Animation';

  update(world: World, dt: number): void {
    for (const entity of world.units) {
      const anim = entity.anim;
      const clip = CLIPS[anim.clip];
      const frameDuration = 1 / clip.fps;

      anim.timer += dt;
      while (anim.timer >= frameDuration) {
        anim.timer -= frameDuration;
        if (anim.frame < clip.frames - 1) {
          anim.frame++;
        } else if (clip.loop) {
          anim.frame = 0;
          // Un clip cíclico vuelve a poder disparar su evento en cada vuelta:
          // así el recolector suma una carga por cada gesto de agacharse.
          anim.eventFired = false;
        } else {
          anim.finished = true;
          break;
        }
      }
    }
  }
}
