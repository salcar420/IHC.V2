/**
 * AirTheremin V5 - Colaborativo con WebSockets
 * MVP Proyecto 7: Hasta 3 usuarios en tiempo real
 */

const videoElement = document.getElementById('input_video');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement.getContext('2d');
const startBtn = document.getElementById('startBtn');
const modeBtn = document.getElementById('modeBtn');

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

    // Si el compañero no tiene un sintetizador creado, se lo fabricamos
    if (!sintetizadoresRemotos[datos.id]) {
        sintetizadoresRemotos[datos.id] = new Tone.Oscillator(440, "sine").toDestination();
        const filtroRemoto = new Tone.Filter(800, "lowpass").connect(Tone.Destination);
        sintetizadoresRemotos[datos.id].connect(filtroRemoto);
        sintetizadoresRemotos[datos.id].filtro = filtroRemoto;
        sintetizadoresRemotos[datos.id].volume.value = -Infinity;
        sintetizadoresRemotos[datos.id].start();
    }

    // Actualizamos el sonido del compañero con sus coordenadas
    const synth = sintetizadoresRemotos[datos.id];
    const freq = datos.x * 770 + 130;
    const freqFiltro = (1 - datos.y) * 3500 + 200;
    const volDb = Tone.gainToDb(Math.min(0.5, datos.apertura * 1.8)) - 15;

    synth.frequency.rampTo(freq, 0.1);
    synth.filtro.frequency.rampTo(freqFiltro, 0.1);

    if (datos.pinch) {
        synth.volume.rampTo(volDb, 0.05);
    } else {
        synth.volume.rampTo(-Infinity, 0.15);
    }
});

// Escuchar cuando alguien se va para borrar su fantasma
socket.on('usuario_desconectado', (id) => {
    // 1. Apagar y liberar la memoria del sintetizador remoto
    if (sintetizadoresRemotos[id]) {
        sintetizadoresRemotos[id].volume.rampTo(-Infinity, 0.1);
        setTimeout(() => {
            sintetizadoresRemotos[id].stop();
            sintetizadoresRemotos[id].dispose(); // Elimina el oscilador
            sintetizadoresRemotos[id].filtro.dispose(); // Elimina el filtro
            delete sintetizadoresRemotos[id];
        }, 200); // Damos 200ms para que el volumen baje suavemente
    }
    
    // 2. Borrar su rastro visual del canvas
    delete companeros[id];
});

// --- 2. CONFIGURACIÓN DE AUDIO LOCAL Y BOTONES ---
let audioIniciado = false;
let estaPinchando = false;

const miOscilador = new Tone.Oscillator(440, "sine").toDestination();
const miFiltro = new Tone.Filter(800, "lowpass").connect(Tone.Destination);
miOscilador.connect(miFiltro);
miOscilador.volume.value = -Infinity; 

// ARREGLO: Lógica Toggle (Encender/Apagar)
startBtn.onclick = async () => {
    if (!audioIniciado) {
        await Tone.start();
        miOscilador.start();
        audioIniciado = true;
        startBtn.innerText = "Instrumento: ENCENDIDO (Click para pausar)";
        startBtn.style.background = "#e94560"; // Rojo activo
    } else {
        // Pausamos
        audioIniciado = false;
        miOscilador.volume.rampTo(-Infinity, 0.1);
        startBtn.innerText = "Instrumento: PAUSADO (Click para reanudar)";
        startBtn.style.background = "#0f3460"; // Azul inactivo
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
            if (sintetizadoresRemotos[id]) {
                sintetizadoresRemotos[id].volume.rampTo(-Infinity, 0.1);
                setTimeout(() => {
                    sintetizadoresRemotos[id].stop();
                    sintetizadoresRemotos[id].dispose();
                    sintetizadoresRemotos[id].filtro.dispose();
                    delete sintetizadoresRemotos[id];
                }, 200);
            }
        });
        // Vaciamos el diccionario visual
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

            // Actualizar mi audio
            miOscilador.frequency.rampTo(freq, 0.1);
            miFiltro.frequency.rampTo(freqFiltro, 0.1);

            if (hayPinza && audioIniciado) {
                miOscilador.volume.rampTo(volDb, 0.05);
                estaPinchando = true;
            } else {
                miOscilador.volume.rampTo(-Infinity, 0.15); 
                estaPinchando = false;
            }

            // EMITIR DATOS AL SERVIDOR (Si estamos en modo grupal)
            if (modoGrupal) {
                socket.emit('datos_theremin', {
                    id: socket.id,
                    x: xCoordinada,
                    y: indiceTip.y,
                    apertura: aperturaVolumen,
                    pinch: hayPinza
                });
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
        }
    } else {
        if (audioIniciado) miOscilador.volume.rampTo(-Infinity, 0.3);
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
        });
    }
}

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