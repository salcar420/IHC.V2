# AirTheremin Colaborativo

Proyecto de Interacción Humano-Computador (IHC) — un instrumento musical aéreo controlado con gestos de la mano (vía cámara web), con modo solo, modo grupal en tiempo real (hasta 3 usuarios), instrumentos sintetizados y reales, escalas musicales guiadas, un modo lección gamificado para aprender canciones, modo teclado de respaldo y captura de métricas de usabilidad.

---

## 1. ¿Qué hace este proyecto?

El usuario mueve la mano frente a la cámara y toca un instrumento sin tocar nada físicamente. La aplicación:

- **Detecta la mano** en tiempo real con MediaPipe Hands.
- **Convierte la posición de los dedos en sonido** con Tone.js:
  - Posición horizontal del índice → frecuencia (nota).
  - Posición vertical del índice → filtro (timbre).
  - Apertura entre pulgar y meñique → volumen.
  - Pinza (índice + pulgar juntos) → activar / silenciar nota.
- **Suaviza el gesto** con un *One Euro Filter* (quita el temblor sin añadir retardo) y detecta la pinza con **histéresis normalizada por el tamaño de la mano**, para que el umbral no dependa de qué tan cerca esté la cámara.
- **Sincroniza hasta 3 usuarios** en una sala compartida usando WebSockets (Socket.IO), donde cada uno escucha lo que tocan los demás en tiempo real.
- **Ofrece 5 instrumentos**: Theremin, Bajo synth, Campana FM, Piano (samples reales), Guitarra acústica (samples reales).
- **Tiene 5 escalas musicales** con snap automático: Libre, Pentatónica, Do Mayor, La Menor, Blues.
- **Incluye modo lección gamificado** estilo Synthesia con 4 canciones, estrellas (1-3), récord por canción, heatmap de notas difíciles y métricas de precisión.
- **Botón de espejo (🪞)** para alternar entre vista selfie y vista normal (texto del entorno legible).
- **Modo teclado (teclas 1-7)** como alternativa accesible y respaldo cuando no hay cámara.
- **Tutorial onboarding** que enseña los gestos al usuario nuevo.
- **Captura métricas de usabilidad IHC** (precisión, tiempo, SEQ) exportables a CSV.

---

## 2. Tecnologías

| Capa | Tecnología |
|---|---|
| Backend | Node.js + Express 5 |
| Tiempo real | Socket.IO 4 |
| Detección de manos | MediaPipe Hands (CDN) |
| Audio | Tone.js 14 (CDN) |
| Frontend | HTML / CSS / JavaScript vanilla |
| Persistencia | localStorage (métricas, récords, SEQ) |

---

## 3. Requisitos previos

