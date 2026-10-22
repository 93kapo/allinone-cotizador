// plan-cantidades-ejemplo.js - Archivo de cantidades de PRUEBA, marcado EJEMPLO. Todo es ficticio: no hay datos reales de terceros.
// Se exporta desde un módulo (en el SHELL del service worker) para que "Cargar ejemplo" funcione sin conexión;
// tests/fixtures/plan-cantidades-EJEMPLO.json es la misma copia y un test comprueba que no se separen.
const F = (pagina, bbox, texto_literal, metodo) => ({ pagina, bbox, texto_literal, metodo });
export const EJEMPLO_PLAN = {
  version: 1,
  plano: {
    archivo: 'EJEMPLO-plano-ficticio.pdf',
    sha256: '0000000000000000000000000000000000000000000000000000000000000000',
    revision: 'EJEMPLO Rev 0', fecha: '2026-01-01', addenda: 'EJEMPLO: sin addenda',
  },
  hojas: [
    { pagina: 1, numero: 'A1.1', titulo: 'EJEMPLO - Planta baja', escala_texto: '1/4" = 1\'-0"', escala_verificada: true },
    { pagina: 2, numero: 'A2.2', titulo: 'EJEMPLO - Cuadro de acabados', escala_texto: 'Sin escala', escala_verificada: false },
  ],
  cuartos: [
    { nombre: 'EJEMPLO Sala', numero: '101',
      area_sf: { valor: 168, fuente: F(2, [72, 310, 180, 322], 'SALA 101 - 168 SF', 'tabla_pdf'), confianza: 'alta' },
      perimetro_lf: { valor: 52, fuente: F(1, [210, 140, 330, 260], '(medido en el dibujo)', 'vision'), confianza: 'media' },
      alto_techo_ft: { valor: 9, fuente: F(2, [72, 330, 180, 342], 'ALTO DE TECHO 9\'-0"', 'tabla_pdf'), confianza: 'alta' },
      acabados: { piso: 'LVP', zocalo: 'Madera 4"', muros: 'Pintura', techo: 'Drywall pintado' } },
    { nombre: 'EJEMPLO Cocina', numero: '102',
      area_sf: { valor: 120, fuente: F(1, [340, 140, 450, 250], '(medido en el dibujo)', 'vision'), confianza: 'baja' },
      perimetro_lf: { valor: 44, fuente: F(1, [340, 140, 450, 250], '(medido en el dibujo)', 'vision'), confianza: 'baja' },
      alto_techo_ft: { valor: 9, fuente: F(2, [72, 350, 180, 362], 'ALTO DE TECHO 9\'-0"', 'tabla_pdf'), confianza: 'alta' },
      acabados: { piso: 'Tile', zocalo: 'Tile 4"', muros: 'Pintura', techo: 'Drywall pintado' } },
  ],
  conteos: [
    { tipo: 'Puerta', marca: 'D1', cantidad: { valor: 6, fuente: F(2, [400, 310, 470, 322], 'D1 ... 6', 'tabla_pdf'), confianza: 'alta' }, detalle: 'EJEMPLO: puerta interior 3\'-0"' },
    { tipo: 'Ventana', marca: 'W2', cantidad: { valor: 4, fuente: F(1, [100, 80, 160, 100], 'W2', 'vision'), confianza: 'media' }, detalle: 'EJEMPLO: ventana fija' },
  ],
  muros: [
    { tipo: 'EJEMPLO Muro interior tipo A', lf: { valor: 180, fuente: F(1, [60, 120, 480, 280], '(suma de tramos medidos)', 'vision'), confianza: 'media' },
      alto_ft: { valor: 9, fuente: F(2, [72, 330, 180, 342], 'ALTO 9\'-0"', 'texto_pdf'), confianza: 'alta' }, capas: '1 capa de drywall 1/2" por cada lado' },
  ],
  partidas_sugeridas: [
    { oficio: 'pintura', cantidad: { valor: 1560, fuente: F(2, [72, 380, 300, 392], 'MUROS A PINTAR', 'supuesto'), confianza: 'media' }, unidad: 'sf',
      formula: 'lf de muros x alto - puertas y ventanas', partida_id: 'pint-int-paredes',
      insumos: [{ nombre: 'Pintura', unidad: 'gal', cantidad: { valor: 9, fuente: F(2, [72, 400, 300, 412], 'COBERTURA 375 SF/GAL x 2 MANOS', 'supuesto'), confianza: 'media' } }] },
    { oficio: 'drywall', cantidad: { valor: 1620, fuente: F(2, [72, 420, 300, 432], 'DRYWALL 1620 SF', 'tabla_pdf'), confianza: 'alta' }, unidad: 'sf',
      formula: 'lf de muros x alto x 2 lados', partida_id: 'dw-colgar', insumos: [] },
    { oficio: 'pisos', cantidad: { valor: 288, fuente: F(1, [210, 140, 450, 260], '(suma de areas de cuartos)', 'vision'), confianza: 'baja' }, unidad: 'sf',
      formula: 'area sala + area cocina', partida_id: 'piso-lvp', insumos: [] },
  ],
  supuestos: ['EJEMPLO: se descontaron puertas y ventanas con el area estandar del catalogo.', 'EJEMPLO: la escala de la hoja A2.2 no esta indicada.'],
  dudas: ['EJEMPLO: la cocina lleva tile o LVP? El cuadro de acabados no es claro.'],
};
