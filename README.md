# PIXEL WAR — *by Ronka*

Juego de estrategia en tiempo real, **pixel art 2D en vista lateral**, ambientado en la Guerra de Vietnam. Tres operaciones encadenadas, jugable desde el teléfono, con **panel de posiciones compartido en vivo** para competir en clase.

> **La guerra no la gana quien tiene más recursos, sino quien los pone a trabajar antes.**

---

## Guía rápida para la clase

### Antes de la sesión

1. **Despliega el juego** (ver [Puesta en marcha](#puesta-en-marcha)).
2. Abre el **panel de control** en el equipo de la proyección:
   `https://tu-sitio.netlify.app/?admin` → te pide la contraseña (**`RONKAGEI`**).
   Si prefieres un enlace directo, sin que pregunte: `?admin=RONKAGEI`.
3. Comparte con los alumnos el enlace **sin** `?admin`: `https://tu-sitio.netlify.app/`
   (el propio panel lo muestra abajo para poder dictarlo).

### Durante la sesión

1. Cada alumno abre el enlace, pulsa **JUGAR**, escribe **nombre y apellido** y queda
   en la sala de espera. **No puede empezar por su cuenta**: el botón de empezar no
   existe hasta que tú das la salida.
2. En el panel ves quién ha entrado, en vivo. Si alguien entra con un nombre que no
   quieres proyectado, la **✕** de su fila lo saca de la sala; vuelve a entrar
   escribiendo su nombre real, sin tocar el progreso de nadie más.
3. Cuando estén todos, pulsas **Dar la salida**. A cada alumno le aparece de golpe un
   botón **¡ADELANTE! EMPEZAR** y arrancan la Operación 1.
4. **Deja el panel proyectado**: se actualiza solo con las posiciones en vivo —puesto,
   nombre, las tres operaciones como casillas que se van encendiendo, tiempo y
   derrotas—, más el recuento del grupo y un reloj con lo que le queda a la sala.
5. **Gana el primer alumno que complete las tres operaciones**, y el panel lo anuncia
   en la franja superior en cuanto ocurre.

> La contraseña del panel se comprueba en el navegador: sirve para que nadie entre por
> curiosidad, no como medida de seguridad. Quien protege los datos de verdad son las
> reglas de `firestore.rules`. Se puede cambiar por despliegue con `VITE_ADMIN_KEY`.

Para otra tanda, **Reiniciar sala**.

### Un paralelo por sala

Cada sala es una competencia independiente: su propia lista, su propia salida y su
propia tabla. En el panel, escribe el nombre del paralelo en **Sala** y pulsa **Abrir
sala** — el enlace para la clase se actualiza solo y el botón **Copiar** lo deja listo
para pegarlo en el grupo del curso.

| Paralelo | Enlace del profesor | Enlace de la clase |
|---|---|---|
| 4°A | `…/?admin&sala=4a` | `…/?sala=4a` |
| 4°B | `…/?admin&sala=4b` | `…/?sala=4b` |

Puedes tener las dos salas abiertas en dos pestañas y dar la salida a cada una cuando
le toque. Sin `?sala=` todo el mundo cae en la sala `clase`.

### En el teléfono

**Pantalla completa.** En Android basta el botón ⛶ (está en la portada, en el menú de
pausa y en la esquina de la partida). **En iPhone no existe**: Safari no implementa esa
API para nada que no sea un vídeo, así que la única vía real es instalar el juego —
*Compartir (⬆) → Añadir a pantalla de inicio*— y abrirlo desde el icono. Abierto así no
hay barra de direcciones ni pestañas, y se gana cerca de un 40 % de altura útil, que es
la diferencia entre ver el campo de batalla y ver una franja. El propio juego lo explica
en la portada cuando detecta un iPhone.

**Salir y volver.** El botón ☰ de la esquina abre el menú de pausa en cualquier momento,
y **el reloj de la operación se detiene** mientras está abierto: atender una pregunta en
clase no cuesta la partida. Desde ahí se puede seguir, reintentar la operación, ganar
pantalla o salir al menú. Al salir se guarda el intento, y la portada ofrece
**Continuar** por la operación donde se dejó. Como el teléfono se pasa de mano en mano,
hay también un **Empezar de cero con otro nombre** que descarta lo guardado.

> Los datos de cada alumno **se borran solos a la hora**. Los resultados de quienes completan la campaña quedan guardados aparte, en un archivo permanente que solo tú puedes consultar desde la consola de Firebase.

---

## La campaña

| # | Operación | Qué introduce | Tiempo |
|---|---|---|---|
| 1 | **Valle de Ia Drang** | Solo infantería. Se aprende el ciclo: recolectar, producir, atacar | 6 min |
| 2 | **Colina 812** | Francotiradores. Hay que componer el ejército, no solo acumular tropa | 7 min |
| 3 | **Paso del Mekong** | Blindados y bombas de racimo. Todo sale del mismo bolsillo | 8 min |

La curva no sube números: **cada nivel añade una decisión nueva**. Y la dificultad la fija el nivel, no el jugador, para que todos los alumnos compitan bajo las mismas condiciones.

Cada operación tiene **límite de tiempo**: agotarlo es una derrota. En una competencia por ver quién llega antes, el reloj cuenta.

### Calibración: victorias sobre diez campañas encadenadas

Medido con jugadores simulados que reaccionan a **velocidad humana** —miran la pantalla, deciden, tocan el botón y vuelven a mirar el combate— y no con un bot que decide cuatro veces por segundo. Y encadenando las tres operaciones con su botín, como se juega de verdad:

| | Primera vez | Le pilló el punto | Juega bien |
|---|---|---|---|
| **Nivel 1** | 9 / 10 | 10 / 10 | 10 / 10 |
| **Nivel 2** | 7 / 10 | 10 / 10 | 10 / 10 |
| **Nivel 3** | 0 / 10 | 4 / 10 | 9 / 10 |
| **Campaña completa** | 0 / 10 | 4 / 10 | 8 / 10 |

Las dos primeras operaciones se aprenden jugándolas. **La tercera se endureció a propósito**: con el rival anterior se ganaba a la primera y dejaba de ser una final. Ahora exige llegar con economía montada y no regalar tropa, y un jugador distraído no la saca. Sigue habiendo ganador —ocho campañas completas de diez jugando bien—, que es de lo que se trata.

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

**Para probarlo desde el teléfono** (con el móvil y el ordenador en el mismo wifi):

```bash
npm run dev:lan
```

Vite imprime dos direcciones. Abre en el teléfono la que dice **Network**
(algo como `http://192.168.1.42:5173/`), gira el móvil en horizontal y juega.

> Firebase **no hace falta** para esto: sin configurar, el juego arranca en
> modo local y la campaña completa es jugable. Lo único que falta es el panel
> compartido entre alumnos.

### Desplegar en Netlify

El repositorio ya trae `netlify.toml`. Conecta el repo desde el panel de Netlify y despliega — no hace falta configurar nada más para que el juego funcione.

### Activar el panel compartido (Firebase)

Sin esto el juego funciona igual, pero cada alumno ve solo su progreso.

1. Crea un proyecto en [console.firebase.google.com](https://console.firebase.google.com).
2. **Firestore Database** → Crear base de datos → modo producción.
3. **Reglas** → pega el contenido de [`firestore.rules`](./firestore.rules) → Publicar.
4. **Authentication** → Sign-in method → activa **Anónimo**.
5. **Authentication → Settings → Dominios autorizados** → añade el dominio de Netlify
   (`tu-sitio.netlify.app`). Sin esto el login anónimo falla desde el sitio publicado
   y el juego cae a modo local sin decir nada.
6. ⚙ Configuración del proyecto → Tus aplicaciones → Web → copia la configuración.
7. En Netlify, **Site settings → Environment variables**, añade las variables de [`.env.example`](./.env.example).
8. Vuelve a desplegar.

Para que los datos se borren solos en el servidor: **Firestore → TTL → Crear política**
sobre el campo **`expiresAtTs`** en `rooms` y en `rooms/{roomId}/players`.

Ojo con el nombre del campo: hay dos, y no son intercambiables. `expiresAt` es un
número de milisegundos y lo usa el cliente para ignorar lo caducado al instante;
`expiresAtTs` es el mismo momento como `Timestamp`, y es el único que acepta la
política de TTL de Firestore. Apuntar la política a `expiresAt` la deja sin efecto:
la sala se vería vacía a la hora, pero los documentos se quedarían para siempre.

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
npm run verify    # typecheck + 121 tests
npm run build     # compila a dist/
```

**121 tests en tres niveles:**

1. **Unitarios** — economía, combate, máquina de estados, IA, sprites, validación de nombres, ranking.
2. **Partidas completas simuladas** — lo que de verdad valida el balance: que cada nivel sea ganable, que jugar mal se castigue, que ninguna partida se cuelgue y que la dificultad suba de nivel en nivel.
3. **Regresión de arte** — huella SHA-1 de cada sprite: detecta un cambio visual accidental sin abrir un navegador.

Las simulaciones destaparon fallos que a ojo no se habrían visto: el francotirador era una trampa (comprarlo bajaba las victorias de 6/8 a 0/8), el tanque batía más lejos que cualquier otra unidad y no tenía respuesta posible, y subir la IA a difícil *a la vez* que se añadían unidades nuevas hacía el nivel imposible.

Y una lección que costó cara: **medir contra un bot óptimo no sirve**. Con un jugador simulado que decide cuatro veces por segundo, los tres niveles parecían bien ajustados; con una persona de verdad, el nivel 1 era durísimo. La suite `human-player.spec.ts` existe para que eso no vuelva a pasar.

---

## Originalidad

El juego toma de *Stick War: Legacy* únicamente su **estructura de juego**: economía con recolectores, compra por botones, órdenes de escuadra, comportamiento autónomo de las unidades y victoria por destruir la posición enemiga. Eso son mecánicas, no contenido protegible.

Todo lo demás —sprites, animaciones, paleta, escenario, unidades, niveles, ambientación y balance— es original y lo genera el código de este repositorio.