- **Node.js** 18 o superior — [descargar aquí](https://nodejs.org/)
- **Navegador moderno** con permiso de cámara (Chrome, Edge, Firefox).
- **Cámara web** funcionando *(opcional: sin cámara se puede usar el modo teclado)*.
- **Altavoces o audífonos** (recomendado audífonos en modo grupal para evitar feedback).
- **Conexión a Internet** (los samples de piano/guitarra y las librerías MediaPipe/Tone.js se cargan desde CDN).

---

## 4. Instalación

Abre una terminal (PowerShell o CMD en Windows) en la carpeta del proyecto:

```bash
cd C:\Users\Javier\Documents\ProyectoIHC
npm install
```

Esto descarga las dependencias listadas en `package.json` (Express y Socket.IO).

---

## 5. Cómo iniciar el servidor

Desde la misma carpeta:

```bash
npm start
```

Verás en la consola:

```
🚀 Servidor activo en http://localhost:3000
Presiona Ctrl + C en esta terminal para detenerlo.
```

Abre tu navegador en **http://localhost:3000**.

> Para detener el servidor: `Ctrl + C` en la terminal.

### Variables de entorno

El puerto se puede cambiar con `PORT` (por defecto `3000`):

```bash
PORT=8080 npm start
```

### Verificar que el servidor está vivo

Hay un endpoint de salud para comprobar el estado con un `curl` antes de exponerlo:

```bash
curl http://localhost:3000/health
# {"ok":true,"enSala":0,"max":3,"uptime":12.3}
```

### Probar el modo grupal localmente

Abre **dos o tres pestañas** del navegador apuntando a `http://localhost:3000`. Cada pestaña actúa como un usuario distinto.

### Probar desde otro dispositivo / exponer con túnel

Averigua la IP local de tu PC (`ipconfig` en Windows) y abre desde otro dispositivo `http://TU_IP:3000`. Algunos navegadores móviles bloquean el acceso a la cámara fuera de HTTPS — para esto necesitas un túnel.

Se recomienda **[pinggy](https://pinggy.io/)** (no requiere instalación):

```bash
ssh -p 443 -R0:localhost:3000 a.pinggy.io
```

> Nota: la librería de Socket.IO se sirve desde el propio servidor (`/socket.io/socket.io.js`), no desde un CDN, para que funcione correctamente a través del túnel.

---

## 6. Cómo usar la aplicación

### 6.1 Tutorial inicial

Al abrir la página aparece un overlay con 4 pasos. Se completan solos cuando haces el gesto:

1. **Enciende el instrumento** → pulsa "Instrumento Listo".
2. **Pellizca** → junta índice y pulgar.
3. **Mueve la mano** izquierda-derecha.
4. **Abre la mano** (pulgar y meñique separados) para subir el volumen.

Puedes saltar el tutorial con el botón "Saltar tutorial".

### 6.2 Controles principales

| Botón / Selector | Función |
|---|---|
| **Instrumento Listo** | Enciende / pausa tu audio. |
| **Modo: SOLO / GRUPAL** | Te une o saca de la sala compartida. |
| **Selector instrumento** | Cambia entre Theremin / Bajo / Campana / Piano / Guitarra. |
| **Selector escala** | Aplica snap musical: Libre / Pentatónica / Mayor / Menor / Blues. |
| **🪞 Espejo: ON / OFF** | Alterna la vista selfie (espejo) y la vista normal (texto del entorno legible). |
| **🎓 Iniciar Lección** | Inicia el modo guiado con la canción seleccionada. |
| **Selector canción** | Elige Estrellita / Mary Had a Little Lamb / Himno a la Alegría / Cumpleaños Feliz. |
| **⬇ CSV** | Exporta a un archivo CSV todas las métricas registradas (lecciones + SEQ). |

### 6.3 Gestos

- **Mano abierta moviendo en X** → recorre las notas (sin sonido si no pellizcas).
- **Pellizca (índice + pulgar)** → activa el sonido. La detección está normalizada por el tamaño de la mano y usa histéresis (umbral distinto para cerrar y abrir) → menos parpadeo.
- **Abre/cierra la mano (pulgar ↔ meñique)** → sube/baja el volumen.
- **Sube/baja la mano (eje Y)** → cambia el brillo del filtro.

### 6.4 Modo teclado (sin cámara / accesibilidad)

Las teclas **1 a 7** disparan las 7 primeras notas de la escala activa. Sirve como:
- **Respaldo** si la cámara no está disponible o no detecta la mano.
- **Alternativa accesible** para usuarios con movilidad reducida en los brazos.
- Forma rápida de que un instructor demuestre sin cámara.

### 6.5 Modo grupal

1. Pulsa "Modo: SOLO" para cambiar a "Modo: GRUPAL".
2. Si la sala ya tiene 3 personas, te avisará con un alert.
3. Verás cursores azules adicionales en el canvas, con el nombre del instrumento que toca cada uno encima.
4. Pulsa "Modo: GRUPAL" otra vez para volver al modo solo.

> El servidor valida y acota los datos recibidos y asigna el identificador de cada usuario del lado servidor (no se confía en el cliente), para evitar suplantaciones.

### 6.6 Modo lección (gamificado)

1. Selecciona una canción en el dropdown.
2. Pulsa "🎓 Iniciar Lección" (auto-enciende el audio si no estaba activo).
3. Verás una **banda verde pulsante** en la nota a tocar y el nombre arriba.
4. Mueve la mano a esa posición y pellizca → **flash verde + icono ✓ + texto** ("¡A la primera!" / "¡Bien!") y avanza.
5. Si fallas → **flash rojo + icono ✗ + "Reintenta"**. Debes soltar la pinza antes del siguiente intento.
6. Al terminar muestra:
   - **Estrellas 1-3** según precisión (★★★ > 85 %, ★★ 60-85 %, ★ < 60 %) y el **récord** guardado de esa canción.
   - Aciertos / total, intentos, precisión %, tiempo.
   - Un **heatmap** de dificultad por nota (verde = a la primera, amarillo = 1 fallo, rojo = 2+).
   - Una **pregunta de facilidad (SEQ)** de 1 a 7 para medir la usabilidad percibida.

---

## 7. Accesibilidad

El proyecto incorpora varias prácticas de accesibilidad (relevantes para la evaluación de IHC):

- **No solo color** (WCAG 1.4.1): el acierto/fallo de la lección se comunica también con icono (✓/✗) y texto, no únicamente con verde/rojo — usable por personas con daltonismo rojo-verde.
- **`prefers-reduced-motion`**: si el sistema operativo pide reducir animaciones, se desactivan transiciones y el pulso de la lección se vuelve estático.
- **Modo teclado** (teclas 1-7) como alternativa a los gestos.
- **`aria-label` / `aria-pressed`** en botones y selectores para lectores de pantalla.
- Contraste de texto mejorado sobre el fondo oscuro.

---

## 8. Estructura de archivos

```
ProyectoIHC/
├── package.json          # Dependencias y script "npm start"
├── server.js             # Servidor Express + Socket.IO (sala max 3, /health, validación)
├── public/
│   ├── index.html        # Interfaz: botones, selectores, canvas, overlay tutorial
│   ├── style.css         # Estilos: tema oscuro, botones .btn-pill, modal SEQ, reduce-motion
│   └── script.js         # Lógica completa del frontend (~1100 líneas)
└── README.md             # Este archivo
```

### Qué hace cada archivo

- **`server.js`** — sirve `public/` como estática, expone `/health`, gestiona la sala `sala_principal` (máx. 3 sockets), **valida y acota** los eventos `datos_theremin` antes de retransmitirlos y fuerza el `id` del emisor del lado servidor. Puerto configurable con `PORT`.
- **`public/index.html`** — barra de controles, canvas 800×500, overlay del tutorial. Carga MediaPipe, Tone.js y Socket.IO; estilos por clases (sin estilos inline).
- **`public/style.css`** — tema oscuro, clases reutilizables `.btn-pill`, modal de SEQ y bloque `@media (prefers-reduced-motion)`.
- **`public/script.js`** — toda la lógica, con estas piezas clave:
  - **`CFG`** — objeto central de constantes (rangos de frecuencia/filtro/volumen, umbrales de pinza, parámetros del filtro, etc.). **Para ajustar el "feel" se edita aquí.**
  - **`class OneEuroFilter`** — suavizado de landmarks sin lag.
  - **`mapearAControl()`** — única fuente de verdad gesto → audio (la usan el audio local y el remoto).
  - **`eliminarCompanero()`** — limpieza unificada de synths/cursores remotos.
  - Factory de instrumentos (continuos y sampleados, con `onerror`).
  - `encenderAudio()`, modo lección con métricas, modo teclado, SEQ y `exportarCSV()`.

### Ajustar la sensibilidad del gesto

Si la pinza cuesta de activar o se dispara sola, edita en `public/script.js` los umbrales dentro de `CFG`:

```js
PINZA_CERRAR: 0.40, PINZA_ABRIR: 0.62,  // súbelos si no detecta; bájalos si dispara solo
OEF_MIN_CUTOFF: 1.4, OEF_BETA: 0.012,   // suavizado (más cutoff = más responsivo, menos suave)
```

---

## 9. Eventos de Socket.IO (referencia técnica)

| Evento | Dirección | Payload | Propósito |
|---|---|---|---|
| `unirse_sala` | Cliente → Servidor | — | Solicita entrar a la sala grupal. |
| `salir_sala` | Cliente → Servidor | — | Sale de la sala. |
| `sala_llena` | Servidor → Cliente | string | Aviso de sala con 3 usuarios. |
| `ingreso_exitoso` | Servidor → Cliente | — | Confirma ingreso a la sala. |
| `datos_theremin` | Cliente → Servidor | `{x, y, apertura, pinch, instrumento}` | Envía datos del frame (throttle 20 fps). |
| `datos_companeros` | Servidor → Clientes | `{id, x, y, apertura, pinch, instrumento}` | Retransmite los datos (validados, con `id` del servidor) al resto de la sala. |
| `usuario_desconectado` | Servidor → Clientes | id | Indica que alguien se fue, para limpiar su cursor y synth remoto. |

---

## 10. Problemas comunes

### "No me detecta la mano"
- Asegúrate de que diste permiso de cámara al navegador.
- Verifica buena iluminación; MediaPipe necesita contraste.
- La mano debe estar dentro del recuadro del video.
- Como alternativa, usa el **modo teclado (teclas 1-7)**.

### "La pinza no responde bien"
- Ajusta `CFG.PINZA_CERRAR` / `CFG.PINZA_ABRIR` en `public/script.js` (ver sección 8).

### "No suena nada al pellizcar"
- ¿Pulsaste "Instrumento Listo"? Debe estar en rojo "ENCENDIDO".
- ¿Tienes el volumen del sistema activo?
- Si elegiste Piano o Guitarra, espera 1-2 segundos a que carguen los samples (el selector se ve semitransparente mientras carga).

### "El piano/guitarra no carga"
- Necesitas conexión a Internet (los .mp3 vienen de CDN externos). Si falla, la app te avisa y puedes seguir con un instrumento sintetizado.
- Revisa la consola del navegador (F12) por errores de red.

### "El texto se ve al revés / la cámara está espejada"
- Es el modo selfie (intencional, hace el control intuitivo). Pulsa **🪞 Espejo: OFF** para ver el video sin invertir.

### "Grupal dice sala llena"
- Solo 3 usuarios simultáneos. Pide a alguien que salga.

### "Suena con eco/distorsión en grupal"
- Usa **audífonos**. El micrófono del compañero podría estar capturando tu audio creando feedback.

---

## 11. Métricas IHC capturadas

El modo lección registra automáticamente (persistido en `localStorage` y exportable con **⬇ CSV**):

- **Aciertos / Total notas** — qué tan completa fue la sesión.
- **Intentos totales** — incluye fallidos.
- **Precisión %** — `aciertos / intentos × 100`.
- **Estrellas (1-3)** y **récord** por canción.
- **Tiempo total** en segundos.
- **Dificultad por nota** (fallos por nota → heatmap).
- **SEQ (Single Ease Question, 1-7)** — facilidad percibida tras cada lección.

El CSV incluye dos secciones: una tabla de sesiones de lección y otra con las respuestas SEQ, listas para análisis (curvas de aprendizaje, evaluación de usabilidad).

---

## 12. Créditos y librerías

- [Tone.js](https://tonejs.github.io/) — síntesis y manejo de audio.
- [MediaPipe Hands](https://google.github.io/mediapipe/solutions/hands.html) — detección de mano.
- [Socket.IO](https://socket.io/) — comunicación en tiempo real.
- [One Euro Filter](https://gery.casiez.net/1euro/) — suavizado de señales en tiempo real.
- **Samples piano**: Salamander Grand Piano (CDN oficial de Tone.js).
- **Samples guitarra**: [nbrosowsky/tonejs-instruments](https://github.com/nbrosowsky/tonejs-instruments).
</content>
</invoke>
