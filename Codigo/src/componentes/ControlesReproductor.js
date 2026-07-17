// ControlesReproductor.js — "Los botones del reproductor"
// Único trabajo: que Play, Pausa y Reset funcionen y avancen el timeline.
// No sabe qué son los "puntos" que reproduce, ni cómo se dibujan en el mapa.

/**
 * Conecta los botones del DOM (play/pausa/reset + interruptor de recorrido
 * completo + barra de progreso con selector de intervalo) y expone funciones
 * para actualizar su estado visual. La lógica de qué pasa al interactuar la
 * decide quien llama.
 * @param {{onPlay:Function, onPause:Function, onReset:Function, onToggleRecorridoCompleto:Function, onSeek:Function, onVelocidad:Function, onRango:Function}} callbacks
 */
export function inicializarControlesReproductor({ onPlay, onPause, onReset, onToggleRecorridoCompleto, onSeek, onVelocidad, onRango }) {
    const btnPlay = document.getElementById('btn-play');
    const btnPausa = document.getElementById('btn-pausa');
    const btnReset = document.getElementById('btn-reset');
    const btnVelocidad = document.getElementById('btn-velocidad');
    const btnToggle = document.getElementById('btn-toggle-recorrido');
    const barraProgreso = document.getElementById('barra-progreso');
    const tiempoActualEl = document.getElementById('tiempo-actual-barra');
    const tiempoTotalEl = document.getElementById('tiempo-total-barra');
    const contenedorRango = document.getElementById('rango-doble');
    const rangoInicio = document.getElementById('rango-inicio');
    const rangoFin = document.getElementById('rango-fin');
    const seleccionEl = document.getElementById('rd-seleccion');
    const etiquetaIntervaloEl = document.getElementById('etiqueta-intervalo');
    const btnResetIntervalo = document.getElementById('btn-reset-intervalo');

    // Diámetro del thumb en CSS: hace falta para alinear el tramo pintado con
    // el centro de los handles (el navegador reparte el recorrido del slider
    // dejando medio thumb de margen a cada lado).
    const ANCHO_THUMB = 14;

    // Multiplicadores de velocidad de reproducción; el botón cicla entre ellos.
    const VELOCIDADES = [1, 2, 4, 8, 16, 32];
    let indiceVelocidad = 0;

    function actualizarEtiquetaVelocidad() {
        btnVelocidad.innerText = '⏩ x' + VELOCIDADES[indiceVelocidad];
    }

    // --- Selector de intervalo (dos handles sobre la barra de progreso) -------

    function indiceMaximo() {
        return parseInt(rangoFin.max, 10) || 0;
    }

    function porcentaje(valor) {
        const max = indiceMaximo();
        return max === 0 ? 0 : (valor / max) * 100;
    }

    /** Pinta el tramo azul entre los centros de los dos handles. */
    function pintarSeleccion() {
        const a = porcentaje(parseInt(rangoInicio.value, 10));
        const b = porcentaje(parseInt(rangoFin.value, 10));
        seleccionEl.style.left = `calc(${a}% + ${(0.5 - a / 100) * ANCHO_THUMB}px)`;
        seleccionEl.style.right = `calc(${100 - b}% - ${(0.5 - b / 100) * ANCHO_THUMB}px)`;
    }

    function emitirRango() {
        pintarSeleccion();
        onRango(parseInt(rangoInicio.value, 10), parseInt(rangoFin.value, 10));
    }

    // Los handles no pueden cruzarse: siempre queda al menos un tramo dentro.
    rangoInicio.addEventListener('input', () => {
        const fin = parseInt(rangoFin.value, 10);
        if (parseInt(rangoInicio.value, 10) >= fin) rangoInicio.value = Math.max(0, fin - 1);
        emitirRango();
    });
    rangoFin.addEventListener('input', () => {
        const inicio = parseInt(rangoInicio.value, 10);
        if (parseInt(rangoFin.value, 10) <= inicio) rangoFin.value = Math.min(indiceMaximo(), inicio + 1);
        emitirRango();
    });

    // Con los dos handles juntos, el de encima taparía siempre al otro. Antes de
    // que el usuario pulse, adelantamos el que tiene más cerca el cursor.
    let arrastrandoHandle = false;
    contenedorRango.addEventListener('pointerdown', () => { arrastrandoHandle = true; });
    window.addEventListener('pointerup', () => { arrastrandoHandle = false; });
    contenedorRango.addEventListener('pointermove', evento => {
        if (arrastrandoHandle) return;
        const caja = contenedorRango.getBoundingClientRect();
        if (caja.width === 0) return;
        const pct = ((evento.clientX - caja.left) / caja.width) * 100;
        const dInicio = Math.abs(pct - porcentaje(parseInt(rangoInicio.value, 10)));
        const dFin = Math.abs(pct - porcentaje(parseInt(rangoFin.value, 10)));
        contenedorRango.classList.toggle('rd-inicio-encima', dInicio < dFin);
    });

    btnResetIntervalo.addEventListener('click', () => {
        rangoInicio.value = 0;
        rangoFin.value = indiceMaximo();
        emitirRango();
    });

    btnPlay.addEventListener('click', onPlay);
    btnPausa.addEventListener('click', onPause);
    btnReset.addEventListener('click', onReset);
    btnToggle.addEventListener('click', onToggleRecorridoCompleto);
    barraProgreso.addEventListener('input', () => onSeek(parseInt(barraProgreso.value, 10)));
    btnVelocidad.addEventListener('click', () => {
        indiceVelocidad = (indiceVelocidad + 1) % VELOCIDADES.length;
        actualizarEtiquetaVelocidad();
        onVelocidad(VELOCIDADES[indiceVelocidad]);
    });

    return {
        habilitar() {
            btnPlay.disabled = false;
            btnPausa.disabled = true;
            btnReset.disabled = false;
            btnVelocidad.disabled = false;
            btnToggle.disabled = false;
            barraProgreso.disabled = false;
            rangoInicio.disabled = false;
            rangoFin.disabled = false;
            btnResetIntervalo.disabled = false;
            contenedorRango.classList.remove('rd-off');
        },
        deshabilitar() {
            btnPlay.disabled = true;
            btnPausa.disabled = true;
            btnReset.disabled = true;
            btnVelocidad.disabled = true;
            btnToggle.disabled = true;
            barraProgreso.disabled = true;
            rangoInicio.disabled = true;
            rangoFin.disabled = true;
            btnResetIntervalo.disabled = true;
            contenedorRango.classList.add('rd-off');
        },
        /** Vuelve la velocidad a x1 (se llama al cargar un archivo nuevo). */
        reiniciarVelocidad() {
            indiceVelocidad = 0;
            actualizarEtiquetaVelocidad();
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
        /**
         * Fija el rango de la barra de progreso y deja el intervalo abarcando
         * la ruta entera (se llama al cargar un archivo).
         */
        configurarRango(totalPuntos) {
            const ultimo = Math.max(totalPuntos - 1, 0);
            for (const slider of [barraProgreso, rangoInicio, rangoFin]) {
                slider.min = 0;
                slider.max = ultimo;
            }
            barraProgreso.value = 0;
            rangoInicio.value = 0;
            rangoFin.value = ultimo;
            pintarSeleccion();
        },
        /** Devuelve el intervalo seleccionado ahora mismo. */
        obtenerRango() {
            return { inicio: parseInt(rangoInicio.value, 10), fin: parseInt(rangoFin.value, 10) };
        },
        /** Texto informativo del intervalo elegido (lo compone quien conoce los tiempos). */
        establecerEtiquetaIntervalo(texto) {
            etiquetaIntervaloEl.innerText = texto;
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
    let factorVelocidad = 1; // multiplicador de velocidad (x1, x2, x4, ...)
    // Intervalo reproducible; por defecto, la ruta entera.
    let limiteInicio = 0;
    let limiteFin = Math.max(puntos.length - 1, 0);

    function play() {
        if (intervalId !== null) return; // ya en marcha
        intervalId = setInterval(() => {
            if (indiceActual > limiteFin) {
                pause();
                if (onFin) onFin();
                return;
            }
            onFrame(puntos[indiceActual], indiceActual);
            indiceActual += pasoFrames * factorVelocidad;
        }, intervaloMs);
    }

    /** Ajusta la velocidad de reproducción (1, 2, 4, ...). Surte efecto de inmediato, esté o no en marcha. */
    function setVelocidad(factor) {
        factorVelocidad = factor;
    }

    function pause() {
        clearInterval(intervalId);
        intervalId = null;
    }

    function reset() {
        pause();
        indiceActual = limiteInicio;
        if (puntos.length > 0) onFrame(puntos[indiceActual], indiceActual);
    }

    /**
     * Limita la reproducción al intervalo elegido en la barra de progreso.
     * No mueve el cabezal ni redibuja: de eso se encarga quien llama.
     */
    function setRango(inicio, fin) {
        const ultimo = Math.max(puntos.length - 1, 0);
        limiteInicio = Math.max(0, Math.min(inicio, ultimo));
        limiteFin = Math.max(limiteInicio, Math.min(fin, ultimo));
    }

    /** Salta directamente a un índice del recorrido (usado por la barra de progreso). */
    function irAIndice(indice) {
        if (puntos.length === 0) return;
        indiceActual = Math.max(limiteInicio, Math.min(indice, limiteFin));
        onFrame(puntos[indiceActual], indiceActual);
    }

    function estaReproduciendo() {
        return intervalId !== null;
    }

    function obtenerIndiceActual() {
        return indiceActual;
    }

    return { play, pause, reset, irAIndice, estaReproduciendo, obtenerIndiceActual, setVelocidad, setRango };
}
