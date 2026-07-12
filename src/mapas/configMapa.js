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
 * Dibuja la traza completa coloreada por velocidad en la capa de estela.
 * @param {L.LayerGroup} capaEstela
 * @param {{lat:number, lon:number, sog:number}[]} puntos
 * @param {number} maxSOG
 */
export function dibujarEstela(capaEstela, puntos, maxSOG) {
    capaEstela.clearLayers();
    for (let m = 0; m < puntos.length - 1; m++) {
        const pA = puntos[m];
        const pB = puntos[m + 1];
        L.polyline([[pA.lat, pA.lon], [pB.lat, pB.lon]], {
            color: obtenerColorVelocidad(pA.sog, maxSOG),
            weight: 4,
            opacity: 0.85
        }).addTo(capaEstela);
    }
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
