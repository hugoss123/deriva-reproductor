// configMapa.js — "La estación de mapas"
// Único trabajo: pintar el mapa, la línea de colores de la estela y el
// puntito del barco. No sabe de dónde vienen los datos ni cómo se calcularon.

/**
 * Crea el mapa base con capa oscura y la capa donde se dibujará la estela.
 * @param {string} idElemento - id del div donde se monta el mapa
 * @returns {{mapa: L.Map, capaEstela: L.LayerGroup}}
 */
export function crearMapa(idElemento) {
    // Desactivamos los controles nativos de Leaflet: como el lienzo se agranda y
    // gira, usamos controles propios (zoom/atribución) por fuera, que no giran.
    const mapa = L.map(idElemento, { zoomControl: false, attributionControl: false })
        .setView([39.45, -0.30], 12);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap &copy; CARTO'
    }).addTo(mapa);

    const capaEstela = L.layerGroup().addTo(mapa);

    return { mapa, capaEstela };
}

/**
 * Conecta los botones propios de zoom (+/-) con el mapa.
 */
export function inicializarZoomPersonalizado(mapa, idMas = 'btn-zoom-in', idMenos = 'btn-zoom-out') {
    const btnMas = document.getElementById(idMas);
    const btnMenos = document.getElementById(idMenos);
    if (btnMas) btnMas.addEventListener('click', () => mapa.zoomIn());
    if (btnMenos) btnMenos.addEventListener('click', () => mapa.zoomOut());
}

/**
 * Calcula el color térmico según qué % de la velocidad máxima de la regata
 * representa este punto: rojo (lento) → blanquecino (medio) → azul (rápido).
 */
export function obtenerColorVelocidad(sog, vMax) {
    if (vMax === 0) return '#ef4444';
    const porcentaje = Math.min(sog / vMax, 1);

    // Extremos de la escala: rojo, blanquecino y azul.
    const rojo = [239, 68, 68];
    const blanco = [240, 240, 242];
    const azul = [59, 130, 246];

    if (porcentaje < 0.5) {
        const t = porcentaje * 2; // rojo -> blanquecino
        const r = Math.round(rojo[0] + (blanco[0] - rojo[0]) * t);
        const g = Math.round(rojo[1] + (blanco[1] - rojo[1]) * t);
        const b = Math.round(rojo[2] + (blanco[2] - rojo[2]) * t);
        return `rgb(${r},${g},${b})`;
    } else {
        const t = (porcentaje - 0.5) * 2; // blanquecino -> azul
        const r = Math.round(blanco[0] + (azul[0] - blanco[0]) * t);
        const g = Math.round(blanco[1] + (azul[1] - blanco[1]) * t);
        const b = Math.round(blanco[2] + (azul[2] - blanco[2]) * t);
        return `rgb(${r},${g},${b})`;
    }
}

/**
 * Gestor de la estela: mantiene dibujado en el mapa exactamente el tramo de
 * ruta que se le pide, y nada más. No sabe qué es "el tiempo actual", ni qué
 * intervalo ha elegido el usuario — solo sincroniza lo pintado con el rango
 * que recibe.
 * @param {L.LayerGroup} capaEstela
 */
export function crearGestorEstela(capaEstela) {
    let segmentos = [];   // L.Polyline por tramo, o null si no está dibujado
    let puntosRef = [];
    let maxSOGRef = 0;
    // Rango de segmentos actualmente dibujado, semiabierto [dibujadoA, dibujadoB).
    let dibujadoA = 0;
    let dibujadoB = 0;

    /** Prepara el gestor para una nueva ruta (se llama al cargar un archivo). */
    function inicializar(puntos, maxSOG) {
        capaEstela.clearLayers();
        puntosRef = puntos;
        maxSOGRef = maxSOG;
        segmentos = new Array(Math.max(puntos.length - 1, 0)).fill(null);
        dibujadoA = 0;
        dibujadoB = 0;
    }

    function dibujarSegmento(i) {
        if (segmentos[i] !== null) return;
        const pA = puntosRef[i];
        const pB = puntosRef[i + 1];
        segmentos[i] = L.polyline([[pA.lat, pA.lon], [pB.lat, pB.lon]], {
            color: obtenerColorVelocidad(pA.sog, maxSOGRef),
            weight: 4,
            opacity: 0.85
        }).addTo(capaEstela);
    }

    function borrarSegmento(i) {
        if (segmentos[i] === null) return;
        capaEstela.removeLayer(segmentos[i]);
        segmentos[i] = null;
    }

    function borrarTramo(desde, hasta) {
        for (let i = desde; i < hasta; i++) borrarSegmento(i);
    }

    function dibujarTramo(desde, hasta) {
        for (let i = desde; i < hasta; i++) dibujarSegmento(i);
    }

    /**
     * Deja dibujado el recorrido entre los puntos [desdePunto, hastaPunto] y
     * quita del mapa todo lo que quede fuera. Solo toca los tramos que cambian
     * respecto a lo ya pintado, por eso puede llamarse en cada frame.
     */
    function mostrarRango(desdePunto, hastaPunto) {
        const total = segmentos.length;
        const a = Math.max(0, Math.min(desdePunto, total));
        const b = Math.max(a, Math.min(hastaPunto, total));

        if (b <= a) {                       // intervalo vacío: nada que mostrar
            borrarTramo(dibujadoA, dibujadoB);
        } else if (b <= dibujadoA || a >= dibujadoB) {   // sin solape: recambio total
            borrarTramo(dibujadoA, dibujadoB);
            dibujarTramo(a, b);
        } else {
            borrarTramo(dibujadoA, a);      // lo que sobra por la izquierda
            borrarTramo(b, dibujadoB);      // lo que sobra por la derecha
            dibujarTramo(a, dibujadoA);     // lo que falta por la izquierda
            dibujarTramo(dibujadoB, b);     // lo que falta por la derecha
        }

        dibujadoA = a;
        dibujadoB = b;
    }

    return { inicializar, mostrarRango };
}

