// pintura-datos.js - Datos iniciales del flujo de pintura. SIN DOM. Dinero en centavos; porcentajes en puntos base (bp) salvo que se diga.
// REGLA: todo dato lleva su fuente. `estimado: true` = no hay fuente oficial (la interfaz lo marca "estimado"). Lo que NO se pudo confirmar
// se deja VACÍO (null) para que lo escriba el dueño; nunca se inventa. Todo es editable en el proyecto.

const SW = 'https://www.sherwin-williams.com/document/PDS/en/';
export const FUENTE_SW = 'Sherwin-Williams, hoja técnica (PDS)';
export const COND_REFERENCIA = { tempF: 77, humedadPct: 50, minAplicarF: 50, lluviaExteriorH: [2, 3] };

/**
 * Productos con ficha técnica oficial (Sherwin-Williams). Campos:
 *  secoH {min,max}: horas hasta seco al tacto; recoatH: horas para repintar (77 F, 50 % HR);
 *  recoatFrioH: valor LENTO de la ficha con 35-45 F (null = la ficha no lo da; se usa recoatH);
 *  cobMin/cobMax: ft² por galón (en el cálculo se usa el MÍNIMO, conservador); cobRugosa: ft²/gal en superficie rugosa;
 *  manos: manos de acabado; manosNueva: si cambia en superficie nueva; manosPrimer: manos de primer que pide la ficha.
 */
export const PRODUCTOS = [
  { id: 'promar200', nombre: 'ProMar 200 Zero VOC Interior Flat', uso: 'interior', secoH: { min: 1, max: 1 }, recoatH: 4, recoatFrioH: null, cobMin: 350, cobMax: 400, manos: 2, manosPrimer: 0, fuente: SW + '035777433768/' },
  { id: 'superpaint-int', nombre: 'SuperPaint Interior Flat', uso: 'interior', secoH: { min: 1, max: 1 }, recoatH: 4, recoatFrioH: null, cobMin: 350, cobMax: 400, manos: 2, manosPrimer: 0, fuente: SW + '035777309247/' },
  { id: 'duration-home-int', nombre: 'Duration Home Interior Matte', uso: 'interior', secoH: { min: 1, max: 1 }, recoatH: 4, recoatFrioH: null, cobMin: 350, cobMax: 400, manos: 2, manosPrimer: 0, fuente: SW + '035777005460/' },
  { id: 'emerald-int-matte', nombre: 'Emerald Interior Matte', uso: 'interior', secoH: { min: 1, max: 1 }, recoatH: 4, recoatFrioH: null, cobMin: 350, cobMax: 400, manos: 2, manosPrimer: 0, fuente: SW + '035777194751' },
  { id: 'emerald-int-satin', nombre: 'Emerald Interior Satin', uso: 'interior', secoH: { min: 1, max: 1 }, recoatH: 4, recoatFrioH: null, cobMin: 350, cobMax: 400, manos: 2, manosPrimer: 0, fuente: SW + '035777254103' },
  { id: 'a100-ext', nombre: 'A-100 Exterior Low Sheen', uso: 'exterior', secoH: { min: 2, max: 2 }, recoatH: 4, recoatFrioH: 48, cobMin: 350, cobMax: 400, manos: 2, manosPrimer: 0, fuente: SW + '035777132005/' },
  { id: 'duration-ext-satin', nombre: 'Duration Exterior Satin', uso: 'exterior', secoH: { min: 1, max: 2 }, recoatH: 4, recoatFrioH: 48, cobMin: 250, cobMax: 300, manos: 1, manosNueva: 2, manosPrimer: 0, fuente: SW + '035777132654/' },
  { id: 'loxon-flat', nombre: 'Loxon Acrylic Coating Flat (mampostería/estuco)', uso: 'exterior', mamposteria: true, secoH: { min: 4, max: 4 }, recoatH: 24, recoatFrioH: null, cobMin: 200, cobMax: 200, cobRugosa: 80, manos: 2, manosPrimer: 1, primerNombre: 'Loxon', fuente: SW + '035777488256/' },
];
export const productoPorId = (id) => PRODUCTOS.find((p) => p.id === id) || null;
export const PRODUCTOS_INTERIOR = PRODUCTOS.filter((p) => p.uso === 'interior');
export const PRODUCTOS_EXTERIOR = PRODUCTOS.filter((p) => p.uso === 'exterior');
/** Productos SIN ficha confirmada: no se precargan. Se escriben con "Otro producto". */
export const SIN_FICHA = ['SuperPaint Exterior', 'Emerald Exterior', 'ProMar 400', 'Cashmere', 'PrepRite', 'ProBlock', 'epóxicos'];

