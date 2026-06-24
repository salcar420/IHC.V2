/**
 * Servidor Backend - Proyecto 7
 * Maneja archivos estáticos y WebSockets para la sala colaborativa (Max 3 usuarios)
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// 1. Exponer la carpeta 'public' al navegador
app.use(express.static('public'));

// Health endpoint para verificar el servidor con un curl antes de exponer/tunelizar
app.get('/health', (req, res) => {
    const enSala = io.sockets.adapter.rooms.get(NOMBRE_SALA)?.size || 0;
    res.json({ ok: true, enSala, max: 3, uptime: process.uptime() });
});

const NOMBRE_SALA = 'sala_principal';

// Acota un número al rango [min, max]; descarta no-numéricos.
const clamp = (n, min, max) => {
    const v = Number(n);
    return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : min;
};

// 2. Lógica de WebSockets (Tiempo real)
io.on('connection', (socket) => {
    console.log('🟢 Usuario conectado a la web (Modo Solo por defecto):', socket.id);

    // NUEVO EVENTO: El usuario pide entrar a la sala grupal
    socket.on('unirse_sala', () => {
        const clientesEnSala = io.sockets.adapter.rooms.get(NOMBRE_SALA)?.size || 0;

        if (clientesEnSala >= 3) {
            socket.emit('sala_llena', 'La sala ya tiene 3 usuarios conectados.');
            return;
        }

        socket.join(NOMBRE_SALA);
        console.log(`👥 ${socket.id} ingresó a la sala. Total: ${clientesEnSala + 1}/3`);
        socket.emit('ingreso_exitoso');
    });

    // NUEVO EVENTO: El usuario decide volver al Modo Solo
    socket.on('salir_sala', () => {
        socket.leave(NOMBRE_SALA);
        // Avisamos a los demás que se fue
        socket.to(NOMBRE_SALA).emit('usuario_desconectado', socket.id);
        console.log(`👤 ${socket.id} regresó al Modo Solo.`);
    });

    socket.on('datos_theremin', (datos) => {
        // No retransmitir si el emisor no está realmente en la sala
        if (!socket.rooms.has(NOMBRE_SALA) || !datos) return;
        // El id lo pone el SERVIDOR (no se confía en el cliente, evita suplantación)
        // y los valores se acotan/sanitizan antes de reenviar.
        socket.to(NOMBRE_SALA).emit('datos_companeros', {
            id: socket.id,
            x: clamp(datos.x, 0, 1),
            y: clamp(datos.y, 0, 1),
            apertura: clamp(datos.apertura, 0, 1),
            pinch: !!datos.pinch,
            instrumento: String(datos.instrumento || 'theremin').slice(0, 20)
        });
    });

    socket.on('disconnect', () => {
        console.log('🔴 Usuario cerró la pestaña:', socket.id);
        socket.to(NOMBRE_SALA).emit('usuario_desconectado', socket.id);
    });
});

// 5. Iniciar el servidor
const PUERTO = process.env.PORT || 3000;
server.listen(PUERTO, () => {
    console.log(`🚀 Servidor activo en http://localhost:${PUERTO}`);
    console.log(`Presiona Ctrl + C en esta terminal para detenerlo.`);
});