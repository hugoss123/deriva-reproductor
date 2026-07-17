// PanelTelemetria.js — "La zona de emplatado"
// Único trabajo: escribir los numeritos en la pantalla. No sabe cómo se
// calcularon la velocidad, el rumbo o la distancia — solo los muestra.

/**
 * Actualiza el panel lateral con los datos de un punto de la ruta.
 * @param {{tiempoFormateado:string, distancia:string, sog:number, curso:number}} punto
 */
export function actualizarTelemetria(punto) {
    if (!punto) return;
    document.getElementById('val-duracion').innerText = punto.tiempoFormateado;
    document.getElementById('val-distancia').innerText = punto.distancia + " nm";
    document.getElementById('val-sog').innerText = punto.sog.toFixed(1) + " kts";
    document.getElementById('val-rumbo').innerText = Math.round(punto.curso).toString().padStart(3, '0') + "°";
}

/**
 * Muestra el número de viradas y trasluchadas de la regata.
 * @param {{viradas:number, trasluchadas:number}|null} maniobras - null si no hay datos de viento
 */
export function actualizarManiobras(maniobras) {
    document.getElementById('val-viradas').innerText = maniobras ? maniobras.viradas : "N/D";
    document.getElementById('val-trasluchadas').innerText = maniobras ? maniobras.trasluchadas : "N/D";
}

/**
 * Pinta el cuadro de tramos: cuántos hay de cada tipo y el listado en orden
 * cronológico (Upwind 1, Downwind 1, Upwind 2…).
 * @param {Array|null} tramos - null si el log no trae datos de viento
 */
export function actualizarTramos(tramos) {
    const lista = document.getElementById('lista-tramos');
    const conteoCenida = document.getElementById('conteo-cenida');
    const conteoPopa = document.getElementById('conteo-popa');
    lista.innerHTML = '';

    if (tramos === null) {
        conteoCenida.innerText = 'N/D';
        conteoPopa.innerText = 'N/D';
        lista.appendChild(mensajeVacio('Sin datos de viento: no se pueden identificar los tramos.'));
        return;
    }

    conteoCenida.innerText = tramos.filter(t => t.tipo === 'cenida').length;
    conteoPopa.innerText = tramos.filter(t => t.tipo === 'popa').length;

    if (tramos.length === 0) {
        lista.appendChild(mensajeVacio('No se ha reconocido ningún tramo de ceñida ni de popa.'));
        return;
    }

    for (const tramo of tramos) {
        const li = document.createElement('li');
        li.className = 'tramo ' + (tramo.tipo === 'cenida' ? 'tramo-cenida' : 'tramo-popa');

        const nombre = document.createElement('span');
        nombre.className = 'tramo-nombre';
        nombre.innerText = tramo.nombre;

        const datos = document.createElement('span');
        datos.className = 'tramo-datos';
        datos.innerText = `${tramo.tiempoInicio} → ${tramo.tiempoFin}\n${tramo.duracionFormateada} · ${tramo.distanciaNm.toFixed(2)} nm`;
        datos.style.whiteSpace = 'pre';

        li.append(nombre, datos);
        lista.appendChild(li);
    }
}

function mensajeVacio(texto) {
    const li = document.createElement('li');
    li.className = 'tramos-vacio';
    li.innerText = texto;
    return li;
}

/**
 * Actualiza el mensaje de estado del sistema (arriba a la izquierda).
 * @param {string} texto
 * @param {string} color - código de color CSS, p.ej. "#34d399"
 */
export function actualizarEstado(texto, color) {
    const estado = document.getElementById('estado-sistema');
    estado.innerText = texto;
    if (color) estado.style.color = color;
}
