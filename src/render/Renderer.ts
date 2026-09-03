import type { ClipName } from '../art/AnimationCatalog.js';
import { PALETTE } from '../art/palette.js';
import { WORLD } from '../domain/balance/balance.js';
import type { UnitDef } from '../domain/balance/types.js';
import type { Entity, Structure } from '../domain/world/Entity.js';
import type { World } from '../domain/world/World.js';
import type { Camera } from './Camera.js';
import type { FxSystem } from './FxSystem.js';
import type { SpriteAtlas, Sprite } from './SpriteAtlas.js';
import { Rng } from '../core/Rng.js';
import { lerp } from '../core/math.js';
import { SUPPLY_DROP_STAGES } from '../art/SpriteBaker.js';

/**
 * ============================================================================
 * RENDER POR CAPAS
 * ============================================================================
 *
 * Orden de pintado, de atrás hacia delante:
 *
 *   1. cielo (fijo)                          parallax 0.00
 *   2. colinas lejanas entre la niebla       parallax 0.20
 *   3. dosel de selva profundo               parallax 0.45
 *   4. dosel de selva cercano                parallax 0.70
 *   5. suelo                                 parallax 1.00
 *   6. elementos del escenario               parallax 1.00
 *   7. estructuras                           parallax 1.00
 *   8. unidades (ordenadas por Y)            parallax 1.00
 *   9. proyectiles                           parallax 1.00
 *  10. efectos                               parallax 1.00
 *  11. barras de vida                        parallax 1.00
 *  12. follaje de primer plano               parallax 1.30
 *
 * La capa 12 pasa por delante de las unidades y se mueve más rápido que el
 * mundo: es lo que sitúa la cámara *dentro* de la selva en lugar de mirándola
 * desde fuera.
 */

/** Elemento decorativo sembrado por el mapa. */
interface ScenerySprite {
  readonly sprite: Sprite;
  readonly x: number;
  readonly y: number;
  /** 0..1 — cuánta niebla se mezcla encima (los lejanos se lavan). */
  readonly haze: number;
}

export class Renderer {
  private readonly scenery: ScenerySprite[] = [];

  /**
   * Lienzo auxiliar para teñir un sprite sin contaminar la escena.
   *
   * `globalCompositeOperation = 'source-atop'` recorta contra TODO lo ya
   * dibujado en el lienzo de destino. Aplicado directamente sobre la escena
   * (que a esas alturas ya tiene el fondo pintado y por tanto es opaca de
   * lado a lado), teñía un rectángulo completo alrededor del sprite en vez de
   * la silueta —de ahí los recuadros verdes que aparecían tras las palmeras—.
   * Sobre este lienzo intermedio, que solo contiene el sprite, el recorte se
   * ajusta a la silueta real.
   */
  private readonly tintCanvas: HTMLCanvasElement;
  private readonly tintCtx: CanvasRenderingContext2D;

  constructor(
    private readonly ctx: CanvasRenderingContext2D,
    private readonly atlas: SpriteAtlas,
    private readonly camera: Camera,
    private readonly fx: FxSystem,
    private readonly defOf: (id: string) => UnitDef,
  ) {
    // Sin suavizado: es la línea que separa el pixel art nítido de una
    // imagen borrosa al escalar.
    this.ctx.imageSmoothingEnabled = false;

    this.tintCanvas = document.createElement('canvas');
    this.tintCanvas.width = 96;
    this.tintCanvas.height = 96;
    const tintCtx = this.tintCanvas.getContext('2d');
    if (!tintCtx) throw new Error('Renderer: no se pudo crear el lienzo auxiliar');
    this.tintCtx = tintCtx;
    this.tintCtx.imageSmoothingEnabled = false;

    this.scenery = this.seedScenery();
  }

