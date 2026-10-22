// bids-fit.js - Ajuste de alcance (PURO): compara el texto del alcance contra los oficios de la empresa.
// Palabras clave EN/ES, sin acentos y con límites de palabra. Tres grupos:
//   relevantes (la empresa lo hace; electricidad solo por subcontrato), fuera de alcance, sin clasificar.
import { tr } from './i18n.js';

/** Quita acentos, pasa a minúsculas y deja solo letras/números separados por un espacio. */
export function normalizar(s) {
  return ' ' + String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
}
const N = (a) => a.map((x) => normalizar(x).trim());

// hace: true = oficio de la empresa; sub: solo por subcontrato. cat = categoría del catálogo para sugerir partidas.
export const OFICIOS = [
  { key: 'paint', hace: true, cat: 'pintura', es: 'Pintura y recubrimientos', en: 'Paints and coatings',
    kw: N(['paints and coatings', 'paint and coating', 'painting', 'paint', 'coatings', 'coating', 'pintura', 'pinturas', 'pintar', 'recubrimientos', 'recubrimiento']) },
  { key: 'drywall', hace: true, cat: 'drywall', es: 'Drywall (yeso)', en: 'Gypsum drywall',
    kw: N(['gypsum drywall', 'drywall', 'gypsum board', 'gypsum', 'sheetrock', 'tablaroca', 'tabla roca', 'paneles de yeso', 'panel de yeso', 'yeso']) },
  { key: 'flooring', hace: true, cat: 'pisos', es: 'Pisos resilientes / alfombra', en: 'Resilient flooring / carpet',
    kw: N(['resilient flooring', 'flooring', 'floor covering', 'lvp', 'luxury vinyl', 'vinyl plank', 'vinyl flooring', 'vct', 'carpet', 'carpeting', 'laminate flooring', 'laminate', 'piso', 'pisos', 'alfombra', 'alfombras', 'piso vinilico']) },
  { key: 'tile', hace: true, cat: 'pisos', es: 'Tile (cerámica / porcelana)', en: 'Hard tile',
    kw: N(['hard tile', 'ceramic tile', 'porcelain tile', 'tile', 'tiles', 'tiling', 'porcelain', 'azulejo', 'azulejos', 'baldosa', 'baldosas']),
    quitar: N(['acoustical ceiling tile', 'acoustic ceiling tile', 'ceiling tile', 'acoustical tile', 'acoustic tile', 'roof tile', 'tile roof', 'tile roofing']) },
  { key: 'carpentry', hace: true, cat: 'otros', es: 'Carpintería de acabado / millwork', en: 'Finish carpentry / millwork',
    kw: N(['finish carpentry', 'trim carpentry', 'millwork', 'casework', 'cabinetry', 'cabinets', 'cabinet', 'carpinteria de acabado', 'carpinteria de acabados', 'carpinteria fina', 'molduras', 'gabinetes']) },
  { key: 'decks', hace: true, cat: 'deck', es: 'Decks (terrazas de madera)', en: 'Decks',
    kw: N(['decks', 'deck', 'decking', 'terraza de madera', 'terrazas de madera']),
    quitar: N(['roof decking', 'roof deck', 'metal decking', 'metal deck', 'steel decking', 'steel deck', 'floor deck', 'deck drain']) },
  { key: 'bathkitchen', hace: true, cat: 'remodelacion', es: 'Baños y cocinas', en: 'Bathrooms / kitchens',
    kw: N(['bathrooms', 'bathroom', 'kitchens', 'kitchen', 'bano', 'banos', 'cocina', 'cocinas']) },
  { key: 'electrical', hace: true, sub: true, cat: 'electricidad', es: 'Electricidad (solo subcontrato)', en: 'Electrical (subcontract only)',
    kw: N(['electrical', 'electrician', 'electricidad', 'electrico', 'electrica', 'electricos', 'electricista']) },

  { key: 'roughcarp', hace: false, es: 'Carpintería gruesa / framing', en: 'Rough carpentry / framing', kw: N(['rough carpentry', 'framing', 'carpinteria gruesa']) },
  { key: 'earthwork', hace: false, es: 'Movimiento de tierra', en: 'Earthwork', kw: N(['earthwork', 'excavation', 'excavating', 'grading', 'movimiento de tierra', 'excavacion', 'nivelacion']) },
  { key: 'demolition', hace: false, es: 'Demolición', en: 'Demolition', kw: N(['site demolition', 'building demolition', 'demolition', 'demolicion']) },
  { key: 'steel', hace: false, es: 'Acero estructural', en: 'Structural steel', kw: N(['structural steel', 'steel erection', 'steel joists', 'miscellaneous metals', 'metal fabrication', 'acero estructural', 'estructura metalica']) },
  { key: 'concrete', hace: false, es: 'Concreto / mampostería', en: 'Concrete / masonry', kw: N(['cast in place concrete', 'site concrete', 'polished concrete', 'concrete', 'precast', 'masonry', 'curbs', 'walks', 'sidewalks', 'concreto', 'hormigon', 'mamposteria', 'aceras']) },
  { key: 'roofing', hace: false, es: 'Techos (roofing)', en: 'Roofing', kw: N(['roofing', 'roof accessories', 'roofs', 'roof', 'single ply membrane', 'techumbre', 'techado', 'tejado']) },
  { key: 'plumbing', hace: false, es: 'Plomería', en: 'Plumbing', kw: N(['plumbing', 'plomeria', 'fontaneria']) },
  { key: 'hvac', hace: false, es: 'HVAC / aire acondicionado', en: 'HVAC', kw: N(['hvac', 'air conditioning', 'heating', 'ventilation', 'refrigeration', 'mechanical', 'aire acondicionado', 'climatizacion']) },
  { key: 'fire', hace: false, es: 'Protección contra incendios', en: 'Fire protection / alarm', kw: N(['fire protection', 'fire alarm', 'fire sprinkler', 'fire extinguishers', 'fire extinguisher', 'fireproofing', 'sprinklers', 'sprinkler', 'proteccion contra incendios', 'alarma contra incendio', 'rociadores', 'extintores']) },
  { key: 'paving', hace: false, es: 'Pavimentación / asfalto', en: 'Paving / asphalt', kw: N(['asphalt paving', 'asphalt striping', 'paving', 'asphalt', 'striping', 'pavimento', 'pavimentacion', 'asfalto']) },
  { key: 'sitework', hace: false, es: 'Obra civil / paisajismo', en: 'Sitework / landscaping', kw: N(['erosion control', 'site utilities', 'soil treatment', 'site furnishings', 'landscaping', 'irrigation', 'site work', 'sitework', 'paisajismo', 'jardineria', 'riego']) },
  { key: 'envelope', hace: false, es: 'Aislamiento / impermeabilización / EIFS', en: 'Insulation / waterproofing / EIFS', kw: N(['foamed in place insulation', 'building insulation', 'insulation', 'waterproofing', 'eifs', 'aislamiento', 'impermeabilizacion']) },
  { key: 'vertical', hace: false, es: 'Elevadores / lifts', en: 'Elevators / lifts', kw: N(['elevators', 'elevator', 'lifts', 'ascensores', 'elevadores']) },
];

