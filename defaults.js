// defaults.js - Valores iniciales (TODOS ESTIMADOS: reemplazar con facturas reales).
// Dinero en centavos; porcentajes en puntos base (bp).

const F = 'Estimado inicial (rango de mercado); reemplazar con facturas reales';
const E = (o) => ({ estimado: true, fuente: F, ...o });

export function catalogoInicial() {
  return {
    version: 1,
    tarifas: [
      E({ id: 'pintor', nombre: 'Pintor', cents: 2400, p10: 1800, p90: 3300, unidad: 'h' }),
      E({ id: 'ayudante', nombre: 'Ayudante / preparación', cents: 1800, p10: 1500, p90: 2200, unidad: 'h' }),
      E({ id: 'instalador', nombre: 'Instalador pisos / carpintero', cents: 2800, p10: 2200, p90: 3600, unidad: 'h' }),
      E({ id: 'drywall', nombre: 'Colgador / acabador drywall', cents: 2600, p10: 2000, p90: 3400, unidad: 'h' }),
    ],
    materiales: [
      E({ id: 'pintura', nombre: 'Pintura premium', unidad: 'gal', cents: 7000, min: 5500, max: 8500, cobertura: 375 }),
      E({ id: 'primer', nombre: 'Primer / sellador', unidad: 'gal', cents: 3000, min: 2200, max: 4000, cobertura: 300 }),
      E({ id: 'drywall-hoja', nombre: 'Drywall 4x8 de 1/2"', unidad: 'hoja', cents: 1600, min: 1200, max: 2000, desperdicioBp: 1000 }),
      E({ id: 'drywall-insumos', nombre: 'Compuesto, cinta y tornillos', unidad: 'ft²', cents: 18, min: 12, max: 30 }),
      E({ id: 'compuesto', nombre: 'Compuesto de acabado', unidad: 'ft²', cents: 10, min: 6, max: 18 }),
      E({ id: 'lvp', nombre: 'Piso LVP (solo material)', unidad: 'ft²', cents: 250, min: 150, max: 450, desperdicioBp: 1000 }),
      E({ id: 'laminado', nombre: 'Piso laminado (solo material)', unidad: 'ft²', cents: 200, min: 120, max: 350, desperdicioBp: 1000 }),
      E({ id: 'tile', nombre: 'Tile (solo material)', unidad: 'ft²', cents: 400, min: 200, max: 900, desperdicioBp: 1200 }),
      E({ id: 'tile-insumos', nombre: 'Mortero y lechada', unidad: 'ft²', cents: 150, min: 100, max: 250 }),
      E({ id: 'deck-trat', nombre: 'Deck madera tratada (materiales)', unidad: 'ft²', cents: 500, min: 300, max: 800, desperdicioBp: 1000 }),
      E({ id: 'masilla', nombre: 'Masilla, cinta y lijas (pintura)', unidad: 'ft²', cents: 3, min: 2, max: 6 }),
      E({ id: 'baño-mat', nombre: 'Materiales baño (asignación global)', unidad: 'asig.', cents: 150000, min: 80000, max: 400000 }),
      E({ id: 'cocina-mat', nombre: 'Materiales cocina (asignación global)', unidad: 'asig.', cents: 600000, min: 300000, max: 1500000 }),
    ],
    dificultades: [
      E({ id: 'normal', nombre: 'Normal (piso)', multBp: 10000 }),
      E({ id: 'escalera', nombre: 'Escalera / techos altos', multBp: 11500 }),
      E({ id: 'andamio', nombre: 'Andamio / fachada alta', multBp: 13000 }),
    ],
    // Partidas ("assemblies"). unidad: ft2, lf, ea, asig
    partidas: [
      E({ id: 'pint-int-paredes', cat: 'pintura', nombre: 'Pintura interior - paredes', nameEn: 'Interior painting - walls', unidad: 'ft²',
        pintura: { materialId: 'pintura', primerId: 'primer', manos: 2, cobertura: 375 }, materiales: [{ id: 'masilla', porUnidad: 1 }],
        mano: { tarifaId: 'pintor', productividad: 200 } }),
      E({ id: 'pint-int-techo', cat: 'pintura', nombre: 'Pintura interior - techos', nameEn: 'Interior painting - ceilings', unidad: 'ft²',
        pintura: { materialId: 'pintura', primerId: 'primer', manos: 2, cobertura: 375 },
        mano: { tarifaId: 'pintor', productividad: 150 } }),
      E({ id: 'pint-trim', cat: 'pintura', nombre: 'Pintura de molduras (trim)', nameEn: 'Trim painting', unidad: 'lf',
        pintura: { materialId: 'pintura', primerId: 'primer', manos: 2, cobertura: 375 }, // 1 lf ~ 0.5 ft² de superficie
        materiales: [], conversionArea: 0.5,
        mano: { tarifaId: 'pintor', productividad: 60 } }),
      E({ id: 'pint-puerta', cat: 'pintura', nombre: 'Pintura de puertas (por unidad)', nameEn: 'Door painting (each)', unidad: 'ea',
        pintura: { materialId: 'pintura', primerId: 'primer', manos: 2, cobertura: 375 }, conversionArea: 40,
        mano: { tarifaId: 'pintor', productividad: 0.5 } }),
      E({ id: 'pint-ext', cat: 'pintura', nombre: 'Pintura exterior', nameEn: 'Exterior painting', unidad: 'ft²',
        pintura: { materialId: 'pintura', primerId: 'primer', manos: 2, cobertura: 375 }, materiales: [{ id: 'masilla', porUnidad: 2 }],
        mano: { tarifaId: 'pintor', productividad: 150 } }),
      E({ id: 'dw-colgar', cat: 'drywall', nombre: 'Drywall - colgar', nameEn: 'Drywall - hanging', unidad: 'ft²',
        materiales: [{ id: 'drywall-hoja', porUnidad: 1 / 32, entero: true }, { id: 'drywall-insumos', porUnidad: 1 }],
        mano: { tarifaId: 'drywall', productividad: 100 } }),
      E({ id: 'dw-acabado', cat: 'drywall', nombre: 'Drywall - cinta y acabado', nameEn: 'Drywall - taping & finishing', unidad: 'ft²',
        materiales: [{ id: 'compuesto', porUnidad: 1 }], mano: { tarifaId: 'drywall', productividad: 60 } }),
      E({ id: 'dw-resane', cat: 'drywall', nombre: 'Drywall - resane de parches (por unidad)', nameEn: 'Drywall - patch repair (each)', unidad: 'ea',
        materiales: [{ id: 'compuesto', porUnidad: 4 }], mano: { tarifaId: 'drywall', productividad: 1.25 } }),
      E({ id: 'piso-lvp', cat: 'pisos', nombre: 'Piso LVP (instalado)', nameEn: 'LVP flooring (installed)', unidad: 'ft²',
        materiales: [{ id: 'lvp', porUnidad: 1 }], mano: { tarifaId: 'instalador', productividad: 40 } }),
      E({ id: 'piso-lam', cat: 'pisos', nombre: 'Piso laminado (instalado)', nameEn: 'Laminate flooring (installed)', unidad: 'ft²',
        materiales: [{ id: 'laminado', porUnidad: 1 }], mano: { tarifaId: 'instalador', productividad: 45 } }),
      E({ id: 'piso-tile', cat: 'pisos', nombre: 'Piso de tile (instalado)', nameEn: 'Tile flooring (installed)', unidad: 'ft²',
        materiales: [{ id: 'tile', porUnidad: 1 }, { id: 'tile-insumos', porUnidad: 1 }], mano: { tarifaId: 'instalador', productividad: 12 } }),
      E({ id: 'bano', cat: 'remodelacion', nombre: 'Baño - remodelación (por baño)', nameEn: 'Bathroom remodel (each)', unidad: 'ea',
        materiales: [{ id: 'baño-mat', porUnidad: 1 }], mano: { tarifaId: 'instalador', productividad: 0.025 },
        sub: { nombre: 'Plomería (subcontrato)', costoUnidadCents: 180000, markupBp: 1000 } }),
      E({ id: 'cocina', cat: 'remodelacion', nombre: 'Cocina - remodelación (por cocina)', nameEn: 'Kitchen remodel (each)', unidad: 'ea',
        materiales: [{ id: 'cocina-mat', porUnidad: 1 }], mano: { tarifaId: 'instalador', productividad: 0.0125 },
        sub: { nombre: 'Plomería y gabinetes (subcontrato)', costoUnidadCents: 350000, markupBp: 1000 } }),
      E({ id: 'deck', cat: 'deck', nombre: 'Deck de madera tratada', nameEn: 'Pressure-treated deck', unidad: 'ft²',
        materiales: [{ id: 'deck-trat', porUnidad: 1 }], mano: { tarifaId: 'instalador', productividad: 8 } }),
      E({ id: 'elec-punto', cat: 'electricidad', nombre: 'Electricidad - punto (subcontrato)', nameEn: 'Electrical - per point (subcontract)', unidad: 'ea',
        sub: { nombre: 'Electricista (subcontrato)', costoUnidadCents: 15000, markupBp: 1000 } }),
      E({ id: 'elec-hora', cat: 'electricidad', nombre: 'Electricidad - por hora (subcontrato)', nameEn: 'Electrical - hourly (subcontract)', unidad: 'h',
        sub: { nombre: 'Electricista (subcontrato)', costoUnidadCents: 9500, markupBp: 1000 } }),
      E({ id: 'otro-dumpster', cat: 'otros', nombre: 'Dumpster / basura', nameEn: 'Dumpster / debris removal', unidad: 'ea', otrosUnidadCents: 45000 }),
      E({ id: 'otro-equipo', cat: 'otros', nombre: 'Equipo / alquiler', nameEn: 'Equipment rental', unidad: 'ea', otrosUnidadCents: 15000 }),
      E({ id: 'otro-permiso', cat: 'otros', nombre: 'Permisos', nameEn: 'Permits', unidad: 'ea', otrosUnidadCents: 30000 }),
      E({ id: 'otro-movil', cat: 'otros', nombre: 'Movilización', nameEn: 'Mobilization', unidad: 'ea', otrosUnidadCents: 15000 }),
      E({ id: 'otro-limpieza', cat: 'otros', nombre: 'Limpieza final', nameEn: 'Final cleanup', unidad: 'ea', otrosUnidadCents: 20000 }),
    ],
  };
}

