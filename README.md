---
title: Colonos 3D
emoji: 🏝️
colorFrom: yellow
colorTo: blue
sdk: docker
app_port: 7860
pinned: false
short_description: Catan 3D multijugador (3 a 6 jugadores) con bots
---

# Colonos

Juego online multijugador tipo *Los Colonos de Catán* para **3 a 6 jugadores**, con tablero **3D** en el navegador y servidor **autoritativo** por WebSocket. Un solo proceso Node sirve el cliente estático y el tiempo real.

No hace falta API key ni base de datos: salas y partidas viven **en memoria**. Si recargás la página, volvés al asiento con el token de sesión (mientras el servidor siga vivo). Si el servidor se reinicia, las partidas se pierden.

El **token es una credencial portadora**: quien lo tenga puede sentarse en ese asiento. No lo compartas. Cada token vale sólo en su sala; un join con el token de otra mesa no toma asientos ajenos. En el lobby, **Dejar la mesa** libera el asiento y borra la sesión local. En partida, **Salir** cede el asiento a un bot al toque, **invalida el token** y vuelve al inicio (no podés reconectar a ese asiento). Si salís en la fase de **descarte**, el servidor tira tu mitad **al toque** (no deja el id colgado en `waitingDiscard`). Si se te corta la red, el asiento queda para reconectar con el mismo token; en descarte, ladrón o un trueque dirigido a vos, el bot entra **apenas te caés** (no espera los ~45 s). El descarte AFK de quien sigue conectado se resuelve al timeout (~30s).

**Qué viaja en cada `view`:** el banco numérico **no** se manda (`bank` siempre `null`). En fase principal, **sólo al jugador del turno** viaja `bankHas`: un mapa de booleanos (hay stock o no) para habilitar el trueque 4:1 / puertos, **sin cantidades**. El mazo de desarrollo no se cuenta en el wire: la UI usa `legal.canBuyDev`. Ni `devRemaining` ni `devDeck` salen hacia el cliente.

## Qué incluye

