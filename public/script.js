/**
 * AirTheremin V5 - Colaborativo con WebSockets
 * MVP Proyecto 7: Hasta 3 usuarios en tiempo real
 */

const videoElement = document.getElementById('input_video');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement.getContext('2d');
const startBtn = document.getElementById('startBtn');
const modeBtn = document.getElementById('modeBtn');
const instrumentoSel = document.getElementById('instrumentoSel');
const escalaSel = document.getElementById('escalaSel');
const tutorialEl = document.getElementById('tutorial');
const tutorialSkip = document.getElementById('tutorialSkip');
const leccionBtn = document.getElementById('leccionBtn');
const cancionSel = document.getElementById('cancionSel');
const mirrorBtn = document.getElementById('mirrorBtn');

// --- TUTORIAL ONBOARDING ---
const pasosTutorial = { 1: false, 2: false, 3: false, 4: false };
let xInicioPinch = null;
let tutorialActivo = true;

function cerrarTutorial() {
    tutorialActivo = false;
    tutorialEl.style.transition = 'opacity 0.6s';
    tutorialEl.style.opacity = '0';
    setTimeout(() => { tutorialEl.style.display = 'none'; }, 600);
}

tutorialSkip.onclick = cerrarTutorial;

// --- 1. CONFIGURACIÓN DE RED (SOCKET.IO) ---
let socket;
try {
    socket = io(); // Llama al servidor Node.js
} catch (e) {
    console.error("Error al cargar Socket.io:", e);
}
let modoGrupal = false;
const companeros = {}; // Guarda los datos visuales de los otros usuarios
const sintetizadoresRemotos = {}; // Guarda los Theremins de los demás

// === CONFIG CENTRAL (constantes antes dispersas como "números mágicos") ===
const CFG = {
    // Mapeo gesto → audio
    FREQ_MIN: 130, FREQ_SPAN: 770,        // X del índice → frecuencia [130, 900] Hz
    FILTRO_MIN: 200, FILTRO_SPAN: 3500,   // Y del índice → filtro (timbre)
    VOL_FACTOR: 1.8, VOL_OFFSET: -15,     // apertura pulgar-meñique → volumen (dB)
    // Pinza con histéresis, normalizada por tamaño de mano (ratio dedo/palma):
    // cierra con umbral bajo y abre con uno más alto → sin parpadeo en la transición.
    PINZA_CERRAR: 0.40, PINZA_ABRIR: 0.62,
    // One Euro Filter (suavizado de landmarks sin lag perceptible)
    OEF_MIN_CUTOFF: 1.4, OEF_BETA: 0.012,
    LOOKAHEAD: 0.02,                      // latencia de Tone.js (menos = más responsivo)
    FLASH_MS: 400,                        // duración del flash de feedback en lección
    GRID_PX: 50,                          // separación de la rejilla de fondo
};

// One Euro Filter: suaviza una señal adaptándose a su velocidad (quieto = muy
// suave, rápido = responsivo). Estándar para landmarks de mano.
// Ref: https://github.com/casiez/OneEuroFilter
class OneEuroFilter {
    constructor(minCutoff = 1.0, beta = 0.0, dCutoff = 1.0) {
        this.minCutoff = minCutoff; this.beta = beta; this.dCutoff = dCutoff;
        this.xPrev = null; this.dxPrev = 0; this.tPrev = null;
    }
    _alpha(cutoff, dt) {
        const tau = 1 / (2 * Math.PI * cutoff);
        return 1 / (1 + tau / dt);
    }
    filter(x, tSec) {
        if (this.xPrev === null) { this.xPrev = x; this.tPrev = tSec; return x; }
        const dt = Math.max(1e-3, tSec - this.tPrev);
        const dx = (x - this.xPrev) / dt;
        const aD = this._alpha(this.dCutoff, dt);
        const dxHat = aD * dx + (1 - aD) * this.dxPrev;
        const cutoff = this.minCutoff + this.beta * Math.abs(dxHat);
        const a = this._alpha(cutoff, dt);
        const xHat = a * x + (1 - a) * this.xPrev;
        this.xPrev = xHat; this.dxPrev = dxHat; this.tPrev = tSec;
        return xHat;
    }
}

// Mapea coordenadas normalizadas (0..1) a parámetros de audio. ÚNICA fuente de
// verdad: la usan el audio local (onResults) y el remoto (datos_companeros), así
// local y compañeros suenan idéntico (antes el cálculo estaba duplicado).
function mapearAControl(x, y, apertura) {
    return {
        freq: x * CFG.FREQ_SPAN + CFG.FREQ_MIN,
        freqFiltro: (1 - y) * CFG.FILTRO_SPAN + CFG.FILTRO_MIN,
        volDb: Tone.gainToDb(Math.min(0.5, apertura * CFG.VOL_FACTOR)) + CFG.VOL_OFFSET,
    };
}

// Limpieza unificada de un compañero remoto (synth + cursor). Antes repetida 3×.
function eliminarCompanero(id) {
    const inst = sintetizadoresRemotos[id];
    if (inst) {
        inst.silenciar(0.1);
        setTimeout(() => inst.dispose(), 200);
        delete sintetizadoresRemotos[id];
    }
    delete companeros[id];
}

// Listeners de red: UN solo guard if(socket) con los tres handlers dentro.
// (Antes estaban en if(socket) anidados; estructura frágil que ya rompió la
//  app por desbalance de llaves. Ver memoria bug_socket_nested_ifs.md.)
if (socket) {
    // Sala llena (Requisito: Máximo 3)
    socket.on('sala_llena', (mensaje) => {
        alert(mensaje);
        modoGrupal = false;
        modeBtn.innerText = "Modo: SOLO";
    });

    // Movimientos de los demás
    socket.on('datos_companeros', (datos) => {
        if (!modoGrupal) return;

        companeros[datos.id] = datos;

        const tipoRemoto = datos.instrumento || 'theremin';

        // Si no existe o cambió de instrumento, recreamos el synth remoto
        const existente = sintetizadoresRemotos[datos.id];
        if (!existente || existente.tipo !== tipoRemoto) {
            if (existente) {
                existente.silenciar(0.05);
                setTimeout(() => existente.dispose(), 80);
            }
            const nuevo = crearInstrumento(tipoRemoto);
            nuevo.iniciar();
            sintetizadoresRemotos[datos.id] = nuevo;
        }

        // Actualizamos el sonido del compañero con sus coordenadas
        const inst = sintetizadoresRemotos[datos.id];
        const { freq, freqFiltro, volDb } = mapearAControl(datos.x, datos.y, datos.apertura);
        inst.actualizar(freq, freqFiltro, volDb, datos.pinch);
    });

    // Alguien se va: borrar su fantasma
    socket.on('usuario_desconectado', (id) => eliminarCompanero(id));
}

