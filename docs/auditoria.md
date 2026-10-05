# Auditoría de Colonos

Revisión de reglas, red, interfaz, 3D, teclado y build. Fecha: 4 de octubre de 2026. El código de esta nota es el commit que la agrega, encima de `e569777`.

## Cómo se midió

- `npx vitest run`: 37 archivos, 279 tests, todos verdes.
- `npx tsc -b`: sin errores.
- `npx oxlint`: sale 0. Quedan 45 warnings viejos (imports sin uso, fast refresh, hooks, regex de chat). Ninguno nuevo de esta pasada.
- `npx vite build`: verde. El chunk de three.js pesa 983 kB (gzip 264 kB) y Vite avisa que pasa de 500 kB.
- `npx tsx server/sim.ts --mass`: 40 partidas (10 semillas × 3, 4, 5 y 6 jugadores), meta 8, tope 500 turnos. Las 40 terminaron en `fin`. Exit 0.
- Meta 10, semilla 42, tope 900: 3 jugadores en 105 turnos, 4 en 131, 5 en 90 (30 hexágonos), 6 en 94. Las cuatro en `fin`.
- Imagen `colonos-audit:local` (`6cee19f2919f`). Sin `CORS_ORIGIN` y con `CORS_ORIGIN=*` el proceso sale 1. Con origen real, `/api/health` responde 200 y `Access-Control-Allow-Origin` sólo para ese origen. Un `Origin` ajeno no recibe ese header. No va `X-Powered-By`.
- Chrome headless con SwiftShader, viewports 1440×900 y 390×844. Sin GPU real y sin un teléfono.

## 1. Reglas

Cubierto por `tests/reglas-auditoria.test.ts` y el resto del motor, más las simulaciones de bots.

Se arregló en `e48b7cd`:

- Pasar de una oferta a la mesa la borraba para todos. Ahora sólo se oculta para quien pasó. El que la ofreció sigue pudiendo cancelarla. Un tercero no puede rechazar una oferta dirigida.
- En la pausa de 5–6 se podían comprar cartas de desarrollo. Oficialmente sólo caminos, poblados y ciudades.
- Llegar a la meta durante esa pausa cerraba la partida. La victoria espera al turno propio.
- Un caballero que gana (ejército más grande) dejaba el robo pendiente. Si ya ganó, no roba.
- Invento anotaba en el registro lo pedido aunque el banco pagara menos. Ahora anota lo entregado.
- El mensaje de 4:1 decía “con tu puerto”. El 4:1 es el banco; el puerto sigue diciendo su tasa.

Quedó así a propósito, no es un bug:

- Una contraoferta a “todos” retira la oferta pública y abre una dirigida. Los bots no contraofertan.
- El banco no viaja en cantidades. En tu turno sólo hay booleanos de “hay / no hay”.
- El registro de victoria dice la meta, no el total exacto, para no contar en voz alta las cartas ocultas.
- Producción: si el banco no alcanza un recurso, ese recurso no se reparte. Descarte: mitad hacia abajo, y sólo con más de 7. Colocación en serpiente; el segundo poblado cobra, el desierto no. Carta comprada no se juega en el mismo turno. Un punto de victoria cuenta al instante. Monopolio saca a los demás, no al banco. Ruta más larga desde 5, un edificio enemigo la corta, el propio no. Ejército desde 3. Empate: se queda quien ya lo tenía.

## 2. Red y servidor

Cubierto por `tests/e2e-socket.test.ts`, `tests/review.test.ts`, `tests/round2.test.ts` y `tests/quality.test.ts`.

- Reconexión con token conserva la mano. Un token de otra sala no entra.
- Caída en descarte o con el ladrón, o si te apuntan un trueque: entra un bot enseguida. En un turno normal el asiento espera la gracia de 2 s y el timeout de 45 s.
- El anfitrión que se va le pasa la sala al próximo humano conectado. En el lobby el asiento se libera. En partida, “Salir” mete un bot al toque.
- Tope de 200 salas, 8 por IP, 5 creaciones cada 20 s. Un create inválido no gasta ese cupo.
- CORS de producción sin origen, o con `*`, no arranca.
- La vista no manda mazo, `devRemaining`, banco en cantidades, ni `declinedBy`. El robo y el descarte no nombran el recurso. La compra no dice qué carta salió.

Arreglo de esta pasada, `e569777`: `app.disable("x-powered-by")`. El health ya no nombra Express.

## 3. Interfaz

Capturas en Chrome, 1440 y 390, sin scroll horizontal:

