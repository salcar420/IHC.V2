# AirTheremin Colaborativo

Proyecto de Interacción Humano-Computador (IHC) — un instrumento musical aéreo controlado con gestos de la mano (vía cámara web), con modo solo, modo grupal en tiempo real (hasta 3 usuarios), instrumentos sintetizados y reales, escalas musicales guiadas y un modo lección para aprender canciones.

---

## 1. ¿Qué hace este proyecto?

El usuario mueve la mano frente a la cámara y toca un instrumento sin tocar nada físicamente. La aplicación:

- **Detecta la mano** en tiempo real con MediaPipe Hands.
- **Convierte la posición de los dedos en sonido** con Tone.js:
  - Posición horizontal del índice → frecuencia (nota).
  - Posición vertical del índice → filtro (timbre).
  - Apertura entre pulgar y meñique → volumen.
  - Pinza (índice + pulgar juntos) → activar / silenciar nota.
- **Sincroniza hasta 3 usuarios** en una sala compartida usando WebSockets (Socket.IO), donde cada uno escucha lo que tocan los demás en tiempo real.
- **Ofrece 5 instrumentos**: Theremin, Bajo synth, Campana FM, Piano (samples reales), Guitarra acústica (samples reales).
- **Tiene 5 escalas musicales** con snap automático: Libre, Pentatónica, Do Mayor, La Menor, Blues.
- **Incluye modo lección guiada** estilo Synthesia con 4 canciones (Estrellita, Mary Had a Little Lamb, Himno a la Alegría, Cumpleaños Feliz).
- **Tutorial onboarding** que enseña los gestos al usuario nuevo.

---

## 2. Tecnologías

| Capa | Tecnología |
|---|---|
| Backend | Node.js + Express 5 |
| Tiempo real | Socket.IO 4 |
| Detección de manos | MediaPipe Hands (CDN) |
| Audio | Tone.js 14 (CDN) |
| Frontend | HTML / CSS / JavaScript vanilla |

---

## 3. Requisitos previos