// --- 2. CONFIGURACIÓN DE AUDIO LOCAL Y BOTONES ---
let audioIniciado = false;
let estaPinchando = false;
let espejo = true; // selfie mirror: ON = control natural; OFF = texto del entorno legible
let pinzaActiva = false; // estado de la pinza con histéresis (separado del audio)

// Filtros One Euro para suavizar la posición del índice (pitch y timbre, donde el
// jitter se oye/ve más). Se reinician solos al perder y recuperar la mano.
const oefX = new OneEuroFilter(CFG.OEF_MIN_CUTOFF, CFG.OEF_BETA);
const oefY = new OneEuroFilter(CFG.OEF_MIN_CUTOFF, CFG.OEF_BETA);

// Respeta la preferencia del SO de reducir animaciones (accesibilidad / vestibular).
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Factory de instrumentos: devuelve una API uniforme actualizar/silenciar/dispose
// Hay dos familias:
//   - Continuos: osciladores que deslizan la frecuencia (theremin/bajo/campana)
//   - Sampleados: Tone.Sampler con audio real, dispara la nota más cercana (piano/guitarra)
function crearInstrumento(tipo) {
    if (tipo === 'piano' || tipo === 'guitarra') return crearSampleado(tipo);
    return crearContinuo(tipo);
}

function crearContinuo(tipo) {
    let osc, filtro;
    const extras = [];
    let multiplicadorFreq = 1;

    if (tipo === 'bajo') {
        const dist = new Tone.Distortion(0.35).toDestination();
        filtro = new Tone.Filter(500, "lowpass").connect(dist);
        osc = new Tone.Oscillator(110, "square").connect(filtro);
        extras.push(dist);
        multiplicadorFreq = 0.5;
    } else if (tipo === 'campana') {
        const reverb = new Tone.Reverb({ decay: 2.5, wet: 0.5 }).toDestination();
        filtro = new Tone.Filter(2000, "bandpass").connect(reverb);
        filtro.Q.value = 4;
        osc = new Tone.Oscillator(440, "triangle").connect(filtro);
        extras.push(reverb);
    } else {
        filtro = new Tone.Filter(800, "lowpass").toDestination();
        osc = new Tone.Oscillator(440, "sine").connect(filtro);
    }

    osc.volume.value = -Infinity;

    return {
        tipo,
        listo: true,
        familia: 'continuo',
        iniciar() { osc.start(); },
        actualizar(freq, freqFiltro, volDb, hayPinza) {
            const freqFinal = ajustarFreq(freq) * multiplicadorFreq;
            // Si hay snap activo, el cambio es brusco (no slide): rampa más corta
            const rampa = escalaActiva === 'cromatica' ? 0.1 : 0.02;
            osc.frequency.rampTo(freqFinal, rampa);
            filtro.frequency.rampTo(freqFiltro, 0.1);
            if (hayPinza) {
                osc.volume.rampTo(volDb, 0.05);
            } else {
                osc.volume.rampTo(-Infinity, 0.15);
            }
        },
        silenciar(rampSecs = 0.15) { osc.volume.rampTo(-Infinity, rampSecs); },
        dispose() {
            try { osc.stop(); } catch (e) {}
            osc.dispose();
            filtro.dispose();
            extras.forEach(e => e.dispose());
        }
    };
}

function crearSampleado(tipo) {
    const obj = { tipo, familia: 'sampleado', listo: false };
    let notaActual = null;

    const config = tipo === 'piano'
        ? {
            urls: {
                A1: "A1.mp3", C2: "C2.mp3", "D#2": "Ds2.mp3", "F#2": "Fs2.mp3",
                A2: "A2.mp3", C3: "C3.mp3", "D#3": "Ds3.mp3", "F#3": "Fs3.mp3",
                A3: "A3.mp3", C4: "C4.mp3", "D#4": "Ds4.mp3", "F#4": "Fs4.mp3",
                A4: "A4.mp3", C5: "C5.mp3", "D#5": "Ds5.mp3", "F#5": "Fs5.mp3",
                A5: "A5.mp3", C6: "C6.mp3"
            },
            release: 1.2,
            baseUrl: "https://tonejs.github.io/audio/salamander/",
        }
        : {
            urls: {
                A2: "A2.mp3", A3: "A3.mp3", A4: "A4.mp3",
                C3: "C3.mp3", C4: "C4.mp3", C5: "C5.mp3",
                E2: "E2.mp3", E3: "E3.mp3", E4: "E4.mp3"
            },
            release: 0.8,
            baseUrl: "https://nbrosowsky.github.io/tonejs-instruments/samples/guitar-acoustic/",
        };

    const sampler = new Tone.Sampler({
        ...config,
        onload: () => { obj.listo = true; },
        // Si el CDN de samples falla (sin internet), no quedamos "cargando" para
        // siempre: marcamos error, restauramos el selector y avisamos.
        onerror: (e) => {
            obj.error = true;
            console.error('Error cargando samples de', tipo, e);
            instrumentoSel.style.opacity = '1';
            alert(`No se pudieron cargar los samples de ${tipo} (¿sin conexión?). Usa un instrumento sintetizado mientras tanto.`);
        }
    }).toDestination();

    obj.iniciar = () => {};
    obj.actualizar = (freq, freqFiltro, volDb, hayPinza) => {
        if (!obj.listo) return;
        // En lección, todas las notas son tocables (la canción puede usar notas
        // que no estén en la escala activa del usuario).
        const lista = modoLeccion ? NOTAS : notasActivas;
        const nombre = notaMasCercana(freq, lista).nombre;
        if (hayPinza) {
            if (notaActual !== nombre) {
                if (notaActual) sampler.triggerRelease(notaActual);
                const velocity = Math.max(0.1, Math.min(1, Tone.dbToGain(volDb + 18)));
                sampler.triggerAttack(nombre, undefined, velocity);
                notaActual = nombre;
            }
        } else if (notaActual) {
            sampler.triggerRelease(notaActual);
            notaActual = null;
        }
    };
    obj.silenciar = () => {
        if (notaActual) {
            sampler.triggerRelease(notaActual);
            notaActual = null;
        }
    };
    obj.dispose = () => {
        obj.silenciar();
        sampler.dispose();
    };

    return obj;
}