- Sala con código de 6 caracteres y link `/?sala=ABC123`
- **Modo principal: 6 jugadores** (isla grande, pausa de construcción). 3–4 son isla clásica; el cupo por defecto es 6
- Recursos, cartas de desarrollo y puertos se leen **por ícono**: cinco siluetas distintas (sirven con daltonismo), ancla para el 3:1 y el ícono del recurso con «2:1» en los puertos. El nombre sale sólo como tooltip (hover o toque largo) y en `aria-label`
- El anfitrión puede **agregar o sacar bots** para completar la mesa
- Al comprar una carta de desarrollo, **sólo el comprador** la abre como un sobre de figuritas en CSS 3D (se arranca la tira, sube la carta y gira con destello y brillo holográfico). El resto no cambia de cámara ni de pantalla: en el registro queda «compró una carta de desarrollo»
- **Registro estilo Colonist**: log lateral con iconos de recursos, filtros, sin filtrar manos ni el tipo de carta comprada. Si te roban, sólo vos ves el aviso «Nombre te robó 1 Madera» (ícono y sonido). Los demás leen «le robó 1 carta», sin el recurso
- **Chat en vivo** con color del jugador, emotes, sanitizado y tope de mensajes
- Colocación inicial en serpiente, dados, producción, 7 / ladrón / descarte
- Construcción, comercio con banco/puertos (tasa visible por recurso) y ofertas entre jugadores con varios recursos por lado, en un panel con pestañas **Construir · Banco · Jugadores** (atajos B y T)
- Cartas de desarrollo, camino más largo, ejército más grande, victoria (10 por defecto)
- UI rioplatense, desktop y celular; panel de mesa plegable que no tapa el tablero. Ajustes (centrar, gráficos, ambiente, sonido, confirmación y, con teclado, atajos) en un solo menú. Cada obra o gasto (casita, ciudad, camino, carta, ladrón, banco, oferta, pasar turno) se marca con el primer toque —lugar, costo y qué va a pasar— y se ejecuta con el segundo toque o con Confirmar. Cancelar o Esc lo deshace. En Opciones se puede apagar; viene prendida y queda en el navegador. Los vértices y los caminos tienen un volumen de toque, y el toque se cierra al soltar aunque el tablero se vuelva a dibujar. Los 6 asientos entran en 390 px con etiqueta BOT, cartas y puntos. De cada rival se ve, junto a los puntos y en Jugadores, cuántas cartas de recurso y de desarrollo tiene (boca abajo) y cuántos caballeros ya jugó; el Ejército más grande queda marcado. El turno queda fijo encima de la mano: el nombre de quien juega, en su color, y el reloj, sin tapar el tablero ni el registro. «Es tu turno» sigue siendo el aviso breve, con sonido, al empezar tu turno
- **Gráficos: normal / liviano** (automático en celu, toggle en partida, se guarda en localStorage). El canvas 3D se carga en un chunk aparte
- Tablero 3D como un Catán físico: isla hexagonal simétrica, mar dentro de un marco de nogal, puertos con muelle, losetas de cartón parejas. Terrenos que se leen por forma y material (bosque, colinas de arcilla, trigo, pasto con ovejas, montaña nevada, dunas), no sólo por color. El ladrón va al costado de la loseta, más chico y semitransparente, para no tapar el número ni el terreno. La cámara encuadra la isla al entrar y con **Centrar**; no se mueve, no hace zoom ni enfoca por lo que hacen los demás (construir, dados, ladrón, cartas, comercio). Si una toma propia (tus dados o tu ladrón) igual la corre, guarda dónde la tenías y vuelve sola en menos de un segundo. Las duraciones y curvas están en `src/motion` (docs/motion.md): las piezas caen y se asientan, la ciudad crece desde la base, el ladrón levanta y apoya, y la isla sale del agua loseta por loseta. En celu el modo liviano acorta el viaje; reducir movimiento deja la pose final. Nada de eso bloquea la mesa ni mueve la cámara
- Dados marfil con física (`cannon-es`) en una bandeja: caen con peso, un rebote corto, sombra de contacto y un golpe que sigue la caída. El número lo saca el servidor con `crypto.randomInt`; todos los clientes ven la misma tirada y la cara final es ese número. El HUD no spoilea el total hasta que asientan. Al revelarse, tus recursos salen de la casilla que los produjo y llegan en arco a tu mano (escalonados, con +N, un sonido suave y un rebote) en menos de 1,5 s, sin mover la cámara ni bloquear la mesa. Lo que cobran los demás es un +N corto sobre esa casilla. Gráficos livianos acortan el arco; reducir movimiento lo deja quieto. Sonidos sintetizados con Web Audio (sin samples) e impactos por impulso
- Tests de reglas + simulaciones masivas 3/4/5/6 + e2e de 6 clientes (`npm test`, `npm run sim`, `npm run sim:mass`)

## Correr en local

Requisitos: Node 22+.

```bash
npm install
npm run dev
```

- App (Vite + WebSocket, mismo origen): http://127.0.0.1:43210

Para producción en un solo puerto:

```bash
npm run build
PORT=43211 CORS_ORIGIN=http://127.0.0.1:43211 npm start
```

Abrí http://127.0.0.1:43211 — creá una partida, elegí asientos, meté bots si hace falta, compartí el código o el link.

Tests y chequeos:

```bash
npm test
npm run typecheck   # tsc -b: cliente, server, configs y tests
npm run lint
npm run sim
npm run sim:mass
```

Variables de entorno (ver `.env.example`):

