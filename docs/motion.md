# Tokens de motion

Todas las duraciones y curvas de Colonos salen de `src/motion/tokens.ts`. Las poses (caída, ciudad, camino, ladrón, loseta) están en `src/motion/curves.ts`. El CSS repite los mismos milisegundos y los `cubic-bezier` con el nombre del token; un test comprueba que no se desfasen.

Nada de esto bloquea la mesa: no hay `setBusy`, ni scrim, ni trampa de foco. La cámara no se mueve por una acción ajena. En gráficos livianos los viajes se acortan (`motionMs` × 0,62). Con `prefers-reduced-motion` la pose final entra al toque (`motionMs` = 0) y el agua deja de correr.

## Duraciones

Milisegundos. `motionMs(base, { lite, reduce })` es el valor que usa el cuadro.

| Token | ms | Dónde |
| --- | --- | --- |
| `micro` | 140 | Inclinación de la carta |
| `place` | 560 | Caída y asentado del poblado |
| `upgrade` | 640 | El poblado pasa a ciudad |
| `road` | 520 | El camino se apoya en la arista |
| `robber` / `robberLite` | 780 / 460 | Levantar, arco, apoyar |
| `harvestMine` | 780 | Tu cosecha vuela a la mano |
| `harvestOther` | 460 | El +N de los demás, sobre la loseta |
| `harvestLiteMine` / `harvestLiteOther` | 420 / 280 | Lo mismo en liviano |
| `harvestReduce` | 160 | Reducir movimiento: sin viaje |
| `harvestStagger` / `Lite` | 80 / 40 | Escalonado entre íconos |
| `harvestLimit` | 1400 | El último ícono llega antes de este tope |
| `cardBurst` | 900 | Destello del sobre |
| `cardRise` | 560 | La carta sube |
| `cardFlip` | 700 | Gira |
| `cardTear` | 420 | Se arranca la tira |
| `cardPack` | 560 | El sobre baja |
| `boardRise` | 680 | Cada loseta sale del agua |
| `boardStagger` / `Lite` | 46 / 28 | Demora por unidad de distancia al centro |
| `victory` | 480 | Entra la tarjeta de fin, sin tapar el tablero |
| `cameraIntro` | 1700 | Acercamiento al entrar |
| `cameraDice` | 2600 | Tu tirada |
| `cameraRobber` | 1500 | Tu ladrón |
| `handCatch` | 220 | La mano recibe el recurso |
| `seatPulse` | 420 | Pulso breve en el asiento de otro |

`HARVEST_ARC` no es una duración: el arco propio sube 72 px y rebota 10; el de los demás, 18 px; en liviano el rebote propio es 8 px. Reducir movimiento deja lift y bounce en 0.

La cosecha y las tomas de cámara conservan los tiempos que ya estaban medidos. La caída de piezas y el salto del ladrón son más largos que el rebote de escala de antes (280 ms y 550 ms), porque ahora hay un gesto completo.

## Curvas

| Función | Uso |
| --- | --- |
| `easeOutCubic` | Sale rápido y frena. Loseta, camino, tramo final. CSS: `BEZIER.outCubic` = `cubic-bezier(0.33, 0, 0.2, 1)` |
| `easeInCubic` | Acelera. La caída del poblado y el apoyo del ladrón. CSS: `BEZIER.inCubic` |
| `easeInOutCubic` | El ladrón cruza el arco; el camino se estira. CSS: `BEZIER.inOut` |
| `easeOutBack` | Overshoot. La ciudad crece y se pasa un pelo (s = 1,35). CSS: `BEZIER.outBack` |
| `pieceDrop` | Cae desde 0,62, se aplasta al tocar (sy 0,8, sx 1,14) y rebota 0,05 |
| `upgradeRise` | sy arranca en 0,18 y termina en 1, con overshoot |
| `roadLay` | Baja 0,14, el largo va de 0,08 a 1 |
| `robberPose` | 0–22 % levanta, 22–78 % cruza, 78–100 % apoya. Liviano: arco más bajo |
| `boardRise` | Traslación en Y desde −0,46. No escala la loseta, así el toque no cambia de tamaño |

`CAMERA_SHARP` es la nitidez del ease exponencial (`1 - e^(-dt · sharp)`): intro 2,2, toma 4,2, volver a tu vista 8. A los 0,6 s de restaurar queda menos del 1 % del camino.

## Qué no hace

- No mueve la cámara al construir, comerciar, comprar carta, cosechar, ni cuando juega otro.
- Dados y ladrón sólo acercan si el turno es tuyo, y después vuelve a donde la tenías.
- Arrastrar la vista cancela la toma.
- El agua (`SEA_DRIFT`, 0,01 y 0,006 UV/s) sólo corre en gráficos normales y se frena con reducir movimiento.
- Hover y selección de vértices y aristas actualizan una ref en el cuadro. No hay `setState` al mover el puntero.

## 60 fps

En un escritorio con GPU el tablero va a 60 fps: las piezas instanciadas sólo reescriben matrices mientras la animación está viva. Este entorno mide con SwiftShader, que no llega a 60. El número honesto está en el reporte de la ronda, antes y después, con el mismo muestreador de `requestAnimationFrame`.