let miInstrumento = crearInstrumento('theremin');
let tipoInstrumentoActual = 'theremin';

// Throttle de emisión (20 fps) para no saturar la red en modo grupal
let ultimaEmision = 0;
const INTERVALO_EMISION_MS = 50;

// Tabla de notas para mapear frecuencia → nombre y dibujar la escala
const NOTAS = [
    { nombre: 'C3', freq: 130.81 }, { nombre: 'D3', freq: 146.83 },
    { nombre: 'E3', freq: 164.81 }, { nombre: 'F3', freq: 174.61 },
    { nombre: 'G3', freq: 196.00 }, { nombre: 'A3', freq: 220.00 },
    { nombre: 'B3', freq: 246.94 }, { nombre: 'C4', freq: 261.63 },
    { nombre: 'D4', freq: 293.66 }, { nombre: 'E4', freq: 329.63 },
    { nombre: 'F4', freq: 349.23 }, { nombre: 'G4', freq: 392.00 },
    { nombre: 'A4', freq: 440.00 }, { nombre: 'B4', freq: 493.88 },
    { nombre: 'C5', freq: 523.25 }, { nombre: 'D5', freq: 587.33 },
    { nombre: 'E5', freq: 659.25 }, { nombre: 'F5', freq: 698.46 },
    { nombre: 'G5', freq: 783.99 }, { nombre: 'A5', freq: 880.00 }
];

function freqAPixelX(freq) {
    return ((freq - CFG.FREQ_MIN) / CFG.FREQ_SPAN) * canvasElement.width;
}

// Escalas: lista de notas (sin octava) permitidas por cada modo
const ESCALAS = {
    cromatica: null, // sin filtro, todas las notas
    pentatonica: ['C', 'D', 'E', 'G', 'A'],
    mayor: ['C', 'D', 'E', 'F', 'G', 'A', 'B'],
    menor: ['A', 'B', 'C', 'D', 'E', 'F', 'G'],
    blues: ['C', 'D#', 'F', 'F#', 'G', 'A#']
};

let escalaActiva = 'cromatica';
let notasActivas = NOTAS;

function recalcularNotasActivas() {
    const permitidas = ESCALAS[escalaActiva];
    notasActivas = permitidas
        ? NOTAS.filter(n => permitidas.includes(n.nombre.replace(/[0-9]/g, '')))
        : NOTAS;
}

function notaMasCercana(freq, lista = notasActivas) {
    let mejor = lista[0];
    let minDiff = Math.abs(freq - mejor.freq);
    for (const n of lista) {
        const d = Math.abs(freq - n.freq);
        if (d < minDiff) { minDiff = d; mejor = n; }
    }
    return mejor;
}

// Aplica snap a la frecuencia si hay escala activa (≠ cromática)
// En modo lección siempre snap a cualquier nota cromática, así el usuario
// puede tocar afinado aunque tenga otra escala configurada.
function ajustarFreq(freq) {
    if (modoLeccion) return notaMasCercana(freq, NOTAS).freq;
    if (escalaActiva === 'cromatica') return freq;
    return notaMasCercana(freq).freq;
}

escalaSel.onchange = () => {
    escalaActiva = escalaSel.value;
    recalcularNotasActivas();
};

// Enciende el audio una sola vez. Con try/catch: si el navegador bloquea el
// AudioContext (sin gesto válido) no deja el estado a medias. Reusado por
// startBtn y leccionBtn (antes el bloque estaba duplicado).
async function encenderAudio() {
    if (audioIniciado) return true;
    try {
        await Tone.start();
        Tone.getContext().lookAhead = CFG.LOOKAHEAD; // menos latencia gestual
        miInstrumento.iniciar();
        audioIniciado = true;
        startBtn.innerText = "Instrumento: ENCENDIDO (Click para pausar)";
        startBtn.style.background = "#e94560"; // Rojo activo
        startBtn.setAttribute('aria-pressed', 'true');
        marcarPaso(1);
        return true;
    } catch (e) {
        console.error('No se pudo iniciar el audio:', e);
        alert('No se pudo iniciar el audio. Vuelve a hacer clic o revisa los permisos del navegador.');
        return false;
    }
}

// Toggle Encender/Pausar
startBtn.onclick = async () => {
    if (!audioIniciado) {
        await encenderAudio();
    } else {
        audioIniciado = false;
        miInstrumento.silenciar(0.1);
        startBtn.innerText = "Instrumento: PAUSADO (Click para reanudar)";
        startBtn.style.background = "#0f3460"; // Azul inactivo
        startBtn.setAttribute('aria-pressed', 'false');
    }
};

// Selector de instrumento: recreamos el synth local al cambiar
instrumentoSel.onchange = () => {
    const tipoNuevo = instrumentoSel.value;
    if (tipoNuevo === tipoInstrumentoActual) return;

    const seguiraSonando = audioIniciado;
    miInstrumento.silenciar(0.05);
    const viejo = miInstrumento;
    setTimeout(() => viejo.dispose(), 80);

    miInstrumento = crearInstrumento(tipoNuevo);
    tipoInstrumentoActual = tipoNuevo;
    if (seguiraSonando) miInstrumento.iniciar();

    // Indicador de carga para samplers (piano/guitarra bajan MP3s)
    if (miInstrumento.familia === 'sampleado' && !miInstrumento.listo) {
        instrumentoSel.style.opacity = '0.55';
        const ref = miInstrumento;
        const reloj = setInterval(() => {
            if (ref.listo || ref.error || miInstrumento !== ref) {
                instrumentoSel.style.opacity = '1';
                clearInterval(reloj);
            }
        }, 120);
    }
};