- Inicio, sala (asientos libres, link, empezar deshabilitado con un solo jugador), error “No hay una sala con ese código.”
- Partida, comercio con “Paso” en oferta pública, descarte, fin de partida, chat vacío (“Todavía nadie escribió. El chat no muestra las cartas de nadie.”) y registro.

Arreglos:

- `550adfc`: la pausa dice que no se compran cartas. “Paso” en la oferta a la mesa. El foco queda dentro de atajos, fin, robo y descarte. Los steppers del descarte miden 44 px.
- `934216d`: el cartel de fin mostraba siempre la meta. Si ganás vos, muestra tu total (puede ser 12). Si gana otro y en la mesa se ve más que la meta, muestra eso. Si le faltan cartas ocultas para llegar, muestra la meta y no el número exacto. La escena `S5-victoria` ahora sí suma 10 en la mesa (3 ciudades, ruta y ejército), así el cartel y la lista coinciden.

## 4. 3D

- `3741adf`: geometrías y clones de madera se liberan al desmontar. Los atlas compartidos no.
- `c32f286`: `aCell` se reescribe en el mismo buffer. Antes cada layout de poblados, fichas y puertos dejaba un `InstancedBufferAttribute` sin `dispose`. El `count` del `InstancedMesh` sigue mandando cuántas piezas se dibujan.
- Liviano: sin sombras, `dpr` 1, menos detalle. Noche: ambiente más bajo y velas. Hay tests de paleta en `tests/art-refino.test.ts` y `tests/art-ronda12.test.ts`.
- No hay perfil de memoria de GPU real. La revisión es de código y de que los tests de arte siguen verdes.

## 5. Teclado y accesibilidad

- El diálogo de descarte, al abrirse, deja el foco en “Madera: 3” (el primer control del diálogo), en 1440 y en 390.
- Hay trampa de Tab, `role="dialog"`, `aria-modal` y un salto a las acciones.
- No se recorrió Tab y Shift+Tab tecla por tecla. Al cerrar, el foco no vuelve al botón que abrió el diálogo.

## 6. Bugs visuales

En las capturas de esta pasada no apareció overflow ni texto cortado que el probe de cajas marcara. El probe midió chips, dock y la página en 4 y 6 jugadores a 390, y el escritorio a 1440.

El fin de partida de la escena de arte, antes de `934216d`, decía 10 puntos con todos en 4. Era la escena, no una partida real. Quedó alineado.

## 7. Build, lint, tipos y Docker

| Chequeo | Resultado |
| --- | --- |
| vitest | 279 / 279 |
| tsc -b | limpio |
| oxlint | 0 errores, 45 warnings previos |
| vite build | verde, aviso de chunk > 500 kB |
| Docker | imagen `6cee19f2919f`, health 200, CORS cerrado |

`*.md` está en `.dockerignore`: esta nota no entra en la imagen.

## Ronda: arranque y dados

4 de octubre de 2026, encima de `94bb953`. Esta sección es el commit que la agrega.

### Qué estaba mal

**Empezar.** Apretar el botón sólo sacaba del lobby si llegaba el evento `view`. No había pantalla de arranque: nadie veía quién abre, el orden ni los colores. El ack del anfitrión no traía la vista, así que dependía de ese evento. Un `lobby` tardío de la misma sala podía borrar la vista y devolverlos a un lobby congelado.

**Dados.** Cada cliente armaba la velocidad y el giro con `Math.random()`, así que la misma tirada no coincidía entre pantallas. Al frenar (o a los 2,4 s) el cuaternión hacía un slerp de 0,18 por frame hacia `quatForFace` y se anulaba la velocidad angular: un giro visible al final, que no era la pose en la que había caído la física. En modo liviano, el último frame copiaba posición y rotación de un saque. El piso físico era más chico que el paño y el dado quedaba metido en la madera.

El número de la partida en vivo ya salía de la Web Crypto API cuando `entropy` era `crypto`, y el arranque de producción no pasaba semilla. Igual `createGame` aceptaba `seed` o `entropy: "test"` si `NODE_ENV` no era `production`. No era `crypto.randomInt`.

### Qué quedó

**Arranque.** Al empezar se congela un `kickoff`: quién abre (el anfitrión, primer asiento), el orden, el color y si es bot. Viaja en la vista durante 15 s y el ack de `start` incluye esa vista. El cliente la muestra una vez (`kickoffKey`); un lobby de la misma sala ya no pisa una partida en juego. El cartel dura 6,8 s, se cierra con Esc o con «A la mesa». Los bots no se pausan. Con 2 humanos y sin tercer asiento, Empezar falla y no hay vista: el mínimo sigue siendo 3.

