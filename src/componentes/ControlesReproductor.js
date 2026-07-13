// ControlesReproductor.js — "Los botones del reproductor"
// Único trabajo: que Play, Pausa y Reset funcionen y avancen el timeline.
// No sabe qué son los "puntos" que reproduce, ni cómo se dibujan en el mapa.

/**
 * Conecta los botones del DOM (play/pausa/reset + interruptor de recorrido
 * completo + barra de progreso) y expone funciones para actualizar su
 * estado visual. La lógica de qué pasa al interactuar la decide quien llama.
 * @param {{onPlay:Function, onPause:Function, onReset:Function, onToggleRecorridoCompleto:Function, onSeek:Function}} callbacks
 */
export function inicializarControlesReproductor({ onPlay, onPause, onReset, onToggleRecorridoCompleto, onSeek }) {
    const btnPlay = document.getElementById('btn-play');
    const btnPausa = document.getElementById('btn-pausa');
    const btnReset = document.getElementById('btn-reset');
    const btnToggle = document.getElementById('btn-toggle-recorrido');
    const barraProgreso = document.getElementById('barra-progreso');
    const tiempoActualEl = document.getElementById('tiempo-actual-barra');
    const tiempoTotalEl = document.getElementById('tiempo-total-barra');

    btnPlay.addEventListener('click', onPlay);
    btnPausa.addEventListener('click', onPause);
    btnReset.addEventListener('click', onReset);
    btnToggle.addEventListener('click', onToggleRecorridoCompleto);
    barraProgreso.addEventListener('input', () => onSeek(parseInt(barraProgreso.value, 10)));

    return {
        habilitar() {
            btnPlay.disabled = false;
            btnPausa.disabled = true;
            btnReset.disabled = false;
            btnToggle.disabled = false;
            barraProgreso.disabled = false;
        },
        deshabilitar() {
            btnPlay.disabled = true;
            btnPausa.disabled = true;
            btnReset.disabled = true;
            btnToggle.disabled = true;
            barraProgreso.disabled = true;
        },
        marcarReproduciendo() {
            btnPlay.disabled = true;
            btnPausa.disabled = false;
        },
        marcarPausado() {
            btnPlay.disabled = false;
            btnPausa.disabled = true;
        },
        /** Refleja visualmente si el interruptor de recorrido completo está activo. */
        marcarRecorridoCompleto(activo) {
            btnToggle.classList.toggle('activo', activo);
            btnToggle.innerText = activo ? '👁 Recorrido: ON' : '👁 Recorrido: OFF';
        },
        /** Fija el rango de la barra de progreso para una ruta nueva (se llama al cargar un archivo). */
        configurarRango(totalPuntos) {
            barraProgreso.min = 0;
            barraProgreso.max = Math.max(totalPuntos - 1, 0);
            barraProgreso.value = 0;
        },
        /** Mueve el slider y actualiza las etiquetas de tiempo, sin disparar onSeek. */
        actualizarProgreso(indice, tiempoActualFormateado, tiempoTotalFormateado) {
            barraProgreso.value = indice;
            tiempoActualEl.innerText = tiempoActualFormateado;
            tiempoTotalEl.innerText = tiempoTotalFormateado;
        }
    };
}

/**
 * Motor de reproducción: avanza por la lista de puntos a intervalos regulares
 * y llama a onFrame con cada punto. No sabe qué hace onFrame con ese punto.
 * @param {{puntos:Array, intervaloMs?:number, pasoFrames?:number, onFrame:Function, onFin?:Function}} opciones
 */
export function crearMotorReproduccion({ puntos, intervaloMs = 50, pasoFrames = 2, onFrame, onFin }) {
    let indiceActual = 0;
    let intervalId = null;

    function play() {
        if (intervalId !== null) return; // ya en marcha
        intervalId = setInterval(() => {
            if (indiceActual >= puntos.length) {
                pause();
                if (onFin) onFin();
                return;
            }
            onFrame(puntos[indiceActual], indiceActual);
            indiceActual += pasoFrames;
        }, intervaloMs);
    }

    function pause() {
        clearInterval(intervalId);
        intervalId = null;
    }

    function reset() {
        pause();
        indiceActual = 0;
        if (puntos.length > 0) onFrame(puntos[0], 0);
    }

    /** Salta directamente a un índice del recorrido (usado por la barra de progreso). */
    function irAIndice(indice) {
        if (puntos.length === 0) return;
        indiceActual = Math.max(0, Math.min(indice, puntos.length - 1));
        onFrame(puntos[indiceActual], indiceActual);
    }

    function estaReproduciendo() {
        return intervalId !== null;
    }

    function obtenerIndiceActual() {
        return indiceActual;
    }

    return { play, pause, reset, irAIndice, estaReproduciendo, obtenerIndiceActual };
}
