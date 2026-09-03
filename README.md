# Mekong Front: 1968

Juego de estrategia y gestión en tiempo real, **vista lateral 2D en pixel art**, ambientado en la Guerra de Vietnam. Reproduce el ciclo jugable de *Stick War: Legacy* con contenido, arte y ambientación **completamente originales**.

> **Menú y dificultad → recolectar suministros → comprar recolectores → hacer crecer la economía → formar un ejército → ver al enemigo hacer exactamente lo mismo → defender → asaltar → tomar la posición.**

---

## Jugar

```bash
npm install
npm run dev      # http://localhost:5173
```

| Acción | Ratón | Teclado |
|---|---|---|
| Comprar Soldado (5 suministros) | botón *Soldado* | `1` |
| Comprar Recolector (6 suministros) | botón *Recolector* | `2` |
| Atacar / Defender / Retirarse | botones de *Órdenes* | `A` / `D` / `R` |
| Mover la cámara | arrastrar | `←` `→` |

**Objetivo:** destruir el Puesto de Mando vietnamita. **Derrota:** que caiga tu Base de Fuego, o quedarte sin tropas y sin suministros para reponerlas.

En el menú principal se elige **dificultad**: Normal, Difícil o Imposible. No cambia cuántos enemigos hay — cambia lo bien que la IA administra su economía (ver más abajo).

Parámetros de URL útiles: `?seed=42` fija la partida, `?speed=4` acelera el tiempo, `?difficulty=hard` preselecciona la dificultad, `?debug=1` expone `window.__GAME_DEBUG__`.

---

## Cómo se juega bien

La decisión central es la misma que en Stick War: **economía o ejército**. Empiezas con 14 suministros, justo para dos recolectores. La apertura recomendada es **tres recolectores y después soldados**, atacando al reunir cinco.

Hay **dos** frenos, y conviene distinguirlos. La **cola de entrenamiento de una sola ranura** limita *cuántas* unidades salen; los **costes** (5 y 6) limitan *si* salen. Tres recolectores rinden ~1,6 suministros/s y un soldado cada 3 s cuesta ~1,7/s: la caja queda al filo, así que acumular no sirve pero gastar mal tampoco.

Cada bando tiene **cinco depósitos finitos** escalonados desde su base hacia el centro. El cercano es cómodo y pequeño; el lejano aguanta la partida pero está expuesto y el viaje cuesta el doble. Según se agotan, la economía no se corta: **se encarece**. En partida larga eso decide.

Si solo compras recolectores, pierdes. Está verificado por los tests: la IA castiga la economía pura.

---

## Arquitectura

La regla que sostiene todo el diseño:

> **El paquete `src/domain/` no importa nada del DOM.** Ni `document`, ni `canvas`, ni `window`.

Esa única disciplina da tres cosas a la vez: tests que corren en Node en milisegundos, una simulación determinista y reproducible por semilla, y una aplicación limpia del Principio de Inversión de Dependencias.

```
src/
  core/         GameLoop (paso fijo + interpolación), EventBus tipado, Rng sembrado
  domain/       ← SIMULACIÓN, CERO DOM
    balance/    balance.ts · levels.ts    ★ fuente única de verdad numérica
    world/      World, Entity (composición), Team
    states/     10 estados de la máquina de estados por unidad
    systems/    9 sistemas, ejecutados en orden fijo
    commands/   órdenes del jugador como objetos encolados
    ai/         estrategias de la IA enemiga
  art/          ← GENERACIÓN DE SPRITES, CERO DOM
    PixelBuffer, paleta, recetas paramétricas, SpriteBaker
  render/       ← ÚNICA CAPA QUE TOCA EL CANVAS
    SpriteAtlas, Camera, Renderer por capas, FxSystem
  ui/           HUD y botones en DOM sobre el canvas
  app/          Game (raíz de composición) · DebugBridge
  persistence/  IProgressRepository + implementación en localStorage
```

### Patrones de diseño aplicados

| Patrón | Dónde | Qué problema resuelve |
|---|---|---|
| **State** | `domain/states/` | Cada unidad se gobierna sola. Las instancias son compartidas y sin estado mutable: cero asignaciones por fotograma con cientos de transiciones por segundo. |
| **Command** | `domain/commands/` | El input nunca muta el mundo directamente: se encola y se aplica al inicio del paso. De ahí el determinismo y la posibilidad de guionizar tests. |
| **Strategy** | `domain/ai/` | Cambiar cómo piensa el enemigo no toca el sistema que la ejecuta. |
| **Factory** | `domain/factories/` | Las unidades se crean solo desde el catálogo. **No hay un solo `switch` por tipo de unidad.** |
| **Observer** | `core/EventBus` | La simulación anuncia, la interfaz y los efectos escuchan. El dominio no sabe que existen. |
| **Repository** | `persistence/` | Enchufar Firebase sería sustituir una clase en `main.ts`, sin tocar el juego. |
| **Flyweight** | `render/SpriteAtlas` | Cada fotograma se hornea una vez y se comparte, incluidos los reflejados. |

