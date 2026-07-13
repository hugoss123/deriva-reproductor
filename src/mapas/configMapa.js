// configMapa.js — "La estación de mapas"
// Único trabajo: pintar el mapa, la línea de colores de la estela y el
// puntito del barco. No sabe de dónde vienen los datos ni cómo se calcularon.

/**
 * Crea el mapa base con capa oscura y la capa donde se dibujará la estela.
 * @param {string} idElemento - id del div donde se monta el mapa
 * @returns {{mapa: L.Map, capaEstela: L.LayerGroup}}
 */
export function crearMapa(idElemento) {
    const mapa = L.map(idElemento).setView([39.45, -0.30], 12);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap &copy; CARTO'
    }).addTo(mapa);

    const capaEstela = L.layerGroup().addTo(mapa);

    return { mapa, capaEstela };
}

/**
 * Calcula el color térmico (rojo→amarillo→azul) según qué % de la velocidad
 * máxima de la regata representa este punto.
 */
export function obtenerColorVelocidad(sog, vMax) {
    if (vMax === 0) return '#ef4444';
    const porcentaje = Math.min(sog / vMax, 1);

    if (porcentaje < 0.5) {
        const r = Math.round(239 + (234 - 239) * (porcentaje * 2));
        const g = Math.round(68 + (179 - 68) * (porcentaje * 2));
        const b = Math.round(68 + (8 - 68) * (porcentaje * 2));
        return `rgb(${r},${g},${b})`;
    } else {
        const p2 = (porcentaje - 0.5) * 2;
        const r = Math.round(234 + (59 - 234) * p2);
        const g = Math.round(179 + (130 - 179) * p2);
        const b = Math.round(8 + (246 - 8) * p2);
        return `rgb(${r},${g},${b})`;
    }
}

/**
 * Gestor de la estela progresiva: dibuja únicamente los tramos ya recorridos
 * por el barco, o el recorrido completo si el usuario lo pide explícitamente.
 * No sabe qué es "el tiempo actual" ni cómo se reproduce — solo dibuja u
 * oculta segmentos cuando se le pide.
 * @param {L.LayerGroup} capaEstela
 */
export function crearGestorEstela(capaEstela) {
    let segmentos = [];   // L.Polyline por tramo, o null si aún no está dibujado
    let puntosRef = [];
    let maxSOGRef = 0;

    /** Prepara el gestor para una nueva ruta (se llama al cargar un archivo). */
    function inicializar(puntos, maxSOG) {
        capaEstela.clearLayers();
        puntosRef = puntos;
        maxSOGRef = maxSOG;
        segmentos = new Array(Math.max(puntos.length - 1, 0)).fill(null);
    }

    /** Dibuja (si no lo estaban ya) todos los tramos hasta el índice dado. */
    function dibujarHasta(indice) {
        const limite = Math.min(indice, segmentos.length);
        for (let i = 0; i < limite; i++) {
            if (segmentos[i] === null) {
                const pA = puntosRef[i];
                const pB = puntosRef[i + 1];
                segmentos[i] = L.polyline([[pA.lat, pA.lon], [pB.lat, pB.lon]], {
                    color: obtenerColorVelocidad(pA.sog, maxSOGRef),
                    weight: 4,
                    opacity: 0.85
                }).addTo(capaEstela);
            }
        }
    }

    /** Dibuja el recorrido completo, de principio a fin. */
    function dibujarCompleto() {
        dibujarHasta(segmentos.length);
    }

    /** Oculta (quita del mapa) todos los tramos a partir del índice dado. */
    function ocultarDesde(indice) {
        for (let i = indice; i < segmentos.length; i++) {
            if (segmentos[i] !== null) {
                capaEstela.removeLayer(segmentos[i]);
                segmentos[i] = null;
            }
        }
    }

    return { inicializar, dibujarHasta, dibujarCompleto, ocultarDesde };
}

/**
 * Encuadra el mapa para que se vea toda la ruta cargada.
 */
export function encuadrarMapa(mapa, coordenadasMapa) {
    if (coordenadasMapa.length > 0) mapa.fitBounds(coordenadasMapa);
}

/**
 * Crea el marcador (círculo blanco) que representa al barco en el mapa.
 */
export function crearMarcadorBarco(mapa, lat, lon) {
    return L.circleMarker([lat, lon], {
        radius: 7,
        fillColor: '#ffffff',
        color: '#38bdf8',
        weight: 3,
        fillOpacity: 1
    }).addTo(mapa);
}

/**
 * Mueve el marcador del barco a una nueva posición.
 */
export function moverMarcador(marcador, lat, lon) {
    marcador.setLatLng([lat, lon]);
}

/**
 * Quita el marcador del barco del mapa (p.ej. antes de cargar un nuevo archivo).
 */
export function eliminarMarcador(mapa, marcador) {
    if (marcador) mapa.removeLayer(marcador);
}

/**
 * Controla la orientación visual del mapa: Norte arriba (por defecto) o
 * dirección del viento arriba. Rota el contenedor completo del mapa por CSS,
 * así que la estela y el marcador rotan con él sin ningún cálculo adicional.
 *
 * Nota: al estar rotado por CSS (no hay plugin de rotación), el arrastre y
 * el zoom con el ratón siguen funcionando pero su dirección visual puede no
 * coincidir con el gesto mientras el mapa está girado — limitación conocida
 * de esta técnica sencilla, aceptable para un visor de solo lectura.
 * @param {L.Map} mapa
 */
export function crearControladorOrientacion(mapa) {
    const contenedor = mapa.getContainer();
    let modoViento = false;
    let direccionViento = null;

    function aplicarRotacion() {
        const grados = (modoViento && direccionViento !== null) ? -direccionViento : 0;
        contenedor.style.transform = `rotate(${grados}deg)`;
        contenedor.style.transformOrigin = 'center center';
    }

    return {
        /** Fija la dirección del viento (grados, 0-360) para esta ruta. */
        establecerDireccionViento(grados) {
            direccionViento = grados;
            aplicarRotacion();
        },
        /** Alterna entre Norte arriba y viento arriba. Devuelve el nuevo modo. */
        alternar() {
            modoViento = !modoViento;
            aplicarRotacion();
            return modoViento;
        },
        /** Vuelve a Norte arriba y olvida la dirección de viento (nuevo archivo cargado). */
        reiniciar() {
            modoViento = false;
            direccionViento = null;
            aplicarRotacion();
        },
        tieneDireccionViento() {
            return direccionViento !== null;
        },
        estaEnModoViento() {
            return modoViento;
        }
    };
}

/**
 * Conecta el botón redondo de orientación con el controlador correspondiente.
 * @param {string} idBoton
 * @param {ReturnType<typeof crearControladorOrientacion>} controlador
 */
export function inicializarBotonOrientacion(idBoton, controlador) {
    const boton = document.getElementById(idBoton);

    function actualizarAspecto() {
        const disponible = controlador.tieneDireccionViento();
        boton.disabled = !disponible;
        boton.classList.toggle('activo', controlador.estaEnModoViento());
        boton.title = !disponible
            ? 'Sin datos de viento en este archivo'
            : (controlador.estaEnModoViento() ? 'Volver a orientar al Norte' : 'Orientar según la dirección del viento');
    }

    boton.addEventListener('click', () => {
        controlador.alternar();
        actualizarAspecto();
    });

    actualizarAspecto();
    return { actualizarAspecto };
}