| Variable | Qué hace |
| --- | --- |
| `PORT` | Puerto del proceso (dev default `43210`, producción `43211`) |
| `CORS_ORIGIN` | **Obligatorio en producción** (fail-fast si falta **o** si vale `*` / `true`). Lista de orígenes separados por coma; se normalizan como el header `Origin` del browser (minúsculas, sin ruta ni barra final, sin `:443`/`:80`). Una entrada que no sea `http(s)://host` avisa al arrancar. Sin la variable, el handshake WebSocket acepta same-origin y clientes **sin** header `Origin` (tests/smoke); un Origin cruzado se rechaza. |
| `TRUST_PROXY` | Apagado por defecto (el `Dockerfile` lo fija en `0`). `1` **sólo** detrás de un reverse proxy **que vos controlás** y que **agrega** `X-Forwarded-For` (nginx, Caddy, Fly, un load balancer propio). Se toma el **último** hop: eso es lo que acaba de escribir tu proxy, no el primer valor (el cliente lo puede inventar). **No lo actives** si el proceso está expuesto directo a internet. **Con CDN + Render** el último hop suele ser el tramo CDN→Render, **no** la IP real del jugador: no sirve para rate-limit ni para “quién es”. Dejalo apagado salvo que el hop inmediato sea de confianza y sepas qué IP estás leyendo. |
| `COLONOS_DEV` | `1` monta Vite y habilita `POST /api/dev/prepare-unbox` (`npm run dev`). **En producción se ignora** (`NODE_ENV=production`). |

## Docker

```bash
docker build -t colonos .
docker run --rm -p 8080:8080 -e CORS_ORIGIN=http://localhost:8080 colonos
```

La imagen **no** trae `CORS_ORIGIN=*`. Sin `-e CORS_ORIGIN=...` el proceso no arranca (`NODE_ENV=production`). Con `CORS_ORIGIN=*` también falla (fail-fast). Corre como usuario `node`, con `HEALTHCHECK` en `/api/health`. `TRUST_PROXY=0` viene explícito: pasalo a `1` con `-e` sólo detrás de un proxy tuyo. `COLONOS_DEV` se ignora en la imagen.

La app queda en http://localhost:8080.

## Deploy (Render / Fly.io / Railway)

Vercel serverless **no sirve**: el WebSocket tiene que ser un proceso persistente.

### Render (Web Service)

1. Conectá el repo.
2. Build: `npm install && npm run build`
3. Start: `npx tsx server/index.ts`
4. Puerto: `PORT` lo setea Render (el server lo lee).
5. Health check: `GET /api/health`

### Fly.io

```bash
fly launch
```

Usá el `Dockerfile`. En `fly.toml`, `internal_port = 8080`.

### Railway

1. New project from repo.
2. Start command: `npm run build && npx tsx server/index.ts`
3. El `PORT` lo inyecta Railway.

Después del deploy, abrí la URL pública, creá una sala y pasá `https://tu-dominio/?sala=CODIGO`.

## Limitaciones

- Estado sólo en RAM: un restart borra las mesas. Las salas vacías se podan a los 30 min (tope 200 mesas).
- Un solo servidor (no hay sticky sessions ni Redis).
- Los modelos 3D son geométricos (casas, caminos, ladrón), no assets de estudio.
- El token de sesión es secreto: no lo reenvíes. No se reusa entre salas.
- Cartas de progreso: **sólo el caballero** se puede jugar antes de tirar (fase dados). Invento, monopolio y caminos son en el turno principal, después de los dados.
- En producción `CORS_ORIGIN` es obligatorio: sin la variable **o con `*`** el proceso no arranca. El upgrade WebSocket valida Origin (same-origin ok; sin Origin se permite para tests).
- Marca *Catan* / *Catán* es de sus dueños; esto es un clon para jugar entre amigues.

## Hugging Face Spaces (Docker)

Este directorio está listo para subirse tal cual a un Space con `sdk: docker` (frontmatter arriba, `app_port: 7860`).

- El `Dockerfile` fija `PORT=7860`, corre como UID 1000 (`node`) y deja `TRUST_PROXY=1` (el tráfico entra por el proxy de HF).
- `CORS_ORIGIN` viene con un **placeholder** (`https://OWNER-SPACE.hf.space`). Definí la variable `CORS_ORIGIN` en *Settings → Variables and secrets* con la URL real (`https://<owner>-<space>.hf.space`; lista separada por comas si hay más de un origen). Sin la variable el server arranca igual (el WebSocket del mismo origen se acepta), pero conviene dejarla bien.
- Las partidas viven en RAM: si el Space se duerme o se reinicia, se pierden.