**Dados.** La cinta la precalcula cannon-es a paso fijo (1/60, dos subpasos). La semilla visual no elige el número. Un giro constante, el mismo en todos los frames, deja la cara del servidor arriba al asentarse: no hay slerp final ni teletransporte. Misma semilla y mismos valores, misma cinta en todos los clientes, también en liviano. `prefers-reduced-motion` muestra directo la pose final correcta. El anti-spoiler no cambió: el HUD, el registro y la mano esconden el número hasta los 3,2 s o hasta un clic / Esc.

El número lo decide sólo el servidor. `rollFairDice` pide dos `crypto.randomInt(1, 6)` independientes (`server/fairDice.ts`). El cliente no puede mandar los dados: `parseAction` deja `roll` en `{ type: "roll" }`. Con `NODE_ENV=production`, `createGame` fuerza `entropy: "crypto"` e ignora `seed` y `entropy: "test"`. Las partidas de test siguen con semilla para poder repetirlas; esa semilla no se usa en el arranque de producción. La semilla de la trayectoria en vivo es otro `crypto.randomInt` y no consume el stream de los números.

### 100.000 tiradas

`tests/dados-estadistica.test.ts`, una corrida de `rollFairDice`. Umbrales del test: χ² por dado < 36 (df 5; χ² 0,001 ≈ 20,5), χ² de la suma < 50 (df 10; χ² 0,001 ≈ 29,6), |r| < 0,02. Otra corrida da otros números; estos son los de esta pasada:

| Medida | Resultado |
| --- | --- |
| χ² dado 1 | 1,853 |
| χ² dado 2 | 4,488 |
| χ² suma 2–12 | 10,140 |
| r entre dados | −0,00039 |
| r entre tiradas del dado 1 | −0,00120 |
| r entre sumas consecutivas | 0,00403 |

Cuentas del dado 1: 16614, 16691, 16796, 16563, 16672, 16664. Dado 2: 16496, 16702, 16785, 16713, 16534, 16770. Sumas 2 a 12: 2754, 5499, 8306, 11047, 14003, 16830, 13866, 11052, 8274, 5479, 2890. Esperado por cara: 16666,7. La suma triangular (1, 2, …, 6, …, 1 sobre 36) entra en el χ².

### Cómo se miró

- `tests/arranque.test.ts`: 2 humanos sin tercer asiento no arrancan; 2+1 bot, 3 humanos, 2+2 bots, 3+2, 4+2 y 6 humanos reciben el mismo kickoff, fase `colocacion_poblado`, turno del que abre, sin edificios. Después de la primera `view` no vuelve un `lobby`.
- `tests/dados-tiro.test.ts`: la cara de `quatForFace` coincide con las pipas; las 36 parejas caen planas, sin atravesar el paño (fondo > paño − 0,012) y sin salto en el último frame; misma semilla, misma cinta.
- `tests/dados-estadistica.test.ts`: la corrida de arriba, más producción que ignora semilla y el `roll` del cliente.
- Chrome headless, SwiftShader, 1440×900 y 390×844. Anfitrión y invitado, con un bot, ven «Empieza la partida», «Arranca Luz · Rojo» y el orden Luz / Tomi (bot) / Mora. No quedan en el lobby.
- La tirada de la escena S3 es 3 y 4, semilla visual 20261004. A mitad de la cinta un dado va inclinado; al asentarse los dos están en el paño. Desde arriba, planos, las caras son 3 y 4 (el código midió producto punto 1) y el HUD sigue diciendo que están en el aire. Al revelar, la etiqueta es «Dados: 3 + 4 = 7».

Límites: sin GPU real y sin un teléfono. En este headless el `requestAnimationFrame` no corre mientras la página espera, así que el cuadro del aire se sacó avanzando el reloj virtual; el cenital se sacó después de dejar correr la cinta hasta el reposo. `*.md` sigue fuera de la imagen Docker.

## Pendiente

- Devolver el foco al control que abrió el diálogo.
- Caminar Tab completo dentro de los diálogos con un teclado real.
- Partir el chunk de three.js.
- Los 45 warnings de oxlint.
- Medir memoria de GPU en un navegador con GPU, y la UI en un teléfono de verdad. Acá fue SwiftShader y un viewport de 390 px.
- La contraoferta pública que reemplaza la oferta es regla de la casa. Si se quiere la regla de mesa (la oferta original sigue), hay que cambiar el motor y los bots.
