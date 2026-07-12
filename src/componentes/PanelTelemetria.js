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
    document.getElementById('val-vmedio').innerText = punto.sog.toFixed(1) + " kts";
    document.getElementById('val-vmax').innerText = Math.round(punto.curso).toString().padStart(3, '0') + "°";
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