  /**
   * Dibuja un sprite teñido con un color, respetando su silueta.
   *
   * @param alpha Intensidad del tinte, de 0 a 1.
   */
  private drawTinted(
    sprite: Sprite,
    dx: number,
    dy: number,
    color: string,
    alpha: number,
  ): void {
    if (alpha <= 0) return;
    // El lienzo auxiliar crece si algún sprite no cupiera; nunca ocurre con el
    // arte actual, pero evita un recorte silencioso si mañana se añade uno mayor.
    if (sprite.width > this.tintCanvas.width || sprite.height > this.tintCanvas.height) {
      this.tintCanvas.width = Math.max(this.tintCanvas.width, sprite.width);
      this.tintCanvas.height = Math.max(this.tintCanvas.height, sprite.height);
      this.tintCtx.imageSmoothingEnabled = false;
    }

    const t = this.tintCtx;
    t.clearRect(0, 0, this.tintCanvas.width, this.tintCanvas.height);
    t.globalAlpha = 1;
    t.globalCompositeOperation = 'source-over';
    t.drawImage(sprite, 0, 0);

    // Aquí el destino es solo el sprite, así que el recorte sigue su silueta.
    t.globalCompositeOperation = 'source-atop';
    t.globalAlpha = alpha;
    t.fillStyle = color;
    t.fillRect(0, 0, sprite.width, sprite.height);
    t.globalCompositeOperation = 'source-over';
    t.globalAlpha = 1;

    this.ctx.drawImage(this.tintCanvas, 0, 0, sprite.width, sprite.height, dx, dy, sprite.width, sprite.height);
  }

  /**
   * Siembra la decoración del mapa con un generador de semilla fija: la selva
   * es distinta en cada tramo pero **idéntica en cada partida**, que es lo que
   * la convierte en un lugar reconocible en vez de en ruido.
   */
  private seedScenery(): ScenerySprite[] {
    const rng = new Rng(9137);
    const items: ScenerySprite[] = [];
    const props = this.atlas.props;

    // Coordenadas de los depósitos, deducidas del mismo balance que usa la
    // simulación: hay que dejarlos despejados o la vegetación taparía justo la
    // información que el jugador necesita leer de un vistazo.
    const nodeX: number[] = [];
    for (const offset of WORLD.resourceOffsets) {
      nodeX.push(WORLD.usBaseX + offset, WORLD.vcBaseX - offset);
    }

    for (let x = 60; x < WORLD.battlefieldWidth - 40; x += rng.int(38, 96)) {
      // Se despeja el entorno inmediato de ambas bases para no tapar la acción.
      const nearBase =
        Math.abs(x - WORLD.usBaseX) < 70 || Math.abs(x - WORLD.vcBaseX) < 70;
      if (nearBase) continue;
      if (nodeX.some((nx) => Math.abs(x - nx) < 26)) continue;

      const roll = rng.next();
      let sprite: Sprite | undefined;
      let yOffset = 0;
      let haze = 0;

      if (roll < 0.3) {
        sprite = rng.chance(0.5) ? props['palm_a'] : props['palm_b'];
        // Las palmeras se plantan algo por detrás de la línea de combate.
        yOffset = -rng.int(2, 8);
        haze = 0.25;
      } else if (roll < 0.62) {
        sprite = props[`bush_${rng.pick(['a', 'b', 'c'])}`];
      } else if (roll < 0.74) {
        sprite = props['crater'];
      } else if (roll < 0.84) {
        sprite = props['stump'];
      } else if (roll < 0.93) {
        // Las barricadas siguen el bando cuyo territorio ocupan: sacos
        // terreros en la mitad estadounidense, bambú en la vietnamita.
        sprite = x < WORLD.battlefieldWidth * 0.5 ? props['sandbags'] : props['bamboo'];
      }

      if (sprite) items.push({ sprite, x, y: WORLD.groundY + yOffset, haze });
    }
    return items;
  }

  /**
   * Dibuja un fotograma completo.
   *
   * @param alpha     Factor de interpolación entre el paso anterior y el actual.
   * @param menuTime  Segundos transcurridos en el menú principal, o `null`
   *                  durante la partida. Cuando llega un valor se añade la
   *                  capa atmosférica del menú (helicópteros y humo).
   */
  render(world: World, alpha: number, menuTime: number | null = null): void {
    const ctx = this.ctx;
    const cam = this.camera.x;

    ctx.clearRect(0, 0, WORLD.logicalWidth, WORLD.logicalHeight);
    ctx.save();
    // La sacudida de cámara se aplica una sola vez, a todo el fotograma.
    ctx.translate(0, Math.round(this.camera.shakeY));

    this.drawBackground(cam);
    if (menuTime !== null) this.drawMenuAtmosphere(cam, menuTime);
    this.drawScenery(cam);
    this.drawResourceNodes(world, cam);
    this.drawStructures(world, cam);
    this.drawUnits(world, cam, alpha);
    this.drawProjectiles(world, cam, alpha);
    this.fx.draw(ctx, cam);
    this.drawHealthBars(world, cam);
    this.drawForeground(cam);

    ctx.restore();
  }

