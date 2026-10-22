// bids-ejemplo.js - Proyecto de PRUEBA marcado EJEMPLO (datos de la invitación recibida; cifras de costo inventadas).
// NO incluye el correo ni el teléfono directo del manager: la persona los pega después.
import { bidNuevo, lineaLibre } from './bids-calc.js';

export const ALCANCE_EJEMPLO = 'site demolition, building demolition, earthwork, erosion control, site utilities, asphalt paving, asphalt striping, curbs, walks, site furnishings, landscaping & irrigation, soil treatment, site concrete, cast-in place concrete, polished concrete, structural steel, steel erection, resilient flooring, rough carpentry, finish carpentry, millwork, countertops, waterproofing, foamed-in-place insulation, building insulation, fireproofing, EIFS, single-ply membrane roofing, metal roofing, roof accessories, join sealers and caulking, hollow metal doors and frames, wood doors, overhead doors, entrances & storefront, automatic entrances, gypsum drywall, hard tile, acoustical ceilings, paints and coatings, toilet partitions & accessories, wall & corner guards, signage, metal lockers, shelving, loading dock equipment, residential appliances, blinds, fire extinguishers, awnings & canopies, entrance mats, lifts, fire protection, plumbing, HVAC, electrical, fire alarm';
export const BREAKOUTS_EJEMPLO = ['Publix Building', 'Publix Front Façade', 'Publix Side and Rear Façade', 'Retail Shops', 'Site work', 'Phase 2 – Roadway Improvements'];
export const NOTA_EJEMPLO = 'EJEMPLO - cifras de prueba. Los datos del proyecto vienen de una invitación real; las cantidades y precios de las líneas son inventados solo para probar el flujo. El correo y el teléfono directo del contacto se dejan vacíos a propósito.';

/** Crea el bid de ejemplo. `ids` = generador de ids únicos (store.nuevoId). */
export function bidEjemplo({ id, ids, ajustes, catalogo, ahora = new Date() }) {
  const b = bidNuevo({ id, ajustes, catalogo, ahora });
  Object.assign(b, {
    ejemplo: true, estado: 'interesado',
    proyecto: 'Publix - Tower Square - Gainesville, FL (Scrape and Rebuild)', gc: 'T.D. Farrell Construction, Inc.',
    contacto: 'Todd Larkin', telefono: '(770) 751-5463 x1163', email: '',
    direccion: '5801 SW 75th Street', ciudad: 'Gainesville', estadoUS: 'FL', zip: '32608',
    fechaLimite: '2026-10-19T14:00', inicioEst: '2027-02-05', finEst: '2028-02-29',
    alcance: ALCANCE_EJEMPLO, notas: NOTA_EJEMPLO,
  });
  b.breakouts = BREAKOUTS_EJEMPLO.map((nombre) => ({ id: ids(), nombre }));
  const [edif, frente, lateral, locales] = b.breakouts.map((x) => x.id);
  const tarifa = catalogo.tarifas.find((t) => t.id === 'pintor')?.cents;
  const L = (extra) => ({ ...lineaLibre(ids(), 'paint', tarifa), ...extra });
  b.lineas = [
    L({ nombre: 'Interior painting - walls (cifras de prueba)', breakoutId: edif, cantidad: 18000, unidad: 'ft²', matCents: 22, productividad: 250 }),
    { id: ids(), oficio: 'paint', breakoutId: frente, modo: 'catalogo', partidaId: 'pint-ext', cantidad: 3500, unidad: 'ft²', dificultadId: 'andamio', nombre: '', nota: 'cifras de prueba' },
    { id: ids(), oficio: 'drywall', breakoutId: locales, modo: 'catalogo', partidaId: 'dw-colgar', cantidad: 6000, unidad: 'ft²', dificultadId: 'normal', nombre: '', nota: 'cifras de prueba' },
    { id: ids(), oficio: 'drywall', breakoutId: locales, modo: 'catalogo', partidaId: 'dw-acabado', cantidad: 6000, unidad: 'ft²', dificultadId: 'normal', nombre: '', nota: 'cifras de prueba' },
    L({ nombre: 'Tile - restrooms (cifras de prueba)', oficio: 'tile', breakoutId: lateral, cantidad: 900, unidad: 'ft²', matCents: 650, productividad: 12, tarifaCents: 2800 }),
  ];
  b.calif.exclusiones = 'Cifras de prueba: no usar para ofertar.';
  
  return b;
}
