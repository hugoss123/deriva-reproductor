const RADIO_TIERRA_NM = 3440.065;
const NM_POR_GRADO_LAT = 60;

export function distanciaHaversineNm(lat1, lon1, lat2, lon2) {
    const toRad = g => (g * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return RADIO_TIERRA_NM * c;
}

export function formatearReloj(segundosTranscurridos) {
    const h = Math.floor(segundosTranscurridos / 3600).toString().padStart(2, '0');
    const m = Math.floor((segundosTranscurridos % 3600) / 60).toString().padStart(2, '0');
    const s = Math.floor(segundosTranscurridos % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
}

/**
 * Construye la ruta a partir de posición GPS real.
 */
export function construirDesdeGPS(crudos, direccionViento = null) {
    const primerTiempo = crudos[0].tSeg;
    let maxSOG = crudos[0].sog;
    let distanciaAcumulada = 0;

    const puntos = [];
    const coordenadasMapa = [];

    for (let k = 0; k < crudos.length; k++) {
        const pAct = crudos[k];
        
        // Si no trae viento de forma nativa, inyectamos el manual
        const twd = pAct.twd !== null ? pAct.twd : direccionViento;
        const twa = pAct.twa !== null ? pAct.twa : (twd !== null ? calcularTWA(pAct.curso, twd) : null);

        if (k > 0) {
            const pAnt = crudos[k - 1];
            const dtSeconds = pAct.tSeg - pAnt.tSeg;
            if (dtSeconds <= 0 || dtSeconds > 30) continue;
            distanciaAcumulada += distanciaHaversineNm(pAnt.lat, pAnt.lon, pAct.lat, pAct.lon);
        }

        if (pAct.sog > maxSOG) maxSOG = pAct.sog;

        const segundosTranscurridos = pAct.tSeg - primerTiempo;
        coordenadasMapa.push([pAct.lat, pAct.lon]);
        
        puntos.push({
            lat: pAct.lat,
            lon: pAct.lon,
            sog: pAct.sog,
            curso: pAct.curso,
            twa: twa,
            twd: twd,
            segundos: segundosTranscurridos,
            tiempoFormateado: formatearReloj(segundosTranscurridos),
            distancia: distanciaAcumulada.toFixed(2)
        });
    }

    return { puntos, coordenadasMapa, maxSOG, tipoPosicion: 'gps' };
}

/**
 * Reconstruye la ruta por estima náutica (dead reckoning) cuando no hay GPS.
 */
export function construirDesdeSparse(datosFiltrados, latInicial, lonInicial, anclada) {
    const primerTiempo = datosFiltrados[0].t;
    let latActual = latInicial;
    let lonActual = lonInicial;
    let maxSOG = datosFiltrados[0].sog;
    let distanciaAcumulada = 0;

    const puntos = [];
    const coordenadasMapa = [];

    for (let k = 0; k < datosFiltrados.length; k++) {
        const pAct = datosFiltrados[k];

        if (k > 0) {
            const pAnt = datosFiltrados[k - 1];
            const dtSeconds = Math.round((pAct.t - pAnt.t) * 86400);
            if (dtSeconds <= 0 || dtSeconds > 10) continue;

            const anguloRad = (pAct.curso * Math.PI) / 180;
            const distanciaTramoNm = pAct.sog * (dtSeconds / 3600); 

            const despNorteNm = distanciaTramoNm * Math.cos(anguloRad);
            const despEsteNm = distanciaTramoNm * Math.sin(anguloRad);

            latActual += despNorteNm / NM_POR_GRADO_LAT;
            lonActual += despEsteNm / (NM_POR_GRADO_LAT * Math.cos((latActual * Math.PI) / 180));
            distanciaAcumulada += distanciaTramoNm;
        }

        if (pAct.sog > maxSOG) maxSOG = pAct.sog;

        const segundosTranscurridos = Math.round((pAct.t - primerTiempo) * 86400);
        coordenadasMapa.push([latActual, lonActual]);

        puntos.push({
            lat: latActual,
            lon: lonActual,
            sog: pAct.sog,
            curso: pAct.curso,
            twa: pAct.twa !== null ? pAct.twa : (pAct.twd !== null ? calcularTWA(pAct.curso, pAct.twd) : null),
            twd: pAct.twd,
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

function normalizarDiferenciaAngular(diffGrados) {
    return ((diffGrados % 360) + 540) % 360 - 180;
}

export function calcularTWA(curso, direccionViento) {
    return normalizarDiferenciaAngular(curso - direccionViento);
}

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
 * Detecta los tramos (legs) de ceñida y de popa del recorrido.
 *
 * Se apoya en el |TWA|: cerca de 0° el barco va contra el viento (ceñida) y
 * cerca de 180° a favor (popa). Entre ambos umbrales queda una banda muerta
 * (través) que no decide nada: es por donde se pasa al rolar una baliza, y si
 * contara, cada rebase partiría el tramo en dos.
 *
 * Para no crear tramos falsos con un golpe de timón o una racha, un cambio de
 * tipo solo se acepta si se mantiene durante `duracionMinimaSegundos`. El tramo
 * empieza a contar desde el primer punto de ese cambio sostenido, no desde que
 * se confirma.
 *
 * Con el barco parado (amarrado, esperando la salida, a la deriva) el TWA es
 * ruido, así que por debajo de `velocidadMinimaNudos` los puntos tampoco
 * deciden: si no, media hora de espera se colaría como un tramo.
 *
 * @param {Array} puntos - ruta completa; cada punto necesita `twa`, `sog` y `segundos`
 * @returns {Array|null} tramos en orden cronológico, o null si no hay datos de viento
 */
export function detectarTramos(puntos, { umbralCenida = 70, umbralPopa = 110, duracionMinimaSegundos = 60, velocidadMinimaNudos = 1.5 } = {}) {
    const hayViento = puntos.some(p => p.twa !== null && p.twa !== undefined && !isNaN(p.twa));
    if (!hayViento) return null;

    const tramos = [];
    let tipoActual = null;    // tipo del tramo abierto ahora mismo
    let inicioActual = 0;     // índice donde empezó ese tramo
    let candidato = null;     // tipo que está intentando imponerse
    let candidatoDesde = 0;   // índice donde apareció el candidato
    let ultimoDecisivo = 0;   // último punto que sí dijo algo (cierra el tramo final)

    for (let i = 0; i < puntos.length; i++) {
        const twa = puntos[i].twa;
        if (twa === null || twa === undefined || isNaN(twa)) continue;

        const sog = puntos[i].sog;
        if (typeof sog === 'number' && !isNaN(sog) && sog < velocidadMinimaNudos) continue;

        const angulo = Math.abs(twa);
        let tipo;
        if (angulo <= umbralCenida) tipo = 'cenida';
        else if (angulo >= umbralPopa) tipo = 'popa';
        else continue;                      // través: ni confirma ni desmiente

        ultimoDecisivo = i;

        if (tipo === tipoActual) {          // seguimos como estábamos
            candidato = null;
            continue;
        }
        if (tipo !== candidato) {           // empieza a insinuarse un cambio
            candidato = tipo;
            candidatoDesde = i;
            continue;
        }
        if (puntos[i].segundos - puntos[candidatoDesde].segundos < duracionMinimaSegundos) continue;

        // Cambio sostenido: cerramos el tramo anterior justo antes de que empezara.
        if (tipoActual !== null) {
            tramos.push(construirTramo(puntos, tipoActual, inicioActual, Math.max(inicioActual, candidatoDesde - 1)));
        }
        tipoActual = tipo;
        inicioActual = candidatoDesde;
        candidato = null;
    }

    if (tipoActual !== null) {
        tramos.push(construirTramo(puntos, tipoActual, inicioActual, Math.max(inicioActual, ultimoDecisivo)));
    }

    // Numeración por tipo: Upwind 1, Upwind 2… y Downwind 1, Downwind 2…
    let nCenida = 0, nPopa = 0;
    for (const tramo of tramos) {
        tramo.numero = tramo.tipo === 'cenida' ? ++nCenida : ++nPopa;
        tramo.nombre = (tramo.tipo === 'cenida' ? 'Upwind ' : 'Downwind ') + tramo.numero;
    }

    return tramos;
}

function construirTramo(puntos, tipo, indiceInicio, indiceFin) {
    const pInicio = puntos[indiceInicio];
    const pFin = puntos[indiceFin];
    const duracion = pFin.segundos - pInicio.segundos;
    return {
        tipo,
        indiceInicio,
        indiceFin,
        tiempoInicio: pInicio.tiempoFormateado,
        tiempoFin: pFin.tiempoFormateado,
        duracionSegundos: duracion,
        duracionFormateada: formatearReloj(duracion),
        distanciaNm: Math.max(parseFloat(pFin.distancia) - parseFloat(pInicio.distancia), 0)
    };
}

/**
 * Cuenta viradas y trasluchadas de forma temporal estable.
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
            j = i; 
        }
    }

    return huboDatosViento ? { viradas, trasluchadas } : null;
}