const reKw = (kw) => new RegExp('(?: )' + kw + '(?:s|es)?(?= )');
function coincidencias(textoN, oficio) {
  let t = textoN;
  for (const q of oficio.quitar || []) t = t.split(' ' + q + ' ').join(' ');
  const out = [];
  for (const kw of oficio.kw) if (reKw(kw).test(t)) out.push(kw);
  // Si un kw largo ya contiene al corto (p.ej. "paint" dentro de "paints and coatings"), conserva el largo.
  return out.filter((a) => !out.some((b) => b !== a && b.includes(a)));
}

/** Separa el alcance en ítems (comas, punto y coma, saltos de línea, viñetas). */
export function itemsAlcance(texto) {
  return String(texto ?? '').split(/[\n;•·]|,(?![^(]*\))/).map((x) => x.replace(/^[\s\-*]+/, '').trim()).filter(Boolean);
}

/**
 * analizarAlcance(texto) -> {
 *   vacio, relevantes[{key,es,en,sub,cat,coincidencias[]}], fuera[...], sinClasificar[string],
 *   veredicto: 'vacio' | 'sub' | 'no-encaja', soloSub: bool }
 */
export function analizarAlcance(texto) {
  const items = itemsAlcance(texto);
  const res = { vacio: !items.length, relevantes: [], fuera: [], sinClasificar: [], veredicto: 'vacio', soloSub: false };
  if (!items.length) return res;
  const todo = normalizar(items.join(' , '));
  for (const o of OFICIOS) {
    const c = coincidencias(todo, o);
    if (!c.length) continue;
    const e = { key: o.key, es: o.es, en: o.en, sub: !!o.sub, cat: o.cat || null, coincidencias: c };
    (o.hace ? res.relevantes : res.fuera).push(e);
  }
  const clasif = (it) => OFICIOS.some((o) => coincidencias(normalizar(it), o).length);
  const vistos = new Set();
  for (const it of items) { const k = it.toLowerCase(); if (!vistos.has(k) && !clasif(it)) { vistos.add(k); res.sinClasificar.push(it); } }
  const propios = res.relevantes.filter((r) => !r.sub);
  res.soloSub = res.relevantes.length > 0 && !propios.length;
  res.veredicto = propios.length ? 'sub' : 'no-encaja';
  return res;
}

export const nombreOficio = (o, lang) => (lang === 'en' ? o.en : o.es);

/** Nota clara para mostrar al usuario. */
export function notaAjuste(res, lang = 'es') {
  if (res.veredicto === 'vacio') return tr(lang, 'bid.fit.empty');
  if (res.veredicto === 'sub') {
    const lista = res.relevantes.map((r) => nombreOficio(r, lang)).join('; ');
    return tr(lang, 'bid.fit.sub', lista);
  }
  return res.soloSub ? tr(lang, 'bid.fit.onlySub') : tr(lang, 'bid.fit.no');
}
