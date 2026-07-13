// calculadoraNavegacion.js — "El chef de salsas"
// Aquí vive toda la matemática: distancia real (Haversine), reconstrucción
// de ruta por estima náutica con proyección correcta, y formateo de tiempo.
// No sabe nada de mapas ni de pantallas, solo calcula.

const RADIO_TIERRA_NM = 3440.065; // Radio medio de la Tierra en millas náuticas
const NM_POR_GRADO_LAT = 60;      // 1 grado de latitud = 60 millas náuticas (constante)

/**
 * Distancia geodésica real entre dos coordenadas (fórmula de Haversine), en millas náuticas.
 */
export function distanciaHaversineNm(lat1, lon1, lat2, lon2) {
    const toRad = g => (g * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return RADIO_TIERRA_NM * c;
}

/**
 * Formatea segundos transcurridos como HH:MM:SS.
 */
export function formatearReloj(segundosTranscurridos) {
    const h = Math.floor(segundosTranscurridos / 3600).toString().padStart(2, '0');
    const m = Math.floor((segundosTranscurridos % 3600) / 60).toString().padStart(2, '0');
    const s = Math.floor(segundosTranscurridos % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
}

/**
 * Construye la ruta a partir de posición GPS real.
 * Distancia = suma de Haversine entre puntos consecutivos (distancia real sobre la esfera).
 * @param {{tSeg:number, lat:number, lon:number, sog:number, curso:number}[]} crudos
 * @param {number|null} direccionViento - dirección del viento en grados (si se conoce), para calcular el TWA
 */
export function construirDesdeGPS(crudos, direccionViento = null) {
    const primerTiempo = crudos[0].tSeg;
    let maxSOG = crudos[0].sog;
    let distanciaAcumulada = 0;

    const twa0 = direccionViento !== null ? calcularTWA(crudos[0].curso, direccionViento) : null;
    const puntos = [{
        lat: crudos[0].lat,
        lon: crudos[0].lon,
        sog: crudos[0].sog,
        curso: crudos[0].curso,
        twa: twa0,
        twd: direccionViento,
        segundos: 0,
        tiempoFormateado: "00:00:00",
        distancia: "0.00"
    }];
    const coordenadasMapa = [[crudos[0].lat, crudos[0].lon]];

    for (let k = 1; k < crudos.length; k++) {
        const pAnt = crudos[k - 1];
        const pAct = crudos[k];
        const dtSeconds = pAct.tSeg - pAnt.tSeg;
        if (dtSeconds <= 0 || dtSeconds > 30) continue; // Ignorar saltos anormales de tiempo

        distanciaAcumulada += distanciaHaversineNm(pAnt.lat, pAnt.lon, pAct.lat, pAct.lon);
        if (pAct.sog > maxSOG) maxSOG = pAct.sog;

        const segundosTranscurridos = pAct.tSeg - primerTiempo;
        coordenadasMapa.push([pAct.lat, pAct.lon]);
        puntos.push({
            lat: pAct.lat,
            lon: pAct.lon,
            sog: pAct.sog,
            curso: pAct.curso,
            twa: direccionViento !== null ? calcularTWA(pAct.curso, direccionViento) : null,
            twd: direccionViento,
            segundos: segundosTranscurridos,
            tiempoFormateado: formatearReloj(segundosTranscurridos),
            distancia: distanciaAcumulada.toFixed(2)
        });
    }

    return { puntos, coordenadasMapa, maxSOG, tipoPosicion: 'gps' };
}

/**
 * Reconstruye la ruta por estima náutica (dead reckoning) cuando no hay GPS.
 * Usa proyección correcta: 1° lat = 60 nm siempre; 1° lon = 60 nm * cos(latitud).
 * @param {{t:number, sog:number, curso:number}[]} datosFiltrados
 * @param {number} latInicial
 * @param {number} lonInicial
 * @param {boolean} anclada - true si el punto de salida es real y conocido
 */
export function construirDesdeSparse(datosFiltrados, latInicial, lonInicial, anclada) {
    const primerTiempo = datosFiltrados[0].t;
    let latActual = latInicial;
    let lonActual = lonInicial;
    let maxSOG = datosFiltrados[0].sog;
    let distanciaAcumulada = 0;

    const puntos = [{
        lat: latActual,
        lon: lonActual,
        sog: datosFiltrados[0].sog,
        curso: datosFiltrados[0].curso,
        twa: datosFiltrados[0].twa ?? null,
        twd: datosFiltrados[0].twd ?? null,
        segundos: 0,
        tiempoFormateado: "00:00:00",
        distancia: "0.00"
    }];
    const coordenadasMapa = [[latActual, lonActual]];

    for (let k = 1; k < datosFiltrados.length; k++) {
        const pAnt = datosFiltrados[k - 1];
        const pAct = datosFiltrados[k];

        const dtSeconds = Math.round((pAct.t - pAnt.t) * 86400);
        if (dtSeconds <= 0 || dtSeconds > 10) continue; // Ignorar saltos anormales

        const anguloRad = (pAct.curso * Math.PI) / 180;
        const distanciaTramoNm = pAct.sog * (dtSeconds / 3600); // nudos * horas = millas náuticas

        // Componentes norte/este del desplazamiento, en millas náuticas
        const despNorteNm = distanciaTramoNm * Math.cos(anguloRad);
        const despEsteNm = distanciaTramoNm * Math.sin(anguloRad);

        // 1° de latitud = 60 nm siempre; 1° de longitud = 60 nm * cos(latitud)
        latActual += despNorteNm / NM_POR_GRADO_LAT;
        lonActual += despEsteNm / (NM_POR_GRADO_LAT * Math.cos((latActual * Math.PI) / 180));

        distanciaAcumulada += distanciaTramoNm;
        if (pAct.sog > maxSOG) maxSOG = pAct.sog;

        const segundosTranscurridos = (pAct.t - primerTiempo) * 86400;
        coordenadasMapa.push([latActual, lonActual]);
        puntos.push({
            lat: latActual,
            lon: lonActual,
            sog: pAct.sog,
            curso: pAct.curso,
            twa: pAct.twa ?? null,
            twd: pAct.twd ?? null,
            segundos: segundosTranscurridos,
            tiempoFormateado: formatearReloj(segundosTranscurridos),
            distancia: distanciaAcumulada.toFixed(2)
        });
    }

    return {
        puntos, coordenadasMapa, maxSOG,
        tipoPosicion: anclada ? 'estimada-anclada' : 'estimada-relativa'
    };
}

/** Normaliza una diferencia angular al rango (-180, 180]. */
function normalizarDiferenciaAngular(diffGrados) {
    return ((diffGrados % 360) + 540) % 360 - 180;
}

/**
 * Ángulo aparente del viento respecto al rumbo del barco (TWA):
 * 0° = viento de cara (proa), ±180° = viento de popa, signo = amura (banda).
 * @param {number} curso - rumbo del barco en grados
 * @param {number} direccionViento - dirección de la que viene el viento, en grados
 */
export function calcularTWA(curso, direccionViento) {
    return normalizarDiferenciaAngular(curso - direccionViento);
}

/**
 * Media angular (circular) de una lista de direcciones en grados, en [0, 360).
 * Ignora valores null/undefined/NaN. Devuelve null si no hay ningún valor válido.
 */
export function promedioAngular(direcciones) {
    let sumaX = 0, sumaY = 0, n = 0;
    for (const d of direcciones) {
        if (d === null || d === undefined || isNaN(d)) continue;
        const rad = (d * Math.PI) / 180;
        sumaX += Math.cos(rad);
        sumaY += Math.sin(rad);
        n++;
    }
    if (n === 0) return null;
    let grados = (Math.atan2(sumaY / n, sumaX / n) * 180) / Math.PI;
    if (grados < 0) grados += 360;
    return grados;
}

/**
 * Cuenta viradas (cruce de viento de cara, navegando de ceñida) y trasluchadas
 * (cruce de viento de popa, navegando a favor) a partir del TWA de cada punto.
 * Usa una ventana de tiempo para no contar como maniobra el ruido de la señal.
 * @param {{segundos:number, twa:number|null}[]} puntos
 * @returns {{viradas:number, trasluchadas:number}|null} null si no hay datos de viento
 */
export function calcularManiobras(puntos, ventanaSegundos = 15, umbralGrados = 40) {
    let viradas = 0, trasluchadas = 0;
    let huboDatosViento = false;
    let j = 0;

    for (let i = 0; i < puntos.length; i++) {
        while (j < i && puntos[i].segundos - puntos[j].segundos > ventanaSegundos) j++;
        if (i - j < 3) continue;

        const twaAntes = puntos[j].twa;
        const twaAhora = puntos[i].twa;
        if (twaAntes === null || twaAntes === undefined || isNaN(twaAntes)) continue;
        if (twaAhora === null || twaAhora === undefined || isNaN(twaAhora)) continue;
        huboDatosViento = true;

        const signoAntes = Math.sign(twaAntes);
        const signoAhora = Math.sign(twaAhora);
        const cambioDeAmura = signoAntes !== 0 && signoAhora !== 0 && signoAntes !== signoAhora;
        const magnitudCambio = Math.abs(normalizarDiferenciaAngular(twaAhora - twaAntes));

        if (cambioDeAmura && magnitudCambio > umbralGrados) {
            const promedioAbs = (Math.abs(twaAntes) + Math.abs(twaAhora)) / 2;
            if (promedioAbs < 90) viradas++; else trasluchadas++;
            j = i; // evitar contar la misma maniobra varias veces
        }
    }

    return huboDatosViento ? { viradas, trasluchadas } : null;
}