### Principios SOLID, en concreto

- **SRP** — cada sistema hace una cosa: `MovementSystem` mueve, `DamageSystem` daña, `VictorySystem` decide el final.
- **OCP** — el juego es *data-driven*. Añadir el tanque del nivel 2 es **un registro en `balance.ts` más una receta de sprite**: cero cambios en los sistemas.
- **LSP** — se descartó la jerarquía `Unidad → Soldado → Tanque` en favor de composición, precisamente porque el tanque no es sustituible por un soldado (no camina igual, tiene armadura, hace daño en área).
- **ISP** — una entidad solo lleva los componentes de su rol: el recolector no tiene `combat`, el soldado no tiene `harvester`.
- **DIP** — `Simulation` depende de `ISystem`, no de sistemas concretos; el juego depende de `IProgressRepository`, no de `localStorage`. Todo se cablea en `app/Game.ts`.

---

## El arte: cero archivos, todo generado en código

No hay ni un PNG en el repositorio. Cada sprite se dibuja píxel a píxel al arrancar (**~32 ms para todo el juego**).

La pieza clave es que **un solo cuerpo humanoide de 22×22 px genera las tres unidades a pie**, parametrizado por dos cosas:

- **`Pose`** — dónde está cada parte del cuerpo en este fotograma.
- **`SoldierSkin`** — colores, tocado, equipo y suciedad.

El Soldado estadounidense (casco M1, chaleco, verde oliva), el Guerrillero vietnamita (sombrero cónico, ropa oscura, más delgado) y el Recolector (paleta desaturada, gorro blando, saco al hombro, `dirtiness: 0.7` que salpica barro) son **la misma función con distintos argumentos**.

Las animaciones tampoco son dibujos, sino **funciones de pose**: un `AnimClip` declara fotogramas, fps y un `eventFrame` que marca el instante exacto en que sale la bala o se suelta la carga. Por eso el fogonazo, el retroceso del arma y el proyectil ocurren en el mismo instante.

Y la función de la que depende todo el aspecto: **`PixelBuffer.outline()`**, que rodea con un contorno oscuro de 1 px todo lo dibujado. Es el 80 % de lo que hace que algo parezca pixel art, en una sola función reutilizada por cada sprite del juego.

El escenario de selva se genera igual: cielo en bandas planas con nubes, colinas entre la niebla, dos capas de dosel con árboles procedurales y sotobosque, y follaje en primer plano que pasa **por delante** de las tropas. Cinco velocidades de parallax distintas.

---

## Balance

Todo vive en `src/domain/balance/balance.ts`. **Ajustar el juego no toca ni una línea de lógica.**

| Unidad | Vida | Arm. | Daño | Cadencia | Alcance | Vel. | Pob. | Coste |
|---|---|---|---|---|---|---|---|---|
| Soldado | 100 | 0 | 12 | 1,4/s | 90 px | 34 px/s | 1 | 5 |
| Recolector | 60 | 0 | — | — | — | 45 px/s | 1 | 6 |
| Guerrillero (enemigo) | 90 | 0 | 10 | 1,5/s | 84 px | 38 px/s | 1 | 5 |
| Porteador (enemigo) | 60 | 0 | — | — | — | 45 px/s | 1 | 6 |

Tope de población: **50 por bando**. Mapa: 1000 px entre bases (la mitad que antes, para que la tropa no se pase la partida caminando).

**Ciclo del recolector** — 5,66 s por 3 suministros en el depósito más cercano = **1 suministro cada 1,9 s**, el mismo ritmo de siempre. Pero es un viaje real y visible: sale del campamento hacia el depósito, se agacha a cargar, y vuelve. Como el minero de Stick War, **se le puede matar**. En el depósito más lejano el mismo recolector rinde un 42 % menos.

**Notas de balance:**
- El soldado gana el duelo 1v1 (mata en 5,4 s; el guerrillero tarda 6,7 s), pero el enemigo es un 12 % más rápido. La ventaja tiene que salir de las órdenes y la economía, no de las estadísticas.
- Los 6 px de ventaja de alcance dan función mecánica real a **DEFENDER**: en posición defensiva disparas primero.
- `minDamage: 1` evita que una unidad con armadura ≥ daño sea invulnerable y bloquee la partida.
- El `flinchCooldown` impide que el fuego sostenido encadene aturdimientos y paralice a una unidad.