// ARREGLO: Lógica de Sala (Solicitar unirse o salir)
modeBtn.onclick = () => {
    modoGrupal = !modoGrupal;
    modeBtn.setAttribute('aria-pressed', String(modoGrupal));

    if (modoGrupal) {
        // Al activar, pedimos permiso para entrar
        if (socket) socket.emit('unirse_sala');
        modeBtn.innerText = "Modo: GRUPAL";
        modeBtn.style.background = "#e94560";
    } else {
        // Al desactivar, le avisamos al servidor que salimos de la sala
        if (socket) socket.emit('salir_sala');
        modeBtn.innerText = "Modo: SOLO";
        modeBtn.style.background = "#28a745";
        
        // Limpiamos los "fantasmas" locales inmediatamente (synths + cursores).
        // Unión de ambos diccionarios para no dejar ningún synth remoto colgado.
        const ids = new Set([...Object.keys(sintetizadoresRemotos), ...Object.keys(companeros)]);
        ids.forEach(eliminarCompanero);
    }
};

// Toggle de espejo: por defecto ON (modo selfie, control intuitivo).
// Al apagarlo, el video se ve sin invertir (texto del entorno legible) y el
// mapeo horizontal se invierte también para que el cursor siga alineado.
mirrorBtn.onclick = () => {
    espejo = !espejo;
    mirrorBtn.innerText = espejo ? '🪞 Espejo: ON' : '🪞 Espejo: OFF';
    mirrorBtn.setAttribute('aria-pressed', String(espejo));
};

// --- 3. INTERFAZ VISUAL ---
function dibujarFondo() {
    canvasCtx.strokeStyle = "rgba(233, 69, 96, 0.1)";
    canvasCtx.lineWidth = 1;
    for(let i=0; i<canvasElement.width; i+=CFG.GRID_PX) {
        canvasCtx.beginPath();
        canvasCtx.moveTo(i, 0);
        canvasCtx.lineTo(i, canvasElement.height);
        canvasCtx.stroke();
    }
}

function dibujarEscalaNotas() {
    const h = canvasElement.height;
    const yBase = h - 30;

    canvasCtx.fillStyle = "rgba(0, 0, 0, 0.45)";
    canvasCtx.fillRect(0, yBase - 5, canvasElement.width, 35);

    const hayEscala = escalaActiva !== 'cromatica';

    for (const nota of NOTAS) {
        const x = freqAPixelX(nota.freq);
        const esC = nota.nombre.startsWith('C');
        const esA4 = nota.nombre === 'A4';
        const enEscala = notasActivas.includes(nota);

        // Color principal: amarillo si pertenece a la escala activa, si no atenuado
        let color;
        if (hayEscala && enEscala) {
            color = "rgba(255, 200, 0, 0.85)";
        } else if (hayEscala && !enEscala) {
            color = "rgba(255, 255, 255, 0.08)";
        } else if (esC) {
            color = "rgba(233, 69, 96, 0.55)";
        } else if (esA4) {
            color = "rgba(0, 200, 255, 0.45)";
        } else {
            color = "rgba(255, 255, 255, 0.18)";
        }

        canvasCtx.strokeStyle = color;
        canvasCtx.lineWidth = (enEscala && hayEscala) || (!hayEscala && (esC || esA4)) ? 1.8 : 1;
        canvasCtx.beginPath();
        const arriba = (hayEscala && enEscala) || (!hayEscala && (esC || esA4)) ? 0 : yBase - 5;
        canvasCtx.moveTo(x, arriba);
        canvasCtx.lineTo(x, yBase);
        canvasCtx.stroke();

        // Etiquetas: en cromática solo C y A4; en escala, todas las activas
        const mostrarEtiqueta = hayEscala ? enEscala : (esC || esA4);
        if (mostrarEtiqueta) {
            canvasCtx.fillStyle = hayEscala
                ? "#ffc800"
                : (esC ? "#e94560" : "#00c8ff");
            canvasCtx.font = "bold 12px Segoe UI, Arial";
            canvasCtx.textAlign = "center";
            canvasCtx.fillText(nota.nombre, x, yBase + 18);
        }
    }
}

function dibujarNotaActual(freq) {
    // Mostrar la misma nota que realmente suena: en lección el audio usa todas
    // las NOTAS; fuera de lección, la escala activa.
    const nota = notaMasCercana(freq, modoLeccion ? NOTAS : notasActivas);
    canvasCtx.fillStyle = "rgba(255, 255, 255, 0.9)";
    canvasCtx.font = "bold 38px Segoe UI, Arial";
    canvasCtx.textAlign = "left";
    canvasCtx.fillText(nota.nombre, 20, 50);
    canvasCtx.fillStyle = "rgba(255, 255, 255, 0.55)";
    canvasCtx.font = "14px Segoe UI, Arial";
    canvasCtx.fillText(`${Math.round(freq)} Hz`, 20, 70);
}

function notaPorNombre(nombre) {
    return NOTAS.find(n => n.nombre === nombre);
}

