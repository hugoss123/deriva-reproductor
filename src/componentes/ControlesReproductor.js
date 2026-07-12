// ControlesReproductor.js — "Los botones del reproductor"
// Único trabajo: que Play, Pausa y Reset funcionen y avancen el timeline.
// No sabe qué son los "puntos" que reproduce, ni cómo se dibujan en el mapa.

/**
 * Conecta los botones del DOM y expone funciones para habilitar/deshabilitar
 * su estado visual. La lógica de qué pasa al pulsarlos la decide quien llama.
 * @param {{onPlay:Function, onPause:Function, onReset:Function}} callbacks
 */
export function inicializarControlesReproductor({ onPlay, onPause, onReset }) {
    const btnPlay = document.getElementById('btn-play');
    const btnPausa = document.getElementById('btn-pausa');
    const btnReset = document.getElementById('btn-reset');

    btnPlay.addEventListener('click', onPlay);
    btnPausa.addEventListener('click', onPause);
    btnReset.addEventListener('click', onReset);

    return {
        habilitar() {
            btnPlay.disabled = false;
            btnPausa.disabled = true;
            btnReset.disabled = false;
        },
        deshabilitar() {
            btnPlay.disabled = true;
            btnPausa.disabled = true;
            btnReset.disabled = true;
        },
        marcarReproduciendo() {
            btnPlay.disabled = true;
            btnPausa.disabled = false;
        },
        marcarPausado() {
            btnPlay.disabled = false;
            btnPausa.disabled = true;
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
            onFrame(puntos[indiceActual]);
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
        if (puntos.length > 0) onFrame(puntos[0]);
    }

    function estaReproduciendo() {
        return intervalId !== null;
    }

    return { play, pause, reset, estaReproduciendo };
}
