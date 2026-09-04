import { clamp, damp } from '../core/math.js';
import { WORLD } from '../domain/balance/balance.js';

/**
 * Cámara lateral.
 *
 * Sigue el **centroide de la acción**: el punto medio entre la unidad aliada
 * más avanzada y la enemiga más avanzada. Ese encuadre es lo que hace que el
 * frente de batalla quede siempre en pantalla mientras la línea se desplaza,
 * en lugar de tener que perseguirla manualmente.
 */
export class Camera {
  /** Borde izquierdo del área visible, en coordenadas del mundo. */
  x = 0;

  /**
   * Aumento del campo de batalla. 1 = vista normal.
   *
   * No cambia el tamaño del lienzo ni la resolución lógica: multiplica lo que
   * se dibuja. Con `imageSmoothingEnabled` desactivado el escalado es por
   * vecino más cercano, así que el pixel art se agranda con el borde duro
   * intacto en lugar de emborronarse.
   *
   * Su efecto secundario es el que de verdad importa en el juego: al acercar
   * se ve MENOS campo de batalla, así que ganar detalle cuesta perder vista de
   * conjunto. Es una decisión del jugador, no un ajuste gratis.
   */
  private zoomLevel = 1;

  /** Límites del aumento. Por debajo de 1 se vería el borde del mundo. */
  static readonly MIN_ZOOM = 1;
  static readonly MAX_ZOOM = 3.5;

  /**
   * Ancho de mundo que se busca tener a la vista, en píxeles lógicos.
   *
   * Es la cifra que fija el aumento por defecto, y merece explicación porque
   * es lo que hacía que el juego se viera diminuto en un teléfono.
   *
   * El lienzo se adapta al aspecto real de la pantalla: un móvil muy
   * panorámico pide un ancho lógico de 760 px. Dibujar 760 px de mundo en esa
   * pantalla deja cada píxel del juego del tamaño de un píxel de pantalla, y un
   * soldado de 22 px de alto se queda en una mota. Peor todavía, tres cuartas
   * partes de lo que se ve es cielo vacío.
   *
   * Con este objetivo, el aumento inicial se calcula para enseñar SIEMPRE más o
   * menos el mismo trozo de campo de batalla, mida lo que mida la pantalla. Los
   * 400 px son algo menos de un tercio del mapa (1260): cabe la base propia con
   * sus primeros depósitos, o una línea de combate entera, que es la unidad de
   * información con la que se juega. Y las unidades pasan de medir 22 píxeles
   * de pantalla a medir más de 50, que es la diferencia entre distinguir un
   * francotirador de un soldado y no distinguirlos.
   */
  static readonly TARGET_VIEW_WIDTH = 400;

  /**
   * Dónde se dibuja la línea de suelo, en píxeles de pantalla, con la vista
   * acercada del todo.
   *
   * Sin esto, acercar empeoraba el encuadre en vez de mejorarlo. La línea de
   * suelo vive en la fila 206 de 270, o sea al 76 % de la altura, y al escalar
   * anclando ahí se quedaba clavada al 76 %: las unidades pegadas al borde
   * inferior y todo el espacio ganado ocupado por la pared de selva que tienen
   * detrás. Subiéndola hacia el 63 % conforme se acerca, la tropa queda
   * centrada y el terreno que pisa se ve, que es lo que se está mirando.
   */
  private static readonly ZOOMED_GROUND_Y = 172;

  /** Desplazamiento vertical de la sacudida por explosiones. */
  shakeY = 0;
  private shakeAmount = 0;

  /** Segundos que quedan de control manual antes de reanudar el seguimiento. */
  private manualTimer = 0;

  constructor(private viewWidth: number = WORLD.logicalWidth) {}

  /**
   * Actualiza el ancho visible.
   *
   * Se llama al girar el teléfono o al entrar en pantalla completa: si la
   * cámara siguiera creyendo que ve 480 px cuando la pantalla muestra 620, el
   * clamp a los bordes del mapa dejaría ver el vacío del final del mundo.
   */
  setViewWidth(width: number): void {
    this.viewWidth = width;
    this.x = clamp(this.x, 0, this.maxX);
  }

  /**
   * Aumento con el que empieza una operación en esta pantalla.
   *
   * No es 1: en una pantalla ancha, 1 significa ver medio mapa de golpe y con
   * las unidades del tamaño de una mota. Se calcula para que el trozo de campo
   * visible sea parecido en cualquier aparato (ver `TARGET_VIEW_WIDTH`).
   */
  get defaultZoom(): number {
    return clamp(this.viewWidth / Camera.TARGET_VIEW_WIDTH, Camera.MIN_ZOOM, Camera.MAX_ZOOM);
  }