function dibujarLeccion() {
    if (!modoLeccion || !cancionActual) return;

    // Flash de feedback. NO solo color (WCAG 1.4.1): también icono ✓/✗ + texto,
    // para usuarios con daltonismo rojo-verde (~8% de hombres).
    if (ultimoIntento) {
        const dt = performance.now() - ultimoIntento.t;
        if (dt < CFG.FLASH_MS) {
            const acierto = ultimoIntento.tipo === 'acierto';
            const alpha = (1 - dt / CFG.FLASH_MS) * 0.35;
            canvasCtx.fillStyle = acierto ? `rgba(0,255,120,${alpha})` : `rgba(255,60,60,${alpha})`;
            canvasCtx.fillRect(0, 0, canvasElement.width, canvasElement.height);

            const cx = canvasElement.width / 2, cy = canvasElement.height / 2;
            canvasCtx.globalAlpha = Math.max(0, 1 - dt / CFG.FLASH_MS);
            canvasCtx.fillStyle = acierto ? '#00ff78' : '#ff5050';
            canvasCtx.textAlign = 'center';
            canvasCtx.font = 'bold 90px Segoe UI, Arial';
            canvasCtx.fillText(acierto ? '✓' : '✗', cx, cy);
            canvasCtx.font = 'bold 26px Segoe UI, Arial';
            canvasCtx.fillText(ultimoIntento.label || (acierto ? 'Correcto' : 'Incorrecto'), cx, cy + 55);
            canvasCtx.globalAlpha = 1;
        } else {
            ultimoIntento = null;
        }
    }

    if (leccionTerminada) { dibujarResultados(); return; }

    const notaObjetivo = notaPorNombre(cancionActual.notas[indiceNota]);
    if (!notaObjetivo) return;

    const xObj = freqAPixelX(notaObjetivo.freq);
    const yBase = canvasElement.height - 30;

    // Halo verde pulsante en la nota objetivo (estático si el usuario pidió
    // movimiento reducido en su SO — accesibilidad vestibular).
    const pulso = reduceMotion ? 0.9 : 0.55 + 0.45 * Math.sin(performance.now() / 200);
    canvasCtx.strokeStyle = `rgba(0, 255, 120, ${pulso})`;
    canvasCtx.lineWidth = 5;
    canvasCtx.beginPath();
    canvasCtx.moveTo(xObj, 0);
    canvasCtx.lineTo(xObj, yBase);
    canvasCtx.stroke();

    // Zona iluminada (banda vertical translúcida)
    canvasCtx.fillStyle = `rgba(0, 255, 120, ${pulso * 0.15})`;
    canvasCtx.fillRect(xObj - 25, 0, 50, yBase);

    // Etiqueta grande de la nota objetivo
    canvasCtx.fillStyle = '#00ff78';
    canvasCtx.font = 'bold 32px Segoe UI, Arial';
    canvasCtx.textAlign = 'center';
    canvasCtx.fillText(notaObjetivo.nombre, xObj, 35);

    // Nota siguiente (preview)
    if (indiceNota + 1 < cancionActual.notas.length) {
        const siguiente = notaPorNombre(cancionActual.notas[indiceNota + 1]);
        if (siguiente) {
            const xSig = freqAPixelX(siguiente.freq);
            canvasCtx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
            canvasCtx.lineWidth = 2;
            canvasCtx.setLineDash([5, 5]);
            canvasCtx.beginPath();
            canvasCtx.moveTo(xSig, 60);
            canvasCtx.lineTo(xSig, yBase);
            canvasCtx.stroke();
            canvasCtx.setLineDash([]);
            canvasCtx.fillStyle = 'rgba(255, 255, 255, 0.45)';
            canvasCtx.font = '14px Segoe UI, Arial';
            canvasCtx.fillText(`→ ${siguiente.nombre}`, xSig, 60);
        }
    }

    // HUD arriba: progreso + precisión
    const total = cancionActual.notas.length;
    const precision = intentos > 0 ? Math.round(aciertos / intentos * 100) : 100;
    const texto = `${cancionActual.nombre}   |   ${indiceNota}/${total}   |   Precisión: ${precision}%`;
    canvasCtx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    canvasCtx.fillRect(canvasElement.width / 2 - 260, 80, 520, 30);
    canvasCtx.fillStyle = '#ffffff';
    canvasCtx.font = 'bold 14px Segoe UI, Arial';
    canvasCtx.textAlign = 'center';
    canvasCtx.fillText(texto, canvasElement.width / 2, 100);
}

function dibujarResultados() {
    const cx = canvasElement.width / 2;
    const tiempoSeg = ((performance.now() - tiempoInicio) / 1000).toFixed(1);
    const total = cancionActual.notas.length;
    const precision = intentos > 0 ? Math.round(aciertos / intentos * 100) : 100;

    const boxW = 470, boxH = 360, boxX = cx - boxW / 2, boxY = 55;
    canvasCtx.fillStyle = 'rgba(0, 0, 0, 0.9)';
    canvasCtx.fillRect(boxX, boxY, boxW, boxH);
    canvasCtx.strokeStyle = '#00ff78';
    canvasCtx.lineWidth = 3;
    canvasCtx.strokeRect(boxX, boxY, boxW, boxH);

    canvasCtx.fillStyle = '#00ff78';
    canvasCtx.font = 'bold 28px Segoe UI, Arial';
    canvasCtx.textAlign = 'center';
    canvasCtx.fillText('¡Lección Completada!', cx, boxY + 42);

    // Estrellas obtenidas (llenas/vacías) + récord guardado
    let estr = '';
    for (let i = 1; i <= 3; i++) estr += i <= estrellasObtenidas ? '★' : '☆';
    canvasCtx.fillStyle = '#ffc800';
    canvasCtx.font = '40px Segoe UI, Arial';
    canvasCtx.fillText(estr, cx, boxY + 96);
    canvasCtx.fillStyle = '#aaaaaa';
    canvasCtx.font = '12px Segoe UI, Arial';
    canvasCtx.fillText(`Récord de esta canción: ${mejorEstrellas(claveCancionActual)}★`, cx, boxY + 116);

    canvasCtx.fillStyle = '#ffffff';
    canvasCtx.font = '18px Segoe UI, Arial';
    canvasCtx.fillText(`Notas: ${aciertos}/${total}     Intentos: ${intentos}`, cx, boxY + 150);
    canvasCtx.fillText(`Precisión: ${precision}%     Tiempo: ${tiempoSeg}s`, cx, boxY + 178);

    // Heatmap de dificultad: verde = a la primera, amarillo = 1 fallo, rojo = 2+.
    canvasCtx.fillStyle = '#cccccc';
    canvasCtx.font = '12px Segoe UI, Arial';
    canvasCtx.fillText('Dificultad por nota (verde=a la 1ª · rojo=más fallos):', cx, boxY + 212);
    const n = cancionActual.notas.length;
    const cellW = Math.min(26, (boxW - 40) / n);
    const startX = cx - (cellW * n) / 2;
    const cellY = boxY + 224;
    for (let i = 0; i < n; i++) {
        const f = fallosPorNota[i] || 0;
        canvasCtx.fillStyle = f === 0 ? '#1fbf5a' : (f === 1 ? '#d4b106' : '#d4380d');
        canvasCtx.fillRect(startX + i * cellW + 1, cellY, cellW - 2, 22);
        canvasCtx.fillStyle = '#ffffff';
        canvasCtx.font = '9px Segoe UI, Arial';
        canvasCtx.fillText(cancionActual.notas[i].replace(/[0-9]/g, ''), startX + i * cellW + cellW / 2, cellY + 15);
    }

    canvasCtx.fillStyle = '#888888';
    canvasCtx.font = '12px Segoe UI, Arial';
    canvasCtx.fillText('Repite con "Iniciar Lección" · exporta tus métricas con "⬇ CSV"',
        cx, boxY + 295);
}

