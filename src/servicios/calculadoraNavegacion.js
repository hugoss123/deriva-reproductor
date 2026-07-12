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
 */
export function construirDesdeGPS(crudos) {
    const primerTiempo = crudos[0].tSeg;
    let maxSOG = crudos[0].sog;
    let distanciaAcumulada = 0;

    const puntos = [{
        lat: crudos[0].lat,
        lon: crudos[0].lon,
        sog: crudos[0].sog,
        curso: crudos[0].curso,
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

        coordenadasMapa.push([pAct.lat, pAct.lon]);
        puntos.push({
            lat: pAct.lat,
            lon: pAct.lon,
            sog: pAct.sog,
            curso: pAct.curso,
            tiempoFormateado: formatearReloj(pAct.tSeg - primerTiempo),
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

        coordenadasMapa.push([latActual, lonActual]);
        puntos.push({
            lat: latActual,
            lon: lonActual,
            sog: pAct.sog,
            curso: pAct.curso,
            tiempoFormateado: formatearReloj((pAct.t - primerTiempo) * 86400),
            distancia: distanciaAcumulada.toFixed(2)
        });
    }

    return {
        puntos, coordenadasMapa, maxSOG,
        tipoPosicion: anclada ? 'estimada-anclada' : 'estimada-relativa'
    };
}