- **Node.js** 18 o superior — [descargar aquí](https://nodejs.org/)
- **Navegador moderno** con permiso de cámara (Chrome, Edge, Firefox).
- **Cámara web** funcionando.
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

### Probar el modo grupal localmente

Abre **dos o tres pestañas** del navegador apuntando a `http://localhost:3000`. Cada pestaña actúa como un usuario distinto.

### Probar desde otro dispositivo en la misma red

Averigua la IP local de tu PC (`ipconfig` en Windows) y abre desde otro dispositivo `http://TU_IP:3000`. Algunos navegadores móviles bloquean el acceso a cámara fuera de HTTPS — para esto necesitarías un túnel como `ngrok`.

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
| **🎓 Iniciar Lección** | Inicia el modo guiado con la canción seleccionada. |
| **Selector canción** | Elige Estrellita / Mary Had a Little Lamb / Himno a la Alegría / Cumpleaños Feliz. |

### 6.3 Gestos

- **Mano abierta moviendo en X** → recorre las notas (sin sonido si no pellizcas).
- **Pellizca (índice + pulgar)** → activa el sonido.
- **Abre/cierra la mano (pulgar ↔ meñique)** → sube/baja el volumen.
- **Sube/baja la mano (eje Y)** → cambia el brillo del filtro.

### 6.4 Modo grupal

1. Pulsa "Modo: SOLO" para cambiar a "Modo: GRUPAL".
2. Si la sala ya tiene 3 personas, te avisará con un alert.
3. Verás cursores azules adicionales en el canvas, con el nombre del instrumento que toca cada uno encima.
4. Pulsa "Modo: GRUPAL" otra vez para volver al modo solo.

### 6.5 Modo lección

1. Selecciona una canción en el dropdown.
2. Pulsa "🎓 Iniciar Lección" (auto-enciende el audio si no estaba activo).
3. Verás una **banda verde pulsante** en la nota a tocar y el nombre arriba.
4. Mueve la mano a esa posición y pellizca → flash verde + avanza.
5. Si fallas → flash rojo + cuenta como intento. Debes soltar la pinza antes del siguiente intento.
6. Al terminar muestra: aciertos / total, intentos, precisión %, tiempo.

---

## 7. Estructura de archivos

```
ProyectoIHC/
├── package.json          # Dependencias y script "npm start"
├── server.js             # Servidor Express + Socket.IO (sala max 3 usuarios)
├── public/
│   ├── index.html        # Interfaz: botones, selectores, canvas, overlay tutorial
│   ├── style.css         # Estilos: fondo, botones, tutorial, escala
│   └── script.js         # Lógica completa del frontend (~750 líneas)
└── README.md             # Este archivo
```

### Qué hace cada archivo

- **`server.js`** — sirve la carpeta `public/` como estática, gestiona la sala `sala_principal` con máximo 3 sockets, retransmite los eventos `datos_theremin` entre miembros y notifica desconexiones.
- **`public/index.html`** — estructura visual mínima: barra de controles, canvas 800×500, overlay del tutorial. Carga las librerías MediaPipe, Tone.js y Socket.IO desde CDN.
- **`public/style.css`** — estilos del tema oscuro (azul/rojo neón), botones redondeados, overlay del tutorial.
- **`public/script.js`** — toda la lógica:
  - Detección de manos (MediaPipe Hands).
  - Factory de instrumentos (continuos y sampleados).
  - Sincronización por WebSockets.
  - Sistema de escalas con snap.
  - Tutorial onboarding.
  - Modo lección con detección de aciertos y métricas.
  - Dibujado del canvas (cursor, escala visual, HUD, feedback).

---

## 8. Eventos de Socket.IO (referencia técnica)

| Evento | Dirección | Payload | Propósito |
|---|---|---|---|
| `unirse_sala` | Cliente → Servidor | — | Solicita entrar a la sala grupal. |
| `salir_sala` | Cliente → Servidor | — | Sale de la sala. |
| `sala_llena` | Servidor → Cliente | string | Aviso de sala con 3 usuarios. |
| `ingreso_exitoso` | Servidor → Cliente | — | Confirma ingreso a la sala. |
| `datos_theremin` | Cliente → Servidor | `{id, x, y, apertura, pinch, instrumento}` | Envía datos del frame (throttle 20 fps). |
| `datos_companeros` | Servidor → Clientes | igual | Retransmite los datos al resto de la sala. |
| `usuario_desconectado` | Servidor → Clientes | id | Indica que alguien se fue, para limpiar su cursor y synth remoto. |

---

## 9. Problemas comunes

### "No me detecta la mano"
- Asegúrate de que diste permiso de cámara al navegador.
- Verifica buena iluminación; MediaPipe necesita contraste.
- La mano debe estar dentro del recuadro del video.

### "No suena nada al pellizcar"
- ¿Pulsaste "Instrumento Listo"? Debe estar en rojo "ENCENDIDO".
- ¿Tienes el volumen del sistema activo?
- Si elegiste Piano o Guitarra, espera 1-2 segundos a que carguen los samples (el selector se ve semitransparente mientras carga).

### "El piano/guitarra no carga"
- Necesitas conexión a Internet (los .mp3 vienen de CDN externos).
- Revisa la consola del navegador (F12) por errores de red.

### "Grupal dice sala llena"
- Solo 3 usuarios simultáneos. Pide a alguien que salga.

### "Suena con eco/distorsión en grupal"
- Usa **audífonos**. El micrófono del compañero podría estar capturando tu audio creando feedback.

---

## 10. Métricas IHC capturadas

El modo lección registra automáticamente:
- **Aciertos / Total notas** — qué tan completa fue la sesión.
- **Intentos totales** — incluye fallidos.
- **Precisión %** — `aciertos / intentos × 100`.
- **Tiempo total** en segundos.

Estos valores se muestran al terminar la canción y pueden usarse para evaluaciones de usabilidad o curvas de aprendizaje.

---

## 11. Créditos y librerías

- [Tone.js](https://tonejs.github.io/) — síntesis y manejo de audio.
- [MediaPipe Hands](https://google.github.io/mediapipe/solutions/hands.html) — detección de mano.
- [Socket.IO](https://socket.io/) — comunicación en tiempo real.
- **Samples piano**: Salamander Grand Piano (CDN oficial de Tone.js).
- **Samples guitarra**: [nbrosowsky/tonejs-instruments](https://github.com/nbrosowsky/tonejs-instruments).