// --- 4. PROCESAMIENTO DE GESTOS ---
function onResults(results) {
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    
    // Efecto Espejo Video (toggle). Solo se invierte la IMAGEN del video; el
    // texto/HUD se dibuja DESPUÉS del restore(), por eso nunca sale en espejo.
    if (espejo) {
        canvasCtx.translate(canvasElement.width, 0);
        canvasCtx.scale(-1, 1);
    }
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.restore();

    dibujarFondo();
    dibujarEscalaNotas();
    dibujarLeccion();

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        for (const landmarks of results.multiHandLandmarks) {
            const tSec = performance.now() / 1000;
            const indiceTip = landmarks[8];
            const pulgarTip = landmarks[4];
            const meniqueTip = landmarks[20];
            const muneca = landmarks[0];
            const baseMedio = landmarks[9];

            // Posición del índice suavizada con One Euro Filter (quita el jitter sin
            // añadir lag). De aquí salen el pitch (X) y el timbre (Y).
            const xRaw = espejo ? (1 - indiceTip.x) : indiceTip.x;
            const xCoordinada = oefX.filter(xRaw, tSec);
            const yCoordinada = oefY.filter(indiceTip.y, tSec);

            const aperturaVolumen = Math.hypot(pulgarTip.x - meniqueTip.x, pulgarTip.y - meniqueTip.y);
            const { freq, freqFiltro, volDb } = mapearAControl(xCoordinada, yCoordinada, aperturaVolumen);

            // Pinza: distancia índice-pulgar NORMALIZADA por el tamaño de la palma
            // (muñeca→nudillo medio) para que el umbral no dependa de qué tan cerca
            // esté la mano de la cámara. Con histéresis (cerrar/abrir distintos).
            const escalaMano = Math.max(0.001, Math.hypot(muneca.x - baseMedio.x, muneca.y - baseMedio.y));
            const ratioPinza = Math.hypot(indiceTip.x - pulgarTip.x, indiceTip.y - pulgarTip.y) / escalaMano;
            if (pinzaActiva) {
                if (ratioPinza > CFG.PINZA_ABRIR) pinzaActiva = false;
            } else if (ratioPinza < CFG.PINZA_CERRAR) {
                pinzaActiva = true;
            }
            const hayPinza = pinzaActiva;

            // Actualizar mi audio (la factory decide si es continuo o sampleado)
            const sonar = hayPinza && audioIniciado;
            miInstrumento.actualizar(freq, freqFiltro, volDb, sonar);
            estaPinchando = sonar;

            // --- Detección de pasos del tutorial ---
            if (tutorialActivo) {
                if (sonar) {
                    marcarPaso(2);
                    if (xInicioPinch === null) xInicioPinch = xCoordinada;
                    else if (Math.abs(xCoordinada - xInicioPinch) > 0.2) marcarPaso(3);
                } else {
                    xInicioPinch = null;
                }
                if (aperturaVolumen > 0.25) marcarPaso(4);
            }

            // --- Detección de aciertos en modo lección ---
            // Cada "evento de pinza" cuenta como UN intento. Acierte o falle,
            // debe soltar antes de volver a intentar.
            if (modoLeccion && cancionActual && !leccionTerminada) {
                if (sonar && !esperandoSoltar) {
                    const notaTocada = notaMasCercana(freq, NOTAS).nombre;
                    const notaObjetivo = cancionActual.notas[indiceNota];
                    intentos++;
                    intentosNotaActual++;
                    if (notaTocada === notaObjetivo) {
                        aciertos++;
                        // Feedback útil (no solo binario): premia acertar a la primera.
                        const label = intentosNotaActual === 1 ? '¡A la primera!' : '¡Bien!';
                        ultimoIntento = { tipo: 'acierto', t: performance.now(), label };
                        indiceNota++;
                        intentosNotaActual = 0;
                        if (indiceNota >= cancionActual.notas.length) {
                            leccionTerminada = true;
                            finalizarMetricasLeccion();
                        }
                    } else {
                        if (fallosPorNota[indiceNota] !== undefined) fallosPorNota[indiceNota]++;
                        ultimoIntento = { tipo: 'fallo', t: performance.now(), label: 'Reintenta' };
                    }
                    esperandoSoltar = true;
                } else if (!sonar && esperandoSoltar) {
                    esperandoSoltar = false;
                }
            }

            // EMITIR DATOS AL SERVIDOR (throttle ~20fps para no saturar la red)
            if (modoGrupal) {
                const ahora = performance.now();
                if (ahora - ultimaEmision >= INTERVALO_EMISION_MS && socket) {
                    ultimaEmision = ahora;
                    socket.emit('datos_theremin', {
                        id: socket.id,
                        x: xCoordinada,
                        y: yCoordinada,
                        apertura: aperturaVolumen,
                        pinch: hayPinza,
                        instrumento: tipoInstrumentoActual
                    });
                }
            }

            // Dibujar mi propio cursor (Verde/Rojo)
            const drawX = xCoordinada * canvasElement.width;
            const drawY = yCoordinada * canvasElement.height;
            canvasCtx.beginPath();
            canvasCtx.arc(drawX, drawY, 20 + (aperturaVolumen * 30), 0, 2 * Math.PI);
            canvasCtx.fillStyle = estaPinchando ? "rgba(0, 255, 0, 0.25)" : "rgba(233, 69, 96, 0.15)";
            canvasCtx.fill();
            
            canvasCtx.fillStyle = "white";
            canvasCtx.beginPath();
            canvasCtx.arc(drawX, drawY, 5, 0, 2 * Math.PI);
            canvasCtx.fill();

            // Mostrar la nota que se está tocando cuando hay pinza
            if (estaPinchando && audioIniciado) {
                dibujarNotaActual(freq);
            }
        }
    } else {
        // Sin mano: silenciar, soltar pinza y reiniciar los filtros para que al
        // recuperar el tracking no haya un salto brusco de posición.
        // (Salvo que se esté tocando con el teclado, que es el fallback sin cámara.)
        if (audioIniciado && !teclaActiva) miInstrumento.silenciar(0.3);
        estaPinchando = false;
        pinzaActiva = false;
        oefX.xPrev = oefX.tPrev = null;
        oefY.xPrev = oefY.tPrev = null;
    }

    // --- DIBUJAR COMPAÑEROS DE SALA ---
    if (modoGrupal) {
        Object.values(companeros).forEach(comp => {
            const drawX = comp.x * canvasElement.width;
            const drawY = comp.y * canvasElement.height;
            
            canvasCtx.beginPath();
            canvasCtx.arc(drawX, drawY, 20 + (comp.apertura * 30), 0, 2 * Math.PI);
            // El color azul indicará que es un cursor remoto
            canvasCtx.fillStyle = comp.pinch ? "rgba(0, 150, 255, 0.4)" : "rgba(100, 100, 100, 0.2)";
            canvasCtx.fill();
            
            canvasCtx.fillStyle = "#0096ff";
            canvasCtx.beginPath();
            canvasCtx.arc(drawX, drawY, 5, 0, 2 * Math.PI);
            canvasCtx.fill();

            // Etiqueta del instrumento del compañero
            if (comp.instrumento) {
                canvasCtx.fillStyle = "rgba(255, 255, 255, 0.85)";
                canvasCtx.font = "bold 12px Segoe UI, Arial";
                canvasCtx.textAlign = "center";
                canvasCtx.fillText(comp.instrumento.toUpperCase(), drawX, drawY - 30);
            }
        });
    }
}

