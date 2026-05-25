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

// --- 1. CONFIGURACIÓN DE RED (SOCKET.IO) ---
const socket = io(); // Llama al servidor Node.js
let modoGrupal = false;
const companeros = {}; // Guarda los datos visuales de los otros usuarios
const sintetizadoresRemotos = {}; // Guarda los Theremins de los demás

// Escuchar si la sala ya está llena (Requisito: Máximo 3)
socket.on('sala_llena', (mensaje) => {
    alert(mensaje);
    modoGrupal = false;
    modeBtn.innerText = "Modo: SOLO";
});

// Escuchar los movimientos de los demás
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
    const freq = datos.x * 770 + 130;
    const freqFiltro = (1 - datos.y) * 3500 + 200;
    const volDb = Tone.gainToDb(Math.min(0.5, datos.apertura * 1.8)) - 15;

    inst.actualizar(freq, freqFiltro, volDb, datos.pinch);
});

// Escuchar cuando alguien se va para borrar su fantasma
socket.on('usuario_desconectado', (id) => {
    const inst = sintetizadoresRemotos[id];
    if (inst) {
        inst.silenciar(0.1);
        setTimeout(() => inst.dispose(), 200);
        delete sintetizadoresRemotos[id];
    }
    delete companeros[id];
});

// --- 2. CONFIGURACIÓN DE AUDIO LOCAL Y BOTONES ---
let audioIniciado = false;
let estaPinchando = false;

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
        onload: () => { obj.listo = true; }
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
    return ((freq - 130) / 770) * canvasElement.width;
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

// ARREGLO: Lógica Toggle (Encender/Apagar)
startBtn.onclick = async () => {
    if (!audioIniciado) {
        await Tone.start();
        miInstrumento.iniciar();
        audioIniciado = true;
        startBtn.innerText = "Instrumento: ENCENDIDO (Click para pausar)";
        startBtn.style.background = "#e94560"; // Rojo activo
        marcarPaso(1);
    } else {
        // Pausamos
        audioIniciado = false;
        miInstrumento.silenciar(0.1);
        startBtn.innerText = "Instrumento: PAUSADO (Click para reanudar)";
        startBtn.style.background = "#0f3460"; // Azul inactivo
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
            if (ref.listo || miInstrumento !== ref) {
                instrumentoSel.style.opacity = '1';
                clearInterval(reloj);
            }
        }, 120);
    }
};

// ARREGLO: Lógica de Sala (Solicitar unirse o salir)
modeBtn.onclick = () => {
    modoGrupal = !modoGrupal;
    
    if (modoGrupal) {
        // Al activar, pedimos permiso para entrar
        socket.emit('unirse_sala');
        modeBtn.innerText = "Modo: GRUPAL";
        modeBtn.style.background = "#e94560";
    } else {
        // Al desactivar, le avisamos al servidor que salimos de la sala
        socket.emit('salir_sala');
        modeBtn.innerText = "Modo: SOLO";
        modeBtn.style.background = "#28a745";
        
        // Limpiamos los "fantasmas" locales inmediatamente
        Object.keys(companeros).forEach(id => {
            const inst = sintetizadoresRemotos[id];
            if (inst) {
                inst.silenciar(0.1);
                setTimeout(() => inst.dispose(), 200);
                delete sintetizadoresRemotos[id];
            }
        });
        for (let prop in companeros) { delete companeros[prop]; }
    }
};