/** Productividades iniciales. TODAS estimadas, sin fuente oficial. bajo/probable/alto = ft²/h (o lf/h; o h por cara en puertas). */
const EST = { estimado: true };
export const PRODUCTIVIDAD = {
  paredLisa: { ...EST, unidad: 'ft²/h por mano', bajo: 200, probable: 270, alto: 350, fuente: { nombre: 'blog PaintPricing 2026 (200-350 ft²/h)' } },
  paredTextura: { ...EST, unidad: 'ft²/h por mano', bajo: 75, probable: 110, alto: 150, fuente: { nombre: 'estimado (75-150 ft²/h)' } },
  techo: { ...EST, unidad: 'ft²/h por mano', bajo: 45, probable: 60, alto: 75, fuente: { nombre: 'ejemplo PaintScout (~60 ft²/h); el rango es una suposición' } },
  trim: { ...EST, unidad: 'lf/h', bajo: 19, probable: 25, alto: 31, fuente: { nombre: 'estimado (25 lf/h); el rango es una suposición' } },
  puerta: { ...EST, unidad: 'h por cara', bajo: 1.0, probable: 1.5, alto: 2.0, fuente: { nombre: 'estimado (1.5 h por cara de puerta con marco); el rango es una suposición' } },
  pulverizador: { ...EST, unidad: 'ft²/h por mano', bajo: 500, probable: 750, alto: 1000, fuente: { nombre: 'blog (hasta ~1,000 ft²/h); el rango es una suposición' } },
  comercial: { ...EST, unidad: 'ft²/h por mano', bajo: 150, probable: 225, alto: 300, fuente: { nombre: 'estimado, comercial grande (150-300 ft²/h)' } },
};
/** Preparación como % de las horas de pintura (20-40 %). Montaje, cubrir y limpieza: horas fijas por trabajo (estimadas). */
export const PREPARACION_PCT = { ...EST, bajo: 20, probable: 30, alto: 40, fuente: { nombre: 'estimado (preparación 20-40 %)' } };
export const HORAS_FIJAS = { ...EST, bajo: 4, probable: 6, alto: 8, fuente: { nombre: 'estimado (montaje, cubrir y limpieza)' } };
/** Factores que alargan el trabajo. mult = multiplicador de horas (1 = sin efecto); se acotan a [1, 2]. */
export const FACTORES = {
  altura: { ...EST, mult: 1.15, fuente: { nombre: 'igual a "Escalera / techos altos" del catálogo de la app (x1.15)' } },
  dificil: { ...EST, mult: 1.2, fuente: { nombre: 'estimado' } },
  acceso: { ...EST, mult: 1.1, fuente: { nombre: 'estimado' } },
};
/** Ocupado/nocturno: baja la productividad entre 20 y 40 % (horas x 1/(1-r)). */
export const OCUPADO_PCT = { ...EST, bajo: 20, probable: 30, alto: 40, fuente: { nombre: 'estimado (-20 a -40 % de productividad)' } };
export const LIMITE_FACTOR = { min: 1, max: 2 };
export const LIMITE_FACTOR_TOTAL = { min: 1, max: 2.5 };
export const ALTURA_FT = 10;
export const FT2_PUERTA_PINTAR = 40; // área a pintar por puerta (igual que el catálogo "Pintura de puertas")
export const FT2_POR_LF_TRIM = 0.5; // igual que el catálogo "Pintura de molduras"
export const CARAS_PUERTA = 2;

