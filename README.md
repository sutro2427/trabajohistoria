# Mekong Front: 1968

Juego de estrategia en tiempo real, **pixel art 2D en vista lateral**, ambientado en la Guerra de Vietnam. Tres operaciones encadenadas, jugable desde el teléfono, con **panel de posiciones compartido en vivo** para competir en clase.

> **La guerra no la gana quien tiene más recursos, sino quien los pone a trabajar antes.**

---

## Guía rápida para la clase

### Antes de la sesión

1. **Despliega el juego** (ver [Puesta en marcha](#puesta-en-marcha)).
2. Abre el panel de profesor: `https://tu-sitio.netlify.app/?admin=TU_CLAVE`
3. Comparte con los alumnos el enlace **sin** la clave: `https://tu-sitio.netlify.app/`

### Durante la sesión

1. Cada alumno entra, escribe **nombre y apellido** y queda en la sala de espera.
2. Tú ves la lista de quién está listo. Cuando estén todos, pulsas **Dar la salida**.
3. Todos arrancan a la vez en la Operación 1.
4. El panel (🏆) muestra las posiciones en vivo: nivel alcanzado y tiempo.
5. **Gana el primer alumno que complete las tres operaciones.**

Para otra tanda, **Reiniciar sala**. Con `?sala=2b` abres una sala distinta por curso.

> Los datos de cada alumno **se borran solos a la hora**. Los resultados de quienes completan la campaña quedan guardados aparte, en un archivo permanente que solo tú puedes consultar desde la consola de Firebase.

---

## La campaña

| # | Operación | Qué introduce | Dificultad |
|---|---|---|---|
| 1 | **Valle de Ia Drang** | Solo infantería. Se aprende el ciclo: recolectar, producir, atacar | Accesible |
| 2 | **Colina 812** | Francotiradores. Hay que componer el ejército, no solo acumular tropa | Media |
| 3 | **Paso del Mekong** | Blindados y bombas de racimo. Todo sale del mismo bolsillo | Difícil |

La curva no sube números: **cada nivel añade una decisión nueva**. Y la dificultad la fija el nivel, no el jugador, para que todos los alumnos compitan bajo las mismas condiciones.

Verificado con partidas simuladas (ocho semillas por nivel, jugador competente): **8/8 · 7/8 · 4/8 victorias**. El nivel final se gana aproximadamente la mitad de las veces — difícil pero no imposible.

---

## Cómo se juega

| Acción | Móvil | Teclado |
|---|---|---|
| Comprar unidad | botones de *Producción* | `1` `2` `3` `4` |
| Bombas de racimo | botón *Bombas* → tocar el mapa | `B` |
| Atacar / Defender / Retirarse | botones de *Órdenes* | `A` `D` `R` |
| Mover la cámara | arrastrar con el dedo | `←` `→` |
| Ver posiciones | botón 🏆 | — |

**La apertura que funciona:** dos recolectores, luego una guardia de tres soldados, y solo entonces ampliar la economía. Dedicar los primeros treinta segundos solo a recolectores es suicida: la IA ataca antes de que rindan.

**El freno real no es el dinero, es la cola de entrenamiento de una sola ranura.** Quien vuelve a pulsar en cuanto se libera produce sin pausas; quien tarda un segundo deja huecos. Ahí está la parte de "rapidez al actuar".

### Unidades

| Unidad | Coste | Pob. | Para qué sirve |
|---|---|---|---|
| **Soldado** | 5 | 1 | La base de todo. Barato y sólido |
| **Recolector** | 6 | 1 | Tu economía. Vulnerable: protégelo |
| **Francotirador** | 10 | 1 | Mata infantería **de un disparo** desde lejos. Frágil en corta |
| **Tanque M48** | 55 | 8 | Arrasa infantería, pero el francotirador le dispara desde más lejos |
| **Bombas de racimo** | 30 | — | Siete explosiones en área. Tardan un segundo en caer: hay que anticipar |

Cada unidad tiene su contra. El nivel 3 no se gana acumulando la unidad más cara, sino componiendo el ejército correcto.

---

## Puesta en marcha

```bash
npm install
npm run dev      # http://localhost:5173
```

### Desplegar en Netlify

El repositorio ya trae `netlify.toml`. Conecta el repo desde el panel de Netlify y despliega — no hace falta configurar nada más para que el juego funcione.

### Activar el panel compartido (Firebase)

Sin esto el juego funciona igual, pero cada alumno ve solo su progreso.

1. Crea un proyecto en [console.firebase.google.com](https://console.firebase.google.com).
2. **Firestore Database** → Crear base de datos → modo producción.
3. **Reglas** → pega el contenido de [`firestore.rules`](./firestore.rules) → Publicar.
4. **Authentication** → Sign-in method → activa **Anónimo**.
5. ⚙ Configuración del proyecto → Tus aplicaciones → Web → copia la configuración.
6. En Netlify, **Site settings → Environment variables**, añade las variables de [`.env.example`](./.env.example).
7. Vuelve a desplegar.

Para que los datos se borren solos en el servidor: **Firestore → TTL → Crear política** sobre el campo `expiresAt` en las colecciones `rooms` y `rooms/{id}/players`. El cliente ya ignora lo caducado, así que esto es la limpieza de fondo.

---

## Arquitectura

La regla que sostiene todo el diseño:

> **El paquete `src/domain/` no importa nada del DOM.** Ni `document`, ni `canvas`, ni `window`.

Eso permite ejecutar partidas completas en tests de Node, en milisegundos y de forma determinista — que es como se calibró el balance de los tres niveles.

```
src/
  core/         GameLoop (paso fijo + interpolación), EventBus tipado, Rng sembrado
  domain/       ← SIMULACIÓN, CERO DOM
    balance/    balance.ts · levels.ts · difficulty.ts   ★ fuente única de verdad
    world/      World, Entity (composición), Team, ResourceNode, Strike
    states/     máquina de estados por unidad
    systems/    diez sistemas en orden fijo
    commands/   órdenes del jugador como objetos encolados
    ai/         estrategia económica del enemigo
  campaign/     ← COMPETENCIA, CERO DOM salvo el adaptador de Firebase
    CampaignRun · nameValidation · ICompetition · LocalCompetition · FirebaseCompetition
  art/          ← GENERACIÓN DE SPRITES, CERO DOM
  render/       ← ÚNICA CAPA QUE TOCA EL CANVAS
  ui/           HUD, barra de mando, sala de espera y tabla, en DOM
  app/          Game (raíz de composición) · DebugBridge
```

### Patrones aplicados

| Patrón | Dónde | Qué resuelve |
|---|---|---|
| **State** | `domain/states/` | Cada unidad se gobierna sola. Instancias compartidas: cero asignaciones por fotograma |
| **Command** | `domain/commands/` | El input nunca muta el mundo directamente: se encola. De ahí el determinismo |
| **Strategy** | `domain/ai/` | Cambiar la IA no toca el sistema que la ejecuta |
| **Factory** | `domain/factories/` | Las unidades se crean solo desde el catálogo. **Ni un `switch` por tipo** |
| **Observer** | `core/EventBus` | La simulación anuncia; interfaz, efectos y red escuchan |
| **Repository** | `persistence/`, `campaign/ICompetition` | Firebase es intercambiable: si falla, se juega en local |
| **Flyweight** | `render/SpriteAtlas` | Cada fotograma se hornea una vez y se comparte |

**SOLID en concreto:** cada sistema hace una cosa (SRP); el juego es *data-driven*, así que añadir el francotirador fue un registro en `balance.ts` más una receta de sprite (OCP); se descartó la jerarquía `Unidad → Soldado → Tanque` en favor de composición precisamente porque un tanque no es sustituible por un soldado (LSP); una entidad solo lleva los componentes de su rol (ISP); y `Simulation` depende de `ISystem`, no de sistemas concretos (DIP).

---

## El arte: cero archivos, todo generado en código

No hay ni un PNG en el repositorio. Cada sprite se dibuja píxel a píxel al arrancar (~80 ms para todo el juego).

**Un solo cuerpo humanoide de 22×22 px genera las cuatro unidades a pie**, parametrizado por `Pose` (dónde está cada parte en este fotograma) y `SoldierSkin` (colores, tocado, arma, suciedad). El soldado, el francotirador, el guerrillero y el recolector son la misma función con distintos argumentos. Los blindados tienen receta propia, con cadenas rodando y retroceso de cañón.

Las animaciones tampoco son dibujos, sino **funciones de pose**: un `AnimClip` declara fotogramas, fps y un `eventFrame` que marca el instante exacto en que sale la bala. Por eso el fogonazo, el retroceso y el proyectil ocurren a la vez.

Y la función de la que depende todo el aspecto: **`PixelBuffer.outline()`**, que rodea con un contorno oscuro todo lo dibujado.

---

## Verificación

```bash
npm run verify    # typecheck + 112 tests
npm run build     # compila a dist/
```

**112 tests en tres niveles:**

1. **Unitarios** — economía, combate, máquina de estados, IA, sprites, validación de nombres, ranking.
2. **Partidas completas simuladas** — lo que de verdad valida el balance: que cada nivel sea ganable, que jugar mal se castigue, que ninguna partida se cuelgue y que la dificultad suba de nivel en nivel.
3. **Regresión de arte** — huella SHA-1 de cada sprite: detecta un cambio visual accidental sin abrir un navegador.

Las simulaciones destaparon tres fallos que a ojo no se habrían visto: el francotirador era una trampa (comprarlo bajaba las victorias de 6/8 a 0/8), el tanque batía más lejos que cualquier otra unidad y no tenía respuesta posible, y subir la IA a difícil *a la vez* que se añadían unidades nuevas hacía el nivel imposible.

---

## Originalidad

El juego toma de *Stick War: Legacy* únicamente su **estructura de juego**: economía con recolectores, compra por botones, órdenes de escuadra, comportamiento autónomo de las unidades y victoria por destruir la posición enemiga. Eso son mecánicas, no contenido protegible.

Todo lo demás —sprites, animaciones, paleta, escenario, unidades, niveles, ambientación y balance— es original y lo genera el código de este repositorio.