**IA enemiga — economía propia, no renta invisible.** El enemigo juega al mismo juego: manda porteadores a *sus* depósitos, esos porteadores caminan y se pueden matar, y con lo que traen paga cada guerrillero por la misma cola de una ranura, al mismo precio y con el mismo tope de población. **No hay una sola unidad gratis**, y hay un test que lo comprueba comparando lo producido con lo ingresado. Matarle los porteadores le corta la producción.

Sus decisiones son dos por turno: qué comprar (economía hasta cubrir su mínimo, después tropa) y qué postura tomar (defensa reactiva si le cruzas la línea de alarma, ataque solo con la ventaja que exija su perfil).

**La dificultad no le regala nada** — los tres perfiles arrancan con los mismos suministros, el mismo tope y la misma guarnición. Lo que cambia es la calidad de las decisiones: cuántos porteadores considera suficientes, cada cuánto piensa, cuánto tarda en reaccionar a una invasión, cuánta ventaja exige antes de atacar, si sabe cortar un ataque que se ha torcido y con qué frecuencia se equivoca a propósito.

| | Economía | Reacción | Ataca con | Corta el ataque perdido | Errores |
|---|---|---|---|---|---|
| Normal | 2 porteadores (no llena su cola) | 2,5 s | 1,15× y 5 hombres | nunca | 30 % |
| Difícil | 4 porteadores | 1,8 s | 1,15× y 6 hombres | sí | 18 % |
| Imposible | 5 porteadores | 0,25 s | 1,30× y 8 hombres | sí, antes | 0 % |

Calibrado jugando partidas completas sin navegador. Contra la apertura estándar (tres recolectores, luego soldados, atacar al reunir cinco), sobre diez semillas fijas: **Normal 10/10** victorias del jugador, **Difícil 3/10**, **Imposible 0/10**. Contra una política mejor —cuatro recolectores, acumular hasta catorce soldados y replegarse si el ataque se desangra— Imposible cae 9 de cada 10: es duro, no un muro.

---

## Verificación

```bash
npm run verify    # typecheck + 71 tests
npm test          # solo los tests
npm run build     # compila a dist/ (25 KB gzip)
```

**71 tests, en tres niveles:**

1. **Unitarios** (economía, combate, máquina de estados, IA, sprites) — milisegundos.
2. **Partidas completas simuladas sin navegador** — es lo que valida el *balance* de verdad:
   - se gana con la apertura estándar en **las 10 semillas probadas**, en **118–164 s**;
   - **invertir solo en economía siempre pierde**;
   - ninguna partida se queda colgada;
   - la misma semilla produce siempre el mismo resultado.
3. **Regresión de arte** — huella SHA-1 de cada sprite horneado: detecta un cambio visual accidental sin abrir un navegador.

Herramienta de desarrollo para revisar el arte a simple vista:

```bash
npx tsx scripts/preview-art.ts art.png 6
```

---

## Despliegue en Netlify

Sitio 100 % estático, sin variables de entorno ni secretos. `netlify.toml` ya está configurado:

```toml
[build]
  command = "npm run build"
  publish = "dist"
```

Basta con conectar el repositorio desde el panel de Netlify.

---

## Hoja de ruta

**Nivel 2** ya está diseñado en `balance.ts` y `levels.ts`: al ganar el nivel 1 se capturan los **planos del tanque** y se persiste el desbloqueo. El nivel 2 arranca sin tropas heredadas, con el botín como suministros iniciales, el **tanque M48 a 500 suministros** (900 de vida, armadura 4, daño en área) y el objetivo de **10 guerrilleros y 1 tanque T-54**.

Gracias al diseño por composición, implementarlo consiste en añadir la receta de sprite del tanque y la estrategia de IA del jefe — **sin tocar ningún sistema**.

Después: más unidades y armas, mapas nuevos, mejoras, sonido sintetizado con WebAudio (sin archivos) y campaña.

---

## Nota sobre originalidad

El juego toma de *Stick War: Legacy* únicamente su **estructura de juego**: economía con recolectores, compra por botones, órdenes de escuadra, comportamiento autónomo de las unidades y victoria por destruir la posición enemiga. Esas son mecánicas, no contenido protegible.

Todo lo demás —sprites, animaciones, paleta, escenario, nombres, ambientación y balance— es original y está generado por el código de este repositorio.