// --- 3. INTERFAZ VISUAL ---
function dibujarFondo() {
    canvasCtx.strokeStyle = "rgba(233, 69, 96, 0.1)";
    canvasCtx.lineWidth = 1;
    for(let i=0; i<canvasElement.width; i+=50) {
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
    const nota = notaMasCercana(freq);
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

    // Flash de feedback (acierto verde / fallo rojo), se desvanece en 400ms
    if (ultimoIntento) {
        const dt = performance.now() - ultimoIntento.t;
        if (dt < 400) {
            const alpha = (1 - dt / 400) * 0.35;
            canvasCtx.fillStyle = ultimoIntento.tipo === 'acierto'
                ? `rgba(0, 255, 120, ${alpha})`
                : `rgba(255, 60, 60, ${alpha})`;
            canvasCtx.fillRect(0, 0, canvasElement.width, canvasElement.height);
        } else {
            ultimoIntento = null;
        }
    }

    if (leccionTerminada) { dibujarResultados(); return; }

    const notaObjetivo = notaPorNombre(cancionActual.notas[indiceNota]);
    if (!notaObjetivo) return;

    const xObj = freqAPixelX(notaObjetivo.freq);
    const yBase = canvasElement.height - 30;

    // Halo verde pulsante en la nota objetivo
    const pulso = 0.55 + 0.45 * Math.sin(performance.now() / 200);
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
    const tiempoSeg = ((performance.now() - tiempoInicio) / 1000).toFixed(1);
    const total = cancionActual.notas.length;
    const precision = intentos > 0 ? Math.round(aciertos / intentos * 100) : 100;

    canvasCtx.fillStyle = 'rgba(0, 0, 0, 0.88)';
    canvasCtx.fillRect(canvasElement.width / 2 - 220, 80, 440, 280);
    canvasCtx.strokeStyle = '#00ff78';
    canvasCtx.lineWidth = 3;
    canvasCtx.strokeRect(canvasElement.width / 2 - 220, 80, 440, 280);

    canvasCtx.fillStyle = '#00ff78';
    canvasCtx.font = 'bold 30px Segoe UI, Arial';
    canvasCtx.textAlign = 'center';
    canvasCtx.fillText('¡Lección Completada!', canvasElement.width / 2, 135);

    canvasCtx.fillStyle = '#ffffff';
    canvasCtx.font = '20px Segoe UI, Arial';
    canvasCtx.fillText(`Notas: ${aciertos}/${total}`, canvasElement.width / 2, 185);
    canvasCtx.fillText(`Intentos totales: ${intentos}`, canvasElement.width / 2, 215);
    canvasCtx.fillText(`Precisión: ${precision}%`, canvasElement.width / 2, 245);
    canvasCtx.fillText(`Tiempo: ${tiempoSeg}s`, canvasElement.width / 2, 275);

    canvasCtx.fillStyle = '#aaaaaa';
    canvasCtx.font = '13px Segoe UI, Arial';
    canvasCtx.fillText('Pulsa "Iniciar Lección" para repetir o elige otra canción',
        canvasElement.width / 2, 325);
}

// --- 4. PROCESAMIENTO DE GESTOS ---
function onResults(results) {
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    
    // Efecto Espejo Video
    canvasCtx.translate(canvasElement.width, 0);
    canvasCtx.scale(-1, 1);
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.restore(); 

    dibujarFondo();
    dibujarEscalaNotas();
    dibujarLeccion();

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        for (const landmarks of results.multiHandLandmarks) {
            const indiceTip = landmarks[8];
            const pulgarTip = landmarks[4];
            const meñiqueTip = landmarks[20];

            const xCoordinada = (1 - indiceTip.x);
            const freq = xCoordinada * 770 + 130;
            const freqFiltro = (1 - indiceTip.y) * 3500 + 200;
            const aperturaVolumen = Math.hypot(pulgarTip.x - meñiqueTip.x, pulgarTip.y - meñiqueTip.y);
            const volDb = Tone.gainToDb(Math.min(0.5, aperturaVolumen * 1.8)) - 15;
            const distanciaPinza = Math.hypot(indiceTip.x - pulgarTip.x, indiceTip.y - pulgarTip.y);
            const hayPinza = distanciaPinza < 0.05; 

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
                    if (notaTocada === notaObjetivo) {
                        aciertos++;
                        indiceNota++;
                        ultimoIntento = { tipo: 'acierto', t: performance.now() };
                        if (indiceNota >= cancionActual.notas.length) {
                            leccionTerminada = true;
                        }
                    } else {
                        ultimoIntento = { tipo: 'fallo', t: performance.now() };
                    }
                    esperandoSoltar = true;
                } else if (!sonar && esperandoSoltar) {
                    esperandoSoltar = false;
                }
            }

            // EMITIR DATOS AL SERVIDOR (throttle ~20fps para no saturar la red)
            if (modoGrupal) {
                const ahora = performance.now();
                if (ahora - ultimaEmision >= INTERVALO_EMISION_MS) {
                    ultimaEmision = ahora;
                    socket.emit('datos_theremin', {
                        id: socket.id,
                        x: xCoordinada,
                        y: indiceTip.y,
                        apertura: aperturaVolumen,
                        pinch: hayPinza,
                        instrumento: tipoInstrumentoActual
                    });
                }
            }

            // Dibujar mi propio cursor (Verde/Rojo)
            const drawX = xCoordinada * canvasElement.width;
            const drawY = indiceTip.y * canvasElement.height;
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
        if (audioIniciado) miInstrumento.silenciar(0.3);
        estaPinchando = false;
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

// --- TUTORIAL ONBOARDING ---
const pasosTutorial = { 1: false, 2: false, 3: false, 4: false };
let xInicioPinch = null;
let tutorialActivo = true;

function marcarPaso(num) {
    if (!tutorialActivo || pasosTutorial[num]) return;
    pasosTutorial[num] = true;
    const el = document.getElementById('tut-paso-' + num);
    if (el) el.classList.add('completado');
    if (Object.values(pasosTutorial).every(p => p)) {
        setTimeout(cerrarTutorial, 1500);
    }
}

function cerrarTutorial() {
    tutorialActivo = false;
    tutorialEl.style.transition = 'opacity 0.6s';
    tutorialEl.style.opacity = '0';
    setTimeout(() => { tutorialEl.style.display = 'none'; }, 600);
}

tutorialSkip.onclick = cerrarTutorial;

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
let indiceNota = 0;
let aciertos = 0;
let intentos = 0;
let tiempoInicio = 0;
let esperandoSoltar = false; // tras acierto, hay que soltar pinza antes del siguiente
let leccionTerminada = false;
let ultimoIntento = null; // { tipo: 'acierto'|'fallo', t: timestamp }

function iniciarLeccion(claveCancion) {
    cancionActual = CANCIONES[claveCancion];
    if (!cancionActual) return;
    modoLeccion = true;
    indiceNota = 0;
    aciertos = 0;
    intentos = 0;
    esperandoSoltar = false;
    leccionTerminada = false;
    tiempoInicio = performance.now();
    leccionBtn.innerText = '✖ Terminar Lección';
    leccionBtn.classList.add('activo');
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
    if (!audioIniciado) {
        await Tone.start();
        miInstrumento.iniciar();
        audioIniciado = true;
        startBtn.innerText = "Instrumento: ENCENDIDO (Click para pausar)";
        startBtn.style.background = "#e94560";
        marcarPaso(1);
    }
    iniciarLeccion(cancionSel.value);
};

cancionSel.onchange = () => {
    if (modoLeccion) iniciarLeccion(cancionSel.value); // reinicia si está en lección
};

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