  // -------------------------------------------------------------------------
  // Capas de fondo
  // -------------------------------------------------------------------------

  private drawBackground(cam: number): void {
    const bg = this.atlas.background;
    const ctx = this.ctx;

    // 1. Cielo: no se desplaza en absoluto. Está infinitamente lejos.
    const sky = bg['sky'];
    if (sky) ctx.drawImage(sky, 0, 0);

    // 2-4. Capas de selva. Cada tira se ancla por su BASE a la línea de suelo
    // (con un ligero escalonado) en lugar de por su borde superior: así, midan
    // lo que midan, siempre cierran contra el terreno y nunca dejan un hueco
    // por el que se vea el fondo vacío.
    this.drawStripAnchoredToGround(bg['hills'], cam, 0.2, -34);
    this.drawStripAnchoredToGround(bg['canopyFar'], cam, 0.45, -14);
    this.drawStripAnchoredToGround(bg['canopyNear'], cam, 0.7, 0);

    // 5. Suelo.
    this.drawParallaxStrip(bg['ground'], cam, 1, WORLD.groundY);
  }

  private drawForeground(cam: number): void {
    // 12. Follaje que pasa por delante de las unidades y se mueve más rápido
    // que el mundo. Se sitúa a la altura de los pies para rozar a las tropas
    // sin llegar a ocultarlas.
    const strip = this.atlas.background['foreground'];
    if (!strip) return;
    this.drawParallaxStrip(strip, cam, 1.3, WORLD.groundY + 4 - strip.height * 0.35);
  }

  /**
   * Dibuja una tira de fondo alineando su base con la línea de suelo.
   *
   * @param lift Píxeles que se eleva la base respecto al suelo. Un valor
   *             negativo hunde la capa; escalonarlas así crea la profundidad.
   */
  private drawStripAnchoredToGround(
    strip: Sprite | undefined,
    cam: number,
    factor: number,
    lift: number,
  ): void {
    if (!strip) return;
    this.drawParallaxStrip(strip, cam, factor, WORLD.groundY + lift - strip.height);
  }

  /**
   * Dibuja una tira repitiéndola horizontalmente hasta cubrir la pantalla.
   *
   * El desplazamiento se redondea al píxel entero: con posiciones
   * fraccionarias el navegador interpola y el pixel art tiembla.
   */
  private drawParallaxStrip(
    strip: Sprite | undefined,
    cam: number,
    factor: number,
    y: number,
  ): void {
    if (!strip) return;
    const ctx = this.ctx;
    const offset = Math.round(cam * factor);
    // El módulo se normaliza a positivo: en JavaScript (-5 % 480) es -5.
    let x = -(((offset % strip.width) + strip.width) % strip.width);
    while (x < WORLD.logicalWidth) {
      ctx.drawImage(strip, x, y);
      x += strip.width;
    }
  }