function marcarPaso(num) {
    if (!tutorialActivo || pasosTutorial[num]) return;
    pasosTutorial[num] = true;
    const el = document.getElementById('tut-paso-' + num);
    if (el) el.classList.add('completado');
    if (Object.values(pasosTutorial).every(p => p)) {
        setTimeout(cerrarTutorial, 1500);
    }
}

// --- MODO LECCIÓN (Sigue la nota) ---
const CANCIONES = {
    twinkle: {
        nombre: 'Estrellita (Twinkle Twinkle)',
        notas: ['C4','C4','G4','G4','A4','A4','G4','F4','F4','E4','E4','D4','D4','C4']
    },
    mary: {
        nombre: 'Mary Had a Little Lamb',
        notas: ['E4','D4','C4','D4','E4','E4','E4','D4','D4','D4','E4','G4','G4']
    },
    alegria: {
        nombre: 'Himno a la Alegría',
        notas: ['E4','E4','F4','G4','G4','F4','E4','D4','C4','C4','D4','E4','E4','D4','D4']
    },
    cumpleanos: {
        nombre: 'Cumpleaños Feliz',
        notas: ['C4','C4','D4','C4','F4','E4','C4','C4','D4','C4','G4','F4']
    }
};

let modoLeccion = false;
let cancionActual = null;
let claveCancionActual = null;
let indiceNota = 0;
let aciertos = 0;
let intentos = 0;
let intentosNotaActual = 0;   // intentos en la nota objetivo actual (→ "a la primera")
let fallosPorNota = [];       // fallos acumulados por índice de nota (→ heatmap)
let estrellasObtenidas = 0;
let tiempoInicio = 0;
let esperandoSoltar = false; // tras acierto, hay que soltar pinza antes del siguiente
let leccionTerminada = false;
let metricasFinalizadas = false;
let ultimoIntento = null; // { tipo: 'acierto'|'fallo', t, label }

function iniciarLeccion(claveCancion) {
    cancionActual = CANCIONES[claveCancion];
    if (!cancionActual) return;
    claveCancionActual = claveCancion;
    modoLeccion = true;
    indiceNota = 0;
    aciertos = 0;
    intentos = 0;
    intentosNotaActual = 0;
    fallosPorNota = new Array(cancionActual.notas.length).fill(0);
    estrellasObtenidas = 0;
    esperandoSoltar = false;
    leccionTerminada = false;
    metricasFinalizadas = false;
    tiempoInicio = performance.now();
    leccionBtn.innerText = '✖ Terminar Lección';
    leccionBtn.classList.add('activo');
}

// Estrellas estilo Synthesia/Yousician: da un objetivo concreto para repetir.
function calcularEstrellas(precision) {
    if (precision > 85) return 3;
    if (precision >= 60) return 2;
    return 1;
}

// Mejor resultado por canción, persistido en localStorage.
function mejorEstrellas(clave) {
    return Number(localStorage.getItem('air_estrellas_' + clave) || 0);
}

// Acumula la métrica de la sesión (para evaluación de usabilidad IHC) y la guarda.
function finalizarMetricasLeccion() {
    if (metricasFinalizadas) return;
    metricasFinalizadas = true;
    const total = cancionActual.notas.length;
    const precision = intentos > 0 ? Math.round(aciertos / intentos * 100) : 100;
    const tiempoSeg = Number(((performance.now() - tiempoInicio) / 1000).toFixed(1));
    estrellasObtenidas = calcularEstrellas(precision);

    // Récord de estrellas por canción
    const clave = claveCancionActual;
    if (estrellasObtenidas > mejorEstrellas(clave)) {
        localStorage.setItem('air_estrellas_' + clave, String(estrellasObtenidas));
    }

    // Registro de métricas (exportable a CSV para el estudio de usuarios IHC)
    const registro = {
        ts: new Date().toISOString(),
        cancion: clave,
        notas_total: total,
        aciertos,
        intentos,
        precision,
        estrellas: estrellasObtenidas,
        tiempo_s: tiempoSeg,
        instrumento: tipoInstrumentoActual,
        escala: escalaActiva,
    };
    const hist = JSON.parse(localStorage.getItem('air_metricas') || '[]');
    hist.push(registro);
    localStorage.setItem('air_metricas', JSON.stringify(hist));

    // Pregunta de facilidad percibida (SEQ) tras un breve respiro
    setTimeout(mostrarSEQ, 700);
}