export const TXT_AVISO_GRAVAMEN_ES = 'SU CONTRATO PUEDE SER SUJETO A UN GRAVAMEN (CONSTRUCTION LIEN) SOBRE SU PROPIEDAD. AVISO: [TEXTO OFICIAL DE LA SECCIÓN 713.015, FLORIDA STATUTES, EN EL FORMATO EXIGIDO. PEGAR AQUÍ LA REDACCIÓN VIGENTE Y REVISARLA CON SU ABOGADO.]';
export const TXT_AVISO_GRAVAMEN_EN = 'ACCORDING TO FLORIDA\'S CONSTRUCTION LIEN LAW (SECTIONS 713.001-713.37, FLORIDA STATUTES), THOSE WHO WORK ON YOUR PROPERTY OR PROVIDE MATERIALS AND ARE NOT PAID IN FULL HAVE A RIGHT TO ENFORCE THEIR CLAIM FOR PAYMENT AGAINST YOUR PROPERTY. THIS CLAIM IS KNOWN AS A CONSTRUCTION LIEN. [PASTE THE CURRENT OFFICIAL TEXT OF SECTION 713.015 HERE AND REVIEW IT WITH YOUR ATTORNEY.]';
export const TXT_RECOVERY_ES = 'Declaración del Fondo de Recuperación (FL 489.1425): [PEGAR AQUÍ LA REDACCIÓN VIGENTE Y REVISARLA CON SU ABOGADO. Por ejemplo: "PAGO DEL FONDO DE RECUPERACIÓN ESTATAL..."]';
export const TXT_RECOVERY_EN = 'Florida Homeowners\' Construction Recovery Fund statement (FL 489.1425): [PASTE THE CURRENT OFFICIAL TEXT HERE AND REVIEW IT WITH YOUR ATTORNEY.]';

