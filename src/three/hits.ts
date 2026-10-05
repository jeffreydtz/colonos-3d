/**
 * Volumen de toque. Un círculo plano de r 0,34 queda en ~14 px en el celu y
 * un rayo rasante (cámara ~44°) no lo corta. La esfera cabe entre vértices
 * (distancia = S = 1,05) y la caja de la arista tiene alto de verdad.
 */
export const VERTEX_HIT_R = 0.48;
/** Por encima de TILE_TOP, para ganar el raycast a la loseta y al camino. */
export const VERTEX_HIT_LIFT = 0.15;
export const EDGE_HIT_W = 0.46;
export const EDGE_HIT_H = 0.32;