  /** Vuelve al aumento inicial de esta pantalla. */
  resetZoom(): void {
    this.setZoom(this.defaultZoom);
  }

  /**
   * Ancho de mundo visible, en píxeles lógicos.
   *
   * OJO: no es el ancho del lienzo, es el trozo de mundo que cabe en él. Con
   * el doble de aumento cabe la mitad. Todo lo que razona sobre "qué se ve"
   * —el recorte contra los bordes del mapa, el descarte de lo que queda fuera
   * de pantalla, el bucle de las tiras de fondo— tiene que usar este valor y
   * no el del lienzo, o al acercar se vería el vacío del final del mundo.
   */
  get width(): number {
    return this.viewWidth / this.zoomLevel;
  }

  /** Ancho real del lienzo, en píxeles. Solo para borrar el fotograma. */
  get canvasWidth(): number {
    return this.viewWidth;
  }

  get zoom(): number {
    return this.zoomLevel;
  }

  /**
   * Fila de pantalla en la que se dibuja la línea de suelo.
   *
   * Es la mitad vertical de la transformación de dibujo: el render escala por
   * `zoom` y traslada para que el suelo caiga aquí. A aumento 1 devuelve la
   * posición original, así que la vista sin acercar se ve exactamente como
   * siempre.
   */
  get groundScreenY(): number {
    const t = clamp((this.zoomLevel - 1) / 1.2, 0, 1);
    return WORLD.groundY + (Camera.ZOOMED_GROUND_Y - WORLD.groundY) * t;
  }

  /**
   * Fija el aumento manteniendo fijo el centro de la vista.
   *
   * Sin recentrar, acercar arrastraría la escena hacia la izquierda: el borde
   * izquierdo se queda donde está y el mundo visible se encoge desde la
   * derecha. Conservar el centro es lo que hace que el gesto se sienta como
   * "acercarme a lo que estoy mirando".
   */
  setZoom(next: number): void {
    const centerX = this.x + this.width * 0.5;
    this.zoomLevel = clamp(next, Camera.MIN_ZOOM, Camera.MAX_ZOOM);
    this.x = clamp(centerX - this.width * 0.5, 0, this.maxX);
  }

  /** Máximo desplazamiento posible sin salir del mapa. */
  private get maxX(): number {
    return Math.max(0, WORLD.battlefieldWidth - this.width);
  }

  /** Coloca la cámara de golpe, sin suavizado (al iniciar un nivel). */
  snapTo(worldX: number): void {
    this.x = clamp(worldX - this.width * 0.5, 0, this.maxX);
  }

  /** Desplazamiento manual del jugador (arrastre o teclas). */
  pan(deltaX: number): void {
    this.x = clamp(this.x + deltaX, 0, this.maxX);
    // Tras soltar, la cámara espera un par de segundos antes de retomar el
    // seguimiento: si volviera de inmediato, mirar el mapa sería imposible.
    this.manualTimer = 2;
  }

  /**
   * Actualiza la posición.
   *
   * @param focusX Centro de interés calculado por el llamante.
   */
  update(dt: number, focusX: number): void {
    // La sacudida decae siempre, incluso durante el control manual.
    if (this.shakeAmount > 0) {
      this.shakeAmount = Math.max(0, this.shakeAmount - dt * 26);
      // Alterna de signo cada frame: una vibración seca, no un balanceo.
      this.shakeY = (Math.random() - 0.5) * this.shakeAmount;
    } else {
      this.shakeY = 0;
    }

    if (this.manualTimer > 0) {
      this.manualTimer -= dt;
      return;
    }

    const target = clamp(focusX - this.width * 0.5, 0, this.maxX);

    // Zona muerta: por debajo de este umbral la cámara no se mueve. Evita el
    // temblor constante provocado por unidades que se empujan entre sí.
    if (Math.abs(target - this.x) < 8) return;

    this.x = damp(this.x, target, 3.5, dt);
  }

  /** Provoca una sacudida (disparo de tanque, estructura destruida). */
  shake(amount: number): void {
    this.shakeAmount = Math.max(this.shakeAmount, amount);
  }

  /** Convierte una coordenada del mundo en coordenada de pantalla. */
  toScreenX(worldX: number): number {
    return worldX - this.x;
  }

  /** `true` si algo situado en `worldX` con ese ancho puede verse. */
  isVisible(worldX: number, width: number): boolean {
    const screenX = worldX - this.x;
    return screenX + width > -8 && screenX - width < this.width + 8;
  }
}