  /**
   * Capa atmosférica del menú principal: humo en el horizonte y una patrulla
   * de helicópteros cruzando el valle.
   *
   * Todo se deriva del tiempo transcurrido, sin estado propio ni partículas:
   * el menú no debe pagar un sistema de simulación para tener vida. Y se
   * mantiene deliberadamente escaso —tres siluetas y dos columnas de humo—
   * porque detrás va un panel de texto que tiene que poder leerse.
   */
  private drawMenuAtmosphere(cam: number, t: number): void {
    const ctx = this.ctx;

    // --- Columnas de humo sobre la línea de selva ---
    // Se dibujan con paralaje de las capas lejanas para que pertenezcan al
    // fondo y no parezcan pegadas al cristal.
    const smokeParallax = 0.45;
    for (const [originX, seed] of [
      [WORLD.usBaseX + 260, 0],
      [WORLD.vcBaseX - 300, 3.1],
    ] as const) {
      const baseX = originX - cam * smokeParallax;
      for (let i = 0; i < 7; i++) {
        // Cada bocanada nace abajo y se disipa al subir, con un vaivén lento.
        const life = ((t * 0.16 + i / 7 + seed) % 1);
        const y = WORLD.groundY - 70 - life * 78;
        const drift = Math.sin(life * 5 + seed) * 9;
        const radius = 3 + life * 7;
        ctx.globalAlpha = 0.22 * (1 - life);
        ctx.fillStyle = `rgb(${PALETTE.smoke.r},${PALETTE.smoke.g},${PALETTE.smoke.b})`;
        ctx.beginPath();
        ctx.arc(Math.round(baseX + drift), Math.round(y), radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    // --- Patrulla de helicópteros ---
    const heli = this.atlas.props['heli'];
    if (!heli) return;

    const patrol: readonly (readonly [number, number, number])[] = [
      // [altura, velocidad px/s, desfase 0..1]
      [34, 22, 0.0],
      [58, 15, 0.45],
      [22, 30, 0.75],
    ];
    // Recorrido virtual algo mayor que la pantalla: entran y salen de cuadro.
    const span = WORLD.logicalWidth + heli.width * 3;

    for (const [y, speed, phase] of patrol) {
      // Vuelan de derecha a izquierda, hacia la posición estadounidense.
      const progress = (t * speed) / span + phase;
      const x = span - ((progress % 1) * span) - heli.width;
      ctx.globalAlpha = 0.55;
      ctx.drawImage(heli, Math.round(x), Math.round(y));
    }
    ctx.globalAlpha = 1;
  }

  private drawScenery(cam: number): void {
    const ctx = this.ctx;
    for (const item of this.scenery) {
      if (!this.camera.isVisible(item.x, item.sprite.width)) continue;
      const sx = Math.round(item.x - cam - item.sprite.width * 0.5);
      const sy = Math.round(item.y - item.sprite.height);
      if (item.haze > 0) {
        // Un velo de niebla sobre los elementos lejanos los empuja al fondo.
        this.drawTinted(
          item.sprite, sx, sy,
          `rgb(${PALETTE.fog.r},${PALETTE.fog.g},${PALETTE.fog.b})`,
          item.haze * 0.35,
        );
      } else {
        ctx.drawImage(item.sprite, sx, sy);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Entidades
  // -------------------------------------------------------------------------

  private drawStructures(world: World, cam: number): void {
    const ctx = this.ctx;
    for (const s of world.structures) {
      const sprite = this.atlas.structures[s.defId];
      if (!sprite || !this.camera.isVisible(s.x, sprite.width)) continue;

      const sx = Math.round(s.x - cam - sprite.width * 0.5);
      const sy = Math.round(s.y - sprite.height + 4);
      ctx.drawImage(sprite, sx, sy);

      // Destello blanco al recibir un impacto: retroalimentación inmediata de
      // que el fuego está haciendo efecto sobre la posición.
      if (s.hitFlash > 0) {
        this.drawTinted(sprite, sx, sy, '#fff4d0', Math.min(0.65, s.hitFlash * 7));
      }
    }
  }

  /**
   * Depósitos de suministros, dibujados según lo que les queda.
   *
   * El sprite se elige por tramos y no de forma continua porque el pixel art
   * no admite medias tintas: tres cajas, dos, una, ninguna. Cuatro estados
   * discretos que el jugador distingue de un vistazo desde el otro extremo de
   * la pantalla, que es toda la información que necesita para decidir si le
   * conviene defender ese bolsillo o ir preparando el siguiente.
   */
  private drawResourceNodes(world: World, cam: number): void {
    const ctx = this.ctx;
    for (const node of world.nodes) {
      const ratio = node.capacity > 0 ? node.amount / node.capacity : 0;
      const stage =
        node.amount <= 0
          ? 0
          : Math.max(1, Math.min(SUPPLY_DROP_STAGES, Math.ceil(ratio * SUPPLY_DROP_STAGES)));
      const sprite = this.atlas.structures[`supply_drop_${stage}`];
      if (!sprite || !this.camera.isVisible(node.x, sprite.width)) continue;

      ctx.drawImage(
        sprite,
        Math.round(node.x - cam - sprite.width * 0.5),
        Math.round(WORLD.groundY - sprite.height + 2),
      );
    }
  }

  /**
   * Dibuja las unidades ordenadas por su coordenada Y (algoritmo del pintor).
   *
   * Sin ese orden, una unidad "más cercana" (más abajo en pantalla) podría
   * quedar tapada por otra situada detrás, y la escena perdería toda
   * sensación de profundidad.
   */
  private drawUnits(world: World, cam: number, alpha: number): void {
    const visible = world.units.filter((u) =>
      this.camera.isVisible(u.transform.x, 24),
    );
    visible.sort((a, b) => a.transform.y - b.transform.y || a.id - b.id);

    for (const unit of visible) this.drawUnit(unit, cam, alpha);
  }

  private drawUnit(unit: Entity, cam: number, alpha: number): void {
    const ctx = this.ctx;
    const def = this.defOf(unit.defId);

    const sprite = this.atlas.frame(
      unit.defId,
      unit.anim.clip as ClipName,
      unit.anim.frame,
      unit.transform.facing,
    );
    if (!sprite) return;

    // Interpolación entre el paso anterior y el actual, redondeada al píxel.
    const x = Math.round(lerp(unit.transform.prevX, unit.transform.x, alpha) - cam);
    const y = Math.round(lerp(unit.transform.prevY, unit.transform.y, alpha));

    const dx = x - Math.floor(sprite.width * 0.5);
    const dy = y - sprite.height + 2;

    // El cadáver se desvanece durante su último segundo.
    if (!unit.alive) {
      ctx.globalAlpha = Math.max(0, Math.min(1, unit.corpseTimer));
    }

    ctx.drawImage(sprite, dx, dy);
    ctx.globalAlpha = 1;

    // Destello al recibir un impacto.
    if (unit.alive && unit.health.flinchTimer > 0 && def.flinchDuration > 0) {
      this.drawTinted(sprite, dx, dy, '#ffffff', Math.min(0.5, unit.health.flinchTimer * 3));
    }
  }

  private drawProjectiles(world: World, cam: number, alpha: number): void {
    const ctx = this.ctx;
    for (const p of world.projectiles) {
      if (!p.alive) continue;
      const x = lerp(p.prevX, p.x, alpha) - cam;
      const y = lerp(p.prevY, p.y, alpha);
      if (x < -8 || x > WORLD.logicalWidth + 8) continue;

      // La bala se dibuja como una estela corta en su dirección de vuelo:
      // un punto suelto a esta escala sería invisible.
      const speed = Math.hypot(p.vx, p.vy) || 1;
      const tailX = x - (p.vx / speed) * 4;
      const tailY = y - (p.vy / speed) * 4;

      ctx.strokeStyle = `rgb(${PALETTE.tracer.r},${PALETTE.tracer.g},${PALETTE.tracer.b})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.round(tailX) + 0.5, Math.round(tailY) + 0.5);
      ctx.lineTo(Math.round(x) + 0.5, Math.round(y) + 0.5);
      ctx.stroke();
    }
  }

  // -------------------------------------------------------------------------
  // Interfaz dentro del mundo
  // -------------------------------------------------------------------------

  private drawHealthBars(world: World, cam: number): void {
    const ctx = this.ctx;

    for (const unit of world.units) {
      if (!unit.alive) continue;
      // Solo se muestra la barra de quien ya ha sido herido: con todas las
      // barras visibles, la pantalla se convierte en una hilera de rectángulos
      // y se pierde de vista lo que importa.
      if (unit.health.hp >= unit.health.maxHp) continue;
      if (!this.camera.isVisible(unit.transform.x, 24)) continue;

      const def = this.defOf(unit.defId);
      const w = 12;
      const x = Math.round(unit.transform.x - cam - w * 0.5);
      const y = Math.round(unit.transform.y - def.spriteHeight - 6);
      const ratio = Math.max(0, unit.health.hp / unit.health.maxHp);

      ctx.fillStyle = '#14140f';
      ctx.fillRect(x - 1, y - 1, w + 2, 4);
      ctx.fillStyle = '#4a1414';
      ctx.fillRect(x, y, w, 2);
      ctx.fillStyle = unit.team === 'US' ? '#7ec850' : '#d4653f';
      ctx.fillRect(x, y, Math.max(0, Math.round(w * ratio)), 2);
    }

    // Las estructuras llevan barra siempre: su vida es el marcador de la partida.
    for (const s of world.structures) {
      if (!s.alive || !this.camera.isVisible(s.x, s.width)) continue;
      this.drawStructureBar(s, cam);
    }
  }

  private drawStructureBar(s: Structure, cam: number): void {
    const ctx = this.ctx;
    const w = 34;
    const x = Math.round(s.x - cam - w * 0.5);
    const y = Math.round(s.y - s.height - 6);
    const ratio = Math.max(0, s.hp / s.maxHp);

    ctx.fillStyle = '#14140f';
    ctx.fillRect(x - 1, y - 1, w + 2, 5);
    ctx.fillStyle = '#3a1010';
    ctx.fillRect(x, y, w, 3);
    ctx.fillStyle = s.team === 'US' ? '#7ec850' : '#d4653f';
    ctx.fillRect(x, y, Math.max(0, Math.round(w * ratio)), 3);
  }
}