function terminarLeccion() {
    modoLeccion = false;
    cancionActual = null;
    leccionTerminada = false;
    leccionBtn.innerText = '🎓 Iniciar Lección';
    leccionBtn.classList.remove('activo');
}

leccionBtn.onclick = async () => {
    if (modoLeccion) {
        terminarLeccion();
        return;
    }
    // Auto-encender el audio si no estaba (el click cuenta como user gesture)
    const ok = await encenderAudio();
    if (!ok) return;
    iniciarLeccion(cancionSel.value);
};

cancionSel.onchange = () => {
    if (modoLeccion) iniciarLeccion(cancionSel.value); // reinicia si está en lección
};

// === MODO TECLADO (accesibilidad / fallback sin cámara) ===
// Teclas 1..7 disparan las notas de la escala activa. Sirve a usuarios con
// movilidad reducida en brazos y como respaldo si la cámara no está disponible.
const MAPA_TECLAS = { '1': 0, '2': 1, '3': 2, '4': 3, '5': 4, '6': 5, '7': 6 };
const teclasPresionadas = new Set();
let teclaActiva = false;
const FILTRO_MEDIO = CFG.FILTRO_MIN + CFG.FILTRO_SPAN * 0.5;

function notaDeTecla(key) {
    const lista = notasActivas.length ? notasActivas : NOTAS;
    return lista[MAPA_TECLAS[key] % lista.length];
}

window.addEventListener('keydown', async (e) => {
    if (!(e.key in MAPA_TECLAS) || e.repeat) return;
    const ok = await encenderAudio();
    if (!ok) return;
    const nota = notaDeTecla(e.key);
    if (!nota) return;
    teclasPresionadas.add(e.key);
    teclaActiva = true;
    miInstrumento.actualizar(nota.freq, FILTRO_MEDIO, -8, true);
});

window.addEventListener('keyup', (e) => {
    if (!(e.key in MAPA_TECLAS)) return;
    teclasPresionadas.delete(e.key);
    if (teclasPresionadas.size === 0) {
        teclaActiva = false;
        miInstrumento.silenciar(0.1);
    } else {
        const ultima = [...teclasPresionadas].pop();
        const nota = notaDeTecla(ultima);
        if (nota) miInstrumento.actualizar(nota.freq, FILTRO_MEDIO, -8, true);
    }
});

// === SEQ (Single Ease Question): métrica de usabilidad IHC post-lección ===
function mostrarSEQ() {
    if (document.getElementById('seqOverlay')) return;
    const ov = document.createElement('div');
    ov.id = 'seqOverlay';
    ov.className = 'seq-overlay';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-label', 'Pregunta de facilidad de uso');

    const box = document.createElement('div');
    box.className = 'seq-box';
    box.innerHTML = '<p class="seq-q">¿Qué tan fácil te resultó esta lección?</p>';

    const fila = document.createElement('div');
    fila.className = 'seq-row';
    for (let i = 1; i <= 7; i++) {
        const b = document.createElement('button');
        b.textContent = i;
        b.setAttribute('aria-label', `Facilidad ${i} de 7`);
        b.onclick = () => { guardarSEQ(i); ov.remove(); };
        fila.appendChild(b);
    }
    box.appendChild(fila);
    box.insertAdjacentHTML('beforeend',
        '<div class="seq-legend"><span>1 = Muy difícil</span><span>7 = Muy fácil</span></div>');

    const skip = document.createElement('button');
    skip.textContent = 'Omitir';
    skip.className = 'seq-skip';
    skip.onclick = () => ov.remove();
    box.appendChild(skip);

    ov.appendChild(box);
    document.body.appendChild(ov);
}

function guardarSEQ(valor) {
    const hist = JSON.parse(localStorage.getItem('air_seq') || '[]');
    hist.push({ ts: new Date().toISOString(), cancion: claveCancionActual, seq: valor });
    localStorage.setItem('air_seq', JSON.stringify(hist));
}

// === EXPORTAR MÉTRICAS A CSV (para el estudio de usuarios del curso IHC) ===
function exportarCSV() {
    const hist = JSON.parse(localStorage.getItem('air_metricas') || '[]');
    if (!hist.length) {
        alert('Aún no hay métricas. Completa al menos una lección primero.');
        return;
    }
    const cols = ['ts', 'cancion', 'notas_total', 'aciertos', 'intentos', 'precision', 'estrellas', 'tiempo_s', 'instrumento', 'escala'];
    const lineas = [cols.join(',')];
    hist.forEach(r => lineas.push(cols.map(c => JSON.stringify(r[c] ?? '')).join(',')));

    const seqs = JSON.parse(localStorage.getItem('air_seq') || '[]');
    if (seqs.length) {
        lineas.push('', 'seq_ts,seq_cancion,seq_valor');
        seqs.forEach(s => lineas.push([s.ts, s.cancion, s.seq].map(v => JSON.stringify(v ?? '')).join(',')));
    }

    const blob = new Blob([lineas.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'airtheremin_metricas.csv';
    a.click();
    URL.revokeObjectURL(url);
}

const csvBtn = document.getElementById('csvBtn');
if (csvBtn) csvBtn.onclick = exportarCSV;

const hands = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
});
hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.7, minTrackingConfidence: 0.7 });
hands.onResults(onResults);

const camera = new Camera(videoElement, {
    onFrame: async () => { await hands.send({image: videoElement}); },
    width: 800, height: 500
});
camera.start();