/**
 * Encuadra el mapa para que se vea toda la ruta cargada.
 */
export function encuadrarMapa(mapa, coordenadasMapa) {
    if (coordenadasMapa.length === 0) return;

    // El lienzo del mapa es un cuadrado más grande que el marco visible; sólo se
    // ve su parte central. Reservamos como relleno los márgenes ocultos para que
    // el recorrido encaje dentro de la zona realmente visible.
    const cont = mapa.getContainer();
    const marco = cont.parentElement;
    const lado = cont.clientWidth || cont.offsetWidth;
    const w = marco ? marco.clientWidth : lado;
    const h = marco ? marco.clientHeight : lado;
    const padX = Math.max((lado - w) / 2, 0) + 12;
    const padY = Math.max((lado - h) / 2, 0) + 12;

    mapa.fitBounds(coordenadasMapa, {
        paddingTopLeft: [padX, padY],
        paddingBottomRight: [padX, padY]
    });
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
 * dirección del viento arriba.
 *
 * El lienzo del mapa (#mapa) se agranda a un cuadrado de lado >= la diagonal del
 * marco y se centra en él; el marco (con overflow:hidden) recorta lo que sobra.
 * Girar ese contenedor por CSS mantiene siempre cubierto el marco en cualquier
 * ángulo (sin bandas ni esquinas vacías, sin zoom) y, como se gira sobre su
 * centro, el recorrido/barco sigue centrado. Leaflet no toca el transform del
 * contenedor, así que la orientación se mantiene al arrastrar y al hacer zoom.
 *
 * Nota: al no haber plugin de rotación, la dirección del arrastre/zoom con el
 * ratón puede no coincidir con el gesto mientras el mapa está girado —
 * limitación conocida, aceptable para un visor de solo lectura.
 * @param {L.Map} mapa
 */
export function crearControladorOrientacion(mapa) {
    const contenedor = mapa.getContainer();
    let modoViento = false;
    let direccionViento = null;

    // Ajusta el lienzo a un cuadrado (lado >= diagonal del marco) para que quepa
    // el mapa girado en cualquier ángulo. Debe llamarse cuando cambia el tamaño.
    function ajustarLienzo() {
        const marco = contenedor.parentElement;
        if (!marco) return;
        const w = marco.clientWidth, h = marco.clientHeight;
        if (!w || !h) return;
        const lado = Math.ceil(Math.hypot(w, h)) + 2;
        contenedor.style.width = lado + 'px';
        contenedor.style.height = lado + 'px';
        mapa.invalidateSize({ animate: false });
    }

    function aplicarRotacion() {
        const grados = (modoViento && direccionViento !== null) ? -direccionViento : 0;
        contenedor.style.transformOrigin = 'center center';
        contenedor.style.transform = `translate(-50%, -50%) rotate(${grados}deg)`;
    }

    ajustarLienzo();
    aplicarRotacion();

    // Si cambia el tamaño de la ventana, el marco cambia: reajustamos.
    window.addEventListener('resize', () => {
        ajustarLienzo();
        aplicarRotacion();
    });

    // --- Arrastre propio que respeta la rotación ------------------------------
    // El arrastre nativo de Leaflet mueve el contenido en el sistema SIN rotar,
    // así que con el mapa girado el desplazamiento sale torcido. Lo desactivamos
    // y movemos el mapa nosotros: convertimos el desplazamiento del cursor (en
    // pantalla) al del mapa deshaciendo la rotación, de modo que el contenido
    // siga siempre la dirección del cursor aunque esté orientado al viento.
    mapa.dragging.disable();
    contenedor.style.cursor = 'grab';

    let arrastrando = false;
    let ultimoX = 0, ultimoY = 0;

    contenedor.addEventListener('pointerdown', (e) => {
        if (e.button !== undefined && e.button !== 0) return; // solo botón principal
        arrastrando = true;
        ultimoX = e.clientX;
        ultimoY = e.clientY;
        contenedor.style.cursor = 'grabbing';
        try { contenedor.setPointerCapture(e.pointerId); } catch (_) {}
    });

    contenedor.addEventListener('pointermove', (e) => {
        if (!arrastrando) return;
        const sx = e.clientX - ultimoX;
        const sy = e.clientY - ultimoY;
        ultimoX = e.clientX;
        ultimoY = e.clientY;

        const grados = (modoViento && direccionViento !== null) ? -direccionViento : 0;
        const rad = grados * Math.PI / 180;
        const cos = Math.cos(rad), sin = Math.sin(rad);
        // d = -M(-θ)·s : deshace la rotación para que el contenido siga al cursor.
        const dx = -cos * sx - sin * sy;
        const dy = sin * sx - cos * sy;
        mapa.panBy([dx, dy], { animate: false });
    });

    function finArrastre(e) {
        if (!arrastrando) return;
        arrastrando = false;
        contenedor.style.cursor = 'grab';
        try { contenedor.releasePointerCapture(e.pointerId); } catch (_) {}
    }
    contenedor.addEventListener('pointerup', finArrastre);
    contenedor.addEventListener('pointercancel', finArrastre);

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