/** Cuadrilla: NO hay valor por defecto de personas ni de horas por día (las elige la persona en cada proyecto). */
export const CUADRILLA = {
  eficienciaPct: { ...EST, valor: 85, fuente: { nombre: 'estimado' } },
  ft2PorPersona: { ...EST, valor: 250, fuente: { nombre: 'estimado (1 persona por cada 250 ft² de pared)' } },
};
export const PLANTILLAS_CUARTO = {
  chico: { largo: 10, ancho: 10, alto: 8, puertas: 1, ventanas: 1 },
  mediano: { largo: 12, ancho: 14, alto: 8, puertas: 1, ventanas: 2 },
  grande: { largo: 16, ancho: 20, alto: 9, puertas: 2, ventanas: 3 },
};

/** Materiales: compra SIEMPRE All In One. Precios de LISTA (retail) que escribe el dueño; aquí no hay ninguno. */
export const MATERIALES_DEF = {
  desperdicioPct: { ...EST, valor: 10, fuente: { nombre: 'estimado' } },
  reservaPct: { ...EST, valor: 5, fuente: { nombre: 'estimado (si no se usa, es ganancia)' } },
};

/** Escenario B: mano de obra propia. */
export const SALARIO_REF = { cents: 2104, estimado: false, fuente: { nombre: 'BLS, mediana Jacksonville, mayo 2023 (salario de empleado, no de subcontratista)', url: 'https://www.bls.gov/oes/2023/May/oes_27260.htm' } };
export const CARGAS_DEF = {
  ficaBp: { valor: 765, fuente: { nombre: 'FICA 7.65 %' } },
  futaBp: { valor: 60, baseCents: 700000, fuente: { nombre: 'FUTA 0.6 % sobre los primeros $7,000 por empleado' } },
  sutaBp: { valor: 270, baseCents: 700000, estimado: true, fuente: { nombre: 'SUTA Florida 2.7 % (empleador nuevo); la tasa real la da el estado' } },
  compBp: { valor: null, fuente: { nombre: 'Compensación laboral clase 5474: SIN tasa confirmada; pregunte a su agente de seguros' } },
};
export const EQUIPOS_DEF = [
  { id: 'graco', nombre: 'Pulverizador Graco Magnum ProX19', precioCents: 75900, vidaH: 1500, usar: false, estimado: true, fuente: { nombre: 'precio de lista (retail); vida útil de 1,500 h es un supuesto' } },
];
export const ALQUILER_LIFT = { nombre: 'Lift de 26 ft (alquiler)', porDiaMin: 16200, porDiaMax: 25900, porSemanaMin: 34400, porSemanaMax: 58900, fuente: { nombre: 'dozr marketplace, Jacksonville' } };

/** Escenario A. Sin valores por defecto: no se inventan la tarifa interna ni el seguro. */
export const TARIFAS_SUB = [3500, 4000];

/** Ganancia sugerida por tamaño del trabajo (PROPUESTA SIN FUENTE: validar con sus trabajos). hastaCents: límite superior (exclusivo salvo el último). */
export const MARGEN_TAMANOS = [
  { id: 'chico', hastaCents: 300000, minBp: 4500, maxBp: 5000 },
  { id: 'mediano', hastaCents: 1000000, minBp: 4000, maxBp: 4500 },
  { id: 'grande', hastaCents: 5000000, incluyeHasta: true, minBp: 3500, maxBp: 4000 },
  { id: 'enorme', hastaCents: Infinity, minBp: 3000, maxBp: 3500 },
];

/** Retención sugerida en la orden de trabajo del subcontratista (editable; revisar con abogado). */
export const RETENCION_BP = 1000;

export const NOTA_REGLA_SECADO = 'Regla práctica derivada, NO del fabricante: la espera entre manos es el tiempo de repintar de la ficha; si cabe en la jornada, se repinta el mismo día; si no, se suma un día por mano adicional (24 h = 1 día; 24-48 h en frío = 1-2 días); en exteriores se suma 1 día extra por el clima.';