export function ajustesIniciales() {
  return {
    empresa: {
      nombre: 'All In One Painting & Remodeling Group LLC',
      telefono: '904-855-9635', email: '', licencia: '', direccion: 'Jacksonville, FL',
    },
    impuestoVentasBp: 750,       // Duval 7.5% = 6% estatal + 1.5% local
    burdenBp: 3000,              // 30% FICA + seguros + workers comp
    overheadBp: 1200,
    garantiaBp: 100,
    contingenciaBp: 500,
    contingenciaAltaBp: 1000,
    margenPisoBp: 3500,
    margenObjetivoBp: 4000,
    impuestoNetoBp: 2500,        // supuesto, confirmar con contador
    areaPuerta: 21, areaVentana: 15,
    validezDias: 30,
    hitosBp: [1000, 5000, 4000],
    hitosNombres: { es: ['Depósito al firmar', 'Inicio / a mitad de obra', 'Al terminar'], en: ['Deposit at signing', 'Midpoint of work', 'Upon completion'] },
    garantia: {
      es: 'Garantía de mano de obra de 1 año desde la terminación. No cubre desgaste normal, daños por humedad, ni defectos de materiales provistos por el cliente.',
      en: 'One-year workmanship warranty from completion. Does not cover normal wear, moisture damage, or defects in client-supplied materials.',
    },
    changeOrders: {
      es: 'Cualquier cambio al alcance se documentará por escrito (orden de cambio) con su precio y ajuste de plazo, y deberá ser firmado por ambas partes antes de ejecutarse.',
      en: 'Any change to the scope will be documented in writing (change order) with its price and schedule adjustment, and must be signed by both parties before the work is performed.',
    },
    exclusiones: {
      es: 'Excluye, salvo que se indique: reparación de daños ocultos (madera podrida, moho, asbesto, plomo), permisos no listados, muebles y mudanza, y trabajo eléctrico o de plomería no listado.',
      en: 'Excludes unless listed: repair of hidden damage (rot, mold, asbestos, lead), permits not listed, furniture moving, and electrical or plumbing work not listed.',
    },
    avisoGravamen: { es: TXT_AVISO_GRAVAMEN_ES, en: TXT_AVISO_GRAVAMEN_EN },
    avisoRecovery: { es: TXT_RECOVERY_ES, en: TXT_RECOVERY_EN },
    avisoEpa: {
      es: 'Aviso EPA (RRP): en viviendas construidas antes de 1978 aplica la norma federal de renovación segura con plomo; se requiere contratista certificado y entrega del folleto al cliente.',
      en: 'EPA notice (RRP): homes built before 1978 are subject to the federal Lead-Safe Renovation rule; a certified renovator and delivery of the pamphlet to the client are required.',
    },
    emailsPermitidos: ['', '', ''],
    idiomaPdfDefault: 'en',
  };
}
