// pintura.js - Flujo guiado SOLO de pintura (#/pintura/:id/:paso, 5 pasos). Crea una cotización normal (q.tipo = 'pintura') que reutiliza
// store.js, engine.calcularCotizacion y pdf.js. Los números salen de pintura-motor.js (puro). La app NUNCA envía nada: solo descarga borradores.
// El flujo es dueño de q.lineas: las regenera con el escenario elegido cada vez que algo cambia.
import { h, clear, add, usd, num, pct1, descargar } from './util.js';
import { t, getLang } from './i18n.js';
import { S } from './state.js';
import * as store from './store.js';
import { field, checkField, toast, sheet, aviso, guardadoOk, registrarGuardado, borrarConDeshacer } from './ui.js';
import { snapshotCatalogo, puedeGenerarPdf, TEXTO_CONFIRMACION, aCentavos, medirCuarto, calcularCotizacion, BP } from './engine.js';
import { enPapelera, sacarDePapelera } from './papelera.js';
import * as M from './pintura-motor.js';
import * as D from './pintura-datos.js';
import { generarPdfCliente, generarPdfInterno, generarPdfOrdenTrabajo } from './pdf.js';

let _medir = null;
if (typeof window !== 'undefined') window.addEventListener('resize', () => _medir?.());
const PASOS = ['1', '2', '3', '4', '5'];
const TITULO_PASO = { 1: 'pint.step1', 2: 'pint.step2', 3: 'pint.step3', 4: 'pint.step4', 5: 'pint.step5' };

/** Cotización nueva de pintura (misma forma que la normal + q.tipo y q.pintura; solo se AÑADEN campos). */
export async function crearCotizacionPintura() {
  const todas = await store.listarCotizaciones();
  const y = new Date().getFullYear();
  const n = todas.filter((q) => (q.numero || '').includes('-' + y + '-')).length + 1;
  const aj = S.ajustes;
  const q = {
    id: store.nuevoId(), numero: `AIO-${y}-${String(n).padStart(3, '0')}`, tipo: 'pintura', estado: 'borrador', creado: new Date().toISOString(),
    cliente: { nombre: '', telefono: '', email: '', direccion: '', notas: '', anio: '' }, esRemodelacion: false,
    idiomaPdf: aj.idiomaPdfDefault || 'en', cuartos: [], lineas: [], planos: [], medidas: [],
    margenBp: aj.margenObjetivoBp, contingenciaBp: 0, contManual: true, hitosBp: [...aj.hitosBp], validezDias: aj.validezDias,
    snapshot: snapshotCatalogo(S.catalogo, S.ajustes), pintura: M.pinturaInicial(aj),
  };
  await store.saveCotizacion(q);
  return q;
}

// ---------- Piezas de interfaz ----------
const num1 = (n) => num(n, 1);
/** Campo numérico que puede quedar VACÍO (null = sin dato). */
const campoNum = (label, valor, onNum, { hint, step = 'any', min = '0' } = {}) =>
  field({ label, type: 'number', inputmode: 'decimal', step, min, value: valor == null ? '' : valor, hint, onInput: (x) => onNum(x === '' ? null : Math.max(0, parseFloat(x) || 0)) });
const campoDinero = (label, cents, onCents, opts = {}) =>
  campoNum(`${label} ($)`, cents == null ? null : cents / 100, (v) => onCents(v == null ? null : aCentavos(v)), { step: '0.01', ...opts });
const campoPct = (label, valor, onNum, opts = {}) => campoNum(`${label} (%)`, valor, onNum, { step: '0.1', ...opts });
const etiqueta = (txt) => h('p', { class: 'etq' }, txt);
const estTag = () => h('span', { class: 'est' }, t('pint.estimated'));
function grupoChips(label, opciones, valor, onElegir) {
  return h('div', { role: 'group', 'aria-label': label }, etiqueta(label),
    h('div', { class: 'chips grandes' }, opciones.map(([v, txt]) => h('button', { type: 'button', class: 'chip', 'data-k': `${label}|${v}`, 'aria-pressed': String(valor) === String(v) ? 'true' : 'false', onclick: () => onElegir(v) }, txt))));
}
/** "de dónde sale": hoja con la fuente del dato. info = { nombre, url?, estimado?, derivada?, nota? } */
function botonOrigen(info) {
  return h('button', { type: 'button', class: 'ghost origen', 'aria-haspopup': 'dialog', onclick: () => {
    sheet(t('pint.sourceTitle'), h('div', { class: 'stack' },
      h('p', {}, info.nombre || t('pint.noSource')),
      info.url ? h('p', {}, h('a', { href: info.url, target: '_blank', rel: 'noopener noreferrer' }, info.url)) : null,
      info.estimado ? aviso('warn', t('pint.estimatedNote')) : null,
      info.derivada ? aviso('info', t('pint.derivedNote')) : null,
      info.nota ? h('p', {}, info.nota) : null,
      info.unconfirmed ? aviso('warn', t('pint.unconfirmedNote')) : null));
  } }, 'ⓘ ' + t('pint.source'));
}
const fila = (...kids) => h('div', { class: 'row' }, ...kids);
const seccion = (titulo, ...kids) => h('section', { class: 'card stack' }, h('h2', {}, titulo), ...kids);
const nota = (txt) => h('p', { class: 'muted' }, txt);
const lineaEst = (txt, info) => h('div', { class: 'dato' }, h('span', {}, txt), info?.estimado ? estTag() : null, info ? botonOrigen(info) : null);

// ---------- Pantalla ----------
export async function pantallaPintura({ shell, id, paso }) {
  const q = await store.getCotizacion(id);
  if (!q) return shell(t('ui.error'), aviso('err', t('quote.notFound')), '#/');
  if (enPapelera(q)) {
    return shell(t('nav.home'), h('div', { class: 'card stack' }, h('h1', {}, t('trash.title')), h('p', {}, q.cliente?.nombre || q.numero || ''), h('p', { class: 'muted' }, t('trash.hint')),
      h('button', { class: 'primary block', onclick: async () => { try { sacarDePapelera(q); await store.saveCotizacion(q); await pantallaPintura({ shell, id, paso }); } catch (e) { toast(t('ui.error') + ': ' + e.message, 'err'); } } }, t('trash.restore')),
      h('a', { href: '#/', class: 'btn block' }, t('home.backHome'))), '#/');
  }
  if (!q.pintura) { // una cotización normal abierta por esta ruta: se usa la pantalla de siempre
    location.replace(`#/cot/${id}`); return;
  }
  const P = q.pintura;
  const p0 = PASOS.includes(String(paso)) ? String(paso) : '1';
  const aj = q.snapshot.ajustes;
  let timer, pendiente = false;
  const guardarYa = async () => { clearTimeout(timer); pendiente = false; try { await store.saveCotizacion(q); guardadoOk(); } catch (e) { toast(t('ui.error') + ': ' + e.message, 'err'); } };
  const guardar = () => { clearTimeout(timer); pendiente = true; timer = setTimeout(guardarYa, 350); };
  registrarGuardado(() => { if (pendiente) guardarYa(); });

  const lang = () => getLang();
  const ctx = () => ({ cuartos: q.cuartos, ajustes: aj, itemsPlano: q.cantidades?.items || [] });
  let R = M.calcular(P, ctx());
  const esc = () => (P.escenario === 'B' ? 'B' : 'A');
  const E = () => (esc() === 'B' ? R.B : R.A);

  /** q.lineas, q.ajustesCot, q.margenBp y q.contingenciaBp se regeneran SIEMPRE desde el motor de pintura (una sola fuente del precio). */
  function sincronizar() {
    R = M.calcular(P, ctx());
    const puente = M.aLineasCotizacion(R, esc());
    q.tipo = 'pintura'; q.lineas = puente.lineas; q.ajustesCot = puente.ajustesCot; q.contingenciaBp = puente.contingenciaBp; q.contManual = true;
    q.margenBp = P.margenBp[esc()] ?? aj.margenObjetivoBp;
  }
  const precioMotor = () => { try { return calcularCotizacion(q).totales; } catch (e) { console.error(e); return null; } };

  // ----- barra fija de precio -----
  const barra = h('div', { class: 'precio-barra', role: 'status', 'aria-live': 'polite', 'data-sem': 'vacio' });
  const pintarBarra = () => {
    const T = precioMotor();
    clear(barra);
    if (!T || !(T.precio > 0)) {
      barra.dataset.sem = 'vacio';
      add(barra, h('b', {}, t('pint.bar.empty')));
    } else {
      const e = E();
      const sem = M.semaforo(T.margenBp, e.sug, aj.margenPisoBp);
      barra.dataset.sem = sem === 'rojo' ? 'rojo' : sem === 'ambar' ? 'ambar' : 'verde';
      add(barra, h('b', { class: 'precio-num' }, t('pint.bar.price', usd(T.precio))), h('span', { class: 'sep', 'aria-hidden': 'true' }, '·'),
        h('b', {}, t('pint.bar.keep', usd(T.margenBp))),
        h('span', { class: 'estado-sem' }, (sem === 'rojo' ? '▼ ' : sem === 'ambar' ? '▲ ' : '✓ ') + t(`pint.bar.${sem}`)),
        e.faltan.length ? h('span', { class: 'estado-sem' }, t('pint.bar.incomplete')) : null);
    }
    medirBarra();
  };
  const medirBarra = () => { requestAnimationFrame(() => { document.documentElement.style.setProperty('--precio-h', Math.ceil(barra.getBoundingClientRect().height) + 'px'); }); };
  _medir = medirBarra;

  // ----- repintado -----
  const cuerpo = h('div', { class: 'pasocuerpo' });
  let vivos = [];
  const viva = (fn, cls) => { const c = h('div', cls ? { class: cls } : {}); const run = () => { clear(c); add(c, fn()); }; vivos.push(run); run(); return c; };
  /** Repintar sin perder el foco: el control enfocado (por id o data-k) se vuelve a enfocar después. */
  const conFoco = (fn) => {
    const a = document.activeElement;
    const k = a && cuerpo.contains(a) ? (a.id ? `[id="${a.id}"]` : a.dataset?.k ? `[data-k="${CSS.escape(a.dataset.k)}"]` : null) : null;
    fn();
    if (k) cuerpo.querySelector(k)?.focus({ preventScroll: true });
  };
  const refrescar = () => conFoco(() => vivos.forEach((f) => f()));
  /** Un cambio: recalcula, regenera las líneas, guarda y actualiza la barra. estructural = hay que redibujar el paso (cambia qué campos hay). */
  function cambio(estructural = false) {
    sincronizar(); guardar(); pintarBarra();
    if (estructural) render(); else refrescar();
  }
  const irA = (n) => guardarYa().then(() => { location.hash = `#/pintura/${id}/${n}`; });
  function render() {
    const y = window.scrollY;
    conFoco(() => {
      clear(cuerpo); vivos = [];
      ({ 1: paso1, 2: paso2, 3: paso3, 4: paso4, 5: paso5 })[p0]();
      add(cuerpo, navegacion());
    });
    window.scrollTo(0, y);
  }
  const navegacion = () => h('div', { class: 'row mt navpaso' },
    p0 !== '1' ? h('button', { type: 'button', class: 'block', onclick: () => irA(Number(p0) - 1) }, '← ' + t('pint.back')) : h('a', { href: '#/', class: 'btn' }, '← ' + t('nav.home')),
    p0 !== '5' ? h('button', { type: 'button', class: 'primary block', onclick: () => irA(Number(p0) + 1) }, t('ui.next') + ' →') : null);

  // =====================================================================
  // PASO 1: ¿Qué trabajo?
  // =====================================================================
  function paso1() {
    const c = q.cliente;
    const F = (label, k, o = {}) => field({ label, value: c[k] || '', onInput: (v) => { c[k] = v.trim(); guardar(); }, ...o });
    const productoSel = (lado) => {
      const lista = lado === 'int' ? D.PRODUCTOS_INTERIOR : D.PRODUCTOS_EXTERIOR;
      const key = lado === 'int' ? 'prodInt' : 'prodExt';
      const id = 'sel-prod-' + lado;
      return h('div', {}, h('label', { for: id }, t(lado === 'int' ? 'pint.prodInt' : 'pint.prodExt')),
        h('select', { id, onchange: (e) => { P[key] = e.target.value; cambio(true); } },
          lista.map((x) => h('option', { value: x.id, selected: P[key] === x.id ? '' : null }, x.nombre)),
          h('option', { value: 'otro', selected: P[key] === 'otro' ? '' : null }, t('pint.prodOther'))));
    };
    const datosProducto = (lado) => {
      const p = M.resolverProducto(P, lado);
      if (p.otro) {
        const o = P.otro[lado];
        return h('div', { class: 'stack' },
          aviso('info', t('pint.otherHint')),
          field({ label: t('pint.otherName'), value: o.nombre, onInput: (v) => { o.nombre = v.trim(); cambio(); } }),
          fila(campoDinero(t('pint.pricePerGal'), o.precioCents, (v) => { o.precioCents = v; cambio(); }),
            campoNum(t('pint.coverage'), o.cobertura, (v) => { o.cobertura = v; cambio(); }, { hint: t('pint.coverageHint') })),
          fila(campoNum(t('pint.coats'), o.manos, (v) => { o.manos = Math.max(1, Math.round(v || 2)); cambio(); }, { step: '1', min: '1' }),
            campoNum(t('pint.recoatH'), o.recoatH, (v) => { o.recoatH = v; cambio(); }, { hint: t('pint.recoatHint') })));
      }
      const f = p.ficha;
      const info = { nombre: D.FUENTE_SW, url: f.fuente };
      return h('div', { class: 'stack' },
        h('ul', { class: 'datos' },
          h('li', {}, t('pint.dryTouch', f.secoH.min === f.secoH.max ? f.secoH.min : `${f.secoH.min}-${f.secoH.max}`)),
          h('li', {}, t('pint.recoat', f.recoatH) + (f.recoatFrioH ? ' ' + t('pint.recoatCold', f.recoatFrioH) : '')),
          h('li', {}, t('pint.coverageSheet', f.cobMin === f.cobMax ? f.cobMin : `${f.cobMin}-${f.cobMax}`) + (f.cobRugosa ? ' ' + t('pint.coverageRough', f.cobRugosa) : '')),
          h('li', {}, f.manosNueva ? t('pint.coatsDuration', f.manos, f.manosNueva) : t('pint.coatsSheet', f.manos) + (f.manosPrimer ? ' ' + t('pint.coatsPrimer', f.manosPrimer) : ''))),
        h('div', { class: 'dato' }, h('span', {}, t('pint.sheetData')), botonOrigen(info)),
        nota(t('pint.refConditions', D.COND_REFERENCIA.tempF, D.COND_REFERENCIA.humedadPct, D.COND_REFERENCIA.minAplicarF)),
        campoDinero(t('pint.pricePerGal'), P.precios[p.clave] ?? null, (v) => { if (v == null) delete P.precios[p.clave]; else P.precios[p.clave] = v; cambio(); }, { hint: t('pint.priceHint') }));
    };
    const avisoEpa = viva(() => {
      if (P.antes1978 !== 'si' && P.antes1978 !== 'nose') return null;
      const L = lang();
      return aviso('warn', h('div', { class: 'stack' }, h('b', {}, t(P.antes1978 === 'si' ? 'pint.epaYes' : 'pint.epaUnknown')),
        h('span', {}, (S.ajustes.avisoEpa?.[L] || aj.avisoEpa?.[L] || '')), h('span', {}, t('pint.epaReserve', pct1(R.contBp)))));
    });
    add(cuerpo,
      h('h1', {}, t('pint.step1')),
      seccion(t('pint.clientTitle'),
        F(t('client.name'), 'nombre', { placeholder: t('pint.namePh') }),
        F(t('pint.siteAddress'), 'direccion'),
        fila(F(t('client.phone'), 'telefono', { type: 'tel', inputmode: 'tel' }), F(t('client.email'), 'email', { type: 'email', inputmode: 'email' }))),
      seccion(t('pint.jobTitle'),
        grupoChips(t('pint.scope'), [['interior', t('pint.scopeInt')], ['exterior', t('pint.scopeExt')], ['ambos', t('pint.scopeBoth')]], P.alcance, (v) => { P.alcance = v; cambio(true); }),
        grupoChips(t('pint.kind'), [['casa', t('pint.kindHome')], ['comercial', t('pint.kindCommercial')]], P.inmueble, (v) => { P.inmueble = v; cambio(true); }),
        grupoChips(t('pint.before1978'), [['si', t('pint.yes')], ['no', t('pint.no')], ['nose', t('pint.dontKnow')]], P.antes1978, (v) => { P.antes1978 = v; cambio(true); }),
        avisoEpa),
      P.alcance !== 'exterior' ? seccion(t('pint.prodInt'), productoSel('int'), datosProducto('int')) : null,
      P.alcance !== 'interior' ? seccion(t('pint.prodExt'), productoSel('ext'), datosProducto('ext')) : null,
      nota(t('pint.noSheetList', D.SIN_FICHA.join(', '))),
      nota(t('pint.buyNote')));
    pintarBarra();
  }

  // =====================================================================
  // PASO 2: Medidas
  // =====================================================================
  function paso2() {
    const d = { areaPuerta: aj.areaPuerta ?? 21, areaVentana: aj.areaVentana ?? 15, anchoPuerta: 3 };
    const usaInt = P.alcance !== 'exterior', usaExt = P.alcance !== 'interior';
    const nuevoCuarto = (plantilla) => {
      const base = plantilla ? D.PLANTILLAS_CUARTO[plantilla] : { largo: 12, ancho: 10, alto: 8, puertas: 1, ventanas: 1 };
      q.cuartos.push({ id: store.nuevoId(), nombre: `${t('rooms.room')} ${q.cuartos.length + 1}`, ...base });
      cambio(true);
    };
    const tarjetaCuarto = (r) => {
      const out = h('p', { class: 'muted' });
      const act = () => { const m = medirCuarto(r, d); out.textContent = t('rooms.measures', num(m.paredes, 0), num(m.techo, 0), num(m.trim, 0)); };
      act();
      const N = (label, k, step = 'any') => field({ label, type: 'number', inputmode: 'decimal', step, min: '0', value: r[k] ?? '', onInput: (v) => { r[k] = Math.max(0, parseFloat(v) || 0); act(); cambio(); } });
      return h('div', { class: 'card stack cuarto' },
        field({ label: t('rooms.name'), value: r.nombre, onInput: (v) => { r.nombre = v; guardar(); } }),
        fila(N(t('rooms.length'), 'largo'), N(t('rooms.width'), 'ancho'), N(t('rooms.height'), 'alto')),
        fila(N(t('rooms.doors'), 'puertas', '1'), N(t('rooms.windows'), 'ventanas', '1')),
        out,
        h('button', { type: 'button', class: 'danger', onclick: () => borrarConDeshacer(q.cuartos, r, { msg: t('ui.deletedRoom'), guardar: () => { sincronizar(); guardar(); pintarBarra(); }, despues: render }) }, t('ui.delete') + ': ' + (r.nombre || t('rooms.room'))));
    };
    const resumen = viva(() => {
      const a = R.areas;
      if (!(a.total > 0)) return aviso('info', t('pint.m.empty'));
      return h('div', { class: 'kpis' },
        usaInt ? [h('div', { class: 'kpi' }, h('small', {}, t('rooms.walls')), h('b', {}, num(a.paredesInt, 0) + ' ft²')), h('div', { class: 'kpi' }, h('small', {}, t('rooms.ceiling')), h('b', {}, num(a.techo, 0) + ' ft²')),
          h('div', { class: 'kpi' }, h('small', {}, t('pint.m.trim')), h('b', {}, num(a.trim, 0) + ' lf')), h('div', { class: 'kpi' }, h('small', {}, t('rooms.doors')), h('b', {}, num(a.puertas, 0)))] : null,
        usaExt ? h('div', { class: 'kpi' }, h('small', {}, t('pint.m.exterior')), h('b', {}, num(a.extArea, 0) + ' ft²')) : null);
    });
    const planoBox = viva(() => {
      if (P.fuenteMedidas !== 'plano' || !usaInt) return null;
      const c = q.cantidades;
      if (!c) return aviso('warn', h('div', { class: 'stack' }, h('b', {}, t('pint.m.planEmpty')), h('span', {}, t('pint.m.planEmptyHint')), h('a', { class: 'btn', href: `#/cot/${id}/cantidades` }, t('pint.m.planOpen'))));
      const a = R.areas;
      return h('div', { class: 'stack' }, a.pendientes ? aviso('warn', t('pint.m.planPending', a.pendientes)) : aviso('ok', t('pint.m.planAllOk')),
        h('p', {}, t('pint.m.planUsed', num(a.paredesInt, 0), num(a.techo, 0))), h('a', { class: 'btn', href: `#/cot/${id}/cantidades` }, t('pint.m.planOpen')), nota(t('pint.m.planNote')));
    });
    add(cuerpo,
      h('h1', {}, t('pint.step2')),
      usaInt ? grupoChips(t('pint.m.source'), [['cuartos', t('pint.m.srcRooms')], ['plano', t('pint.m.srcPlan')]], P.fuenteMedidas, (v) => { P.fuenteMedidas = v; cambio(true); }) : null,
      usaInt && P.fuenteMedidas === 'cuartos' ? seccion(t('rooms.title'),
        q.cuartos.length ? q.cuartos.map(tarjetaCuarto) : h('div', { class: 'empty' }, t('pint.m.noRooms')),
        etiqueta(t('pint.m.addRoom')),
        h('div', { class: 'chips grandes' }, ['chico', 'mediano', 'grande'].map((k) => h('button', { type: 'button', class: 'chip', onclick: () => nuevoCuarto(k) }, '+ ' + t(`pint.m.tpl.${k}`)))),
        nota(t('pint.m.tplNote')),
        h('button', { type: 'button', class: 'block', onclick: () => nuevoCuarto(null) }, '+ ' + t('rooms.add'))) : null,
      usaInt ? seccion(t('pint.m.intOptions'),
        checkField(t('rooms.ceiling'), P.interior.techos, (v) => { P.interior.techos = v; cambio(); }),
        checkField(t('pint.m.trim'), P.interior.trim, (v) => { P.interior.trim = v; cambio(); }),
        checkField(t('pint.m.doors'), P.interior.puertas, (v) => { P.interior.puertas = v; cambio(); }),
        checkField(t('pint.m.texture'), P.interior.textura, (v) => { P.interior.textura = v; cambio(); })) : null,
      usaInt ? planoBox : null,
      usaExt ? seccion(t('pint.m.exterior'),
        campoNum(t('pint.m.extArea') + ' (ft²)', P.exterior.area || null, (v) => { P.exterior.area = v || 0; cambio(); }, { hint: t('pint.m.extAreaHint') }),
        checkField(t('pint.m.extTexture'), P.exterior.textura, (v) => { P.exterior.textura = v; cambio(); }),
        D.productoPorId(P.prodExt)?.manosNueva ? checkField(t('pint.m.extNew'), P.exterior.nueva, (v) => { P.exterior.nueva = v; cambio(); }) : null,
        D.productoPorId(P.prodExt)?.cobRugosa ? checkField(t('pint.m.extRough'), P.exterior.rugoso, (v) => { P.exterior.rugoso = v; cambio(); }) : null,
        grupoChips(t('pint.m.method'), [['rodillo', t('pint.m.roller')], ['pulverizador', t('pint.m.spray')]], P.exterior.metodo, (v) => { P.exterior.metodo = v; cambio(true); }),
        P.exterior.metodo === 'pulverizador' ? aviso('info', t('pint.m.sprayNote')) : null,
        D.productoPorId(P.prodExt)?.manosPrimer ? h('div', { class: 'stack' }, aviso('warn', t('pint.m.primerNote', D.productoPorId(P.prodExt).primerNombre)),
          fila(campoDinero(t('pint.m.primerPrice'), P.primer.precioCents, (v) => { P.primer.precioCents = v; cambio(); }), campoNum(t('pint.m.primerCov'), P.primer.cobertura, (v) => { P.primer.cobertura = v; cambio(); }))) : null) : null,
      resumen,
      seccion(t('pint.m.plansTitle'), h('p', {}, t('pint.m.tabletNote')), h('a', { class: 'btn', href: `#/planos/${id}` }, t('quote.openPlans'))));
    pintarBarra();
  }

  // =====================================================================
  // PASO 3: Horas y costos
  // =====================================================================
  function paso3() {
    const rango = (x) => t('pint.range', num1(x.minimo), num1(x.maximo), num1(x.probable));
    const tareaNombre = (id) => t(`pint.task.${id}`);
    // ----- horas -----
    const horasCard = viva(() => {
      const H = R.horas;
      if (!(H.sinContingencia.maximo > 0)) return aviso('info', t('pint.h.empty'));
      return h('section', { class: 'card stack' }, h('h2', {}, t('pint.h.title')),
        h('p', { class: 'grande' }, rango(H.sinContingencia)), nota(t('pint.h.forSub')),
        P.escenario === 'B' || true ? h('p', {}, h('b', {}, t('pint.h.withCont', H.contPct)), ' ', rango(H.conContingencia)) : null,
        aviso('info', t('pint.h.planning')),
        h('table', {}, h('tbody', {},
          H.tareas.map((x) => h('tr', {}, h('td', {}, tareaNombre(x.id), h('div', { class: 'muted' }, `${num(x.cantidad, 0)} ${x.id === 'puerta' ? t('pint.faces') : x.id === 'trim' ? 'lf' : 'ft²'}${x.id === 'puerta' ? '' : ' × ' + x.manos + ' ' + t('pint.coatsShort')}`)), h('td', { class: 'r' }, num1(x.horas.probable) + ' h'))),
          h('tr', {}, h('td', {}, t('pint.h.prep')), h('td', { class: 'r' }, num1(H.preparacion.probable) + ' h')),
          h('tr', {}, h('td', {}, t('pint.h.factors') + (H.factor.lista.length ? ': ' + H.factor.lista.map((f) => t(`pint.f.${f.id}`)).join(', ') : '')), h('td', { class: 'r' }, '×' + H.factor.total.probable.toFixed(2))),
          h('tr', {}, h('td', {}, t('pint.h.fixed')), h('td', { class: 'r' }, num1(H.fijas.probable) + ' h')),
          h('tr', { class: 'tot' }, h('td', {}, t('pint.h.total')), h('td', { class: 'r' }, num1(H.sinContingencia.probable) + ' h')))));
    });
    const trioIn = (label, get, set, fuente, unidad) => {
      const v = get();
      const mk = (k, lab) => field({ label: `${lab}${unidad ? ' (' + unidad + ')' : ''}`, type: 'number', inputmode: 'decimal', step: 'any', min: '0', value: v[k], onInput: (x) => { set({ ...get(), [k]: Math.max(0, parseFloat(x) || 0) }); cambio(); } });
      return h('div', { class: 'stack' }, lineaEst(label, fuente), fila(mk('bajo', t('pint.low')), mk('probable', t('pint.likely')), mk('alto', t('pint.high'))));
    };
    const ajustesHoras = () => {
      const tareasEnUso = R.horas.tareas;
      const prods = tareasEnUso.map((x) => trioIn(`${tareaNombre(x.id)} (${x.unidad})`, () => ({ bajo: x.prod.bajo, probable: x.prod.probable, alto: x.prod.alto }),
        (v) => { P.horas.prod[x.prodId] = v; }, { ...D.PRODUCTIVIDAD[x.prodId].fuente, estimado: true }, ''));
      const F = P.horas.factores;
      return h('details', { class: 'det' }, h('summary', {}, t('pint.h.edit')),
        h('div', { class: 'stack' }, nota(t('pint.h.estimatedAll')), ...prods,
          trioIn(t('pint.h.prepPct'), () => P.horas.prep, (v) => { P.horas.prep = v; }, { ...D.PREPARACION_PCT.fuente, estimado: true }, '%'),
          trioIn(t('pint.h.fixedEdit'), () => P.horas.fijas, (v) => { P.horas.fijas = v; }, { ...D.HORAS_FIJAS.fuente, estimado: true }, 'h'),
          etiqueta(t('pint.h.factorsTitle')),
          checkField(t('pint.f.altura') + ` (×${P.horas.mult.altura})`, F.altura === null ? R.areas.alturaAuto : F.altura, (v) => { F.altura = v; cambio(); }),
          checkField(t('pint.f.dificil') + ` (×${P.horas.mult.dificil})`, F.dificil, (v) => { F.dificil = v; cambio(); }),
          checkField(t('pint.f.acceso') + ` (×${P.horas.mult.acceso})`, F.acceso, (v) => { F.acceso = v; cambio(); }),
          checkField(t('pint.f.ocupado'), F.ocupado, (v) => { F.ocupado = v; cambio(); }),
          F.ocupado ? trioIn(t('pint.h.busyPct'), () => P.horas.ocupadoPct, (v) => { P.horas.ocupadoPct = v; }, { ...D.OCUPADO_PCT.fuente, estimado: true }, '%') : null,
          nota(t('pint.h.factorRange')),
          campoPct(t('pint.h.contPct'), P.horas.contPct, (v) => { P.horas.contPct = v || 0; cambio(); }, { hint: t('pint.h.contHint') })));
    };
    const horasElegir = viva(() => {
      const H = R.horas.sinContingencia;
      return [grupoChips(t('pint.h.pick'), [['minimo', `${t('pint.low')} ${num1(H.minimo)} h`], ['probable', `${t('pint.likely')} ${num1(H.probable)} h`], ['maximo', `${t('pint.high')} ${num1(H.maximo)} h`], ['otro', t('pint.other')]],
        P.horas.eleg, (v) => { P.horas.eleg = v; cambio(); }),
      P.horas.eleg === 'otro' ? campoNum(t('pint.h.otherHours'), P.horas.horasOtro, (v) => { P.horas.horasOtro = v; cambio(); }) : null];
    });
    // ----- cuadrilla -----
    const cuadrillaOut = viva(() => {
      const pl = R.planA, plB = R.planB;
      if (pl.incompleto) return aviso('warn', h('b', {}, t(pl.falta === 'personas' ? 'pint.c.choosePeople' : 'pint.c.chooseHours')));
      const use = P.escenario === 'B' ? plB : pl;
      const hh = P.escenario === 'B' ? R.horas.conContingencia : R.horas.sinContingencia;
      const r = use.probable;
      return h('div', { class: 'stack' },
        use.excedeTope ? aviso('warn', h('b', {}, t('pint.c.crowded')), ' ', t('pint.c.crowdedHint', use.tope, use.efectivas)) : null,
        h('p', { class: 'grande' }, t('pint.c.equation', num1(r.horasHombre), use.efectivas, r.diasTrabajo, use.horasDia)),
        h('p', {}, t('pint.c.days', r.dias, r.diasTrabajo, r.diasEspera)),
        h('p', { class: 'muted' }, t('pint.c.daysRange', use.minimo.dias, use.maximo.dias)),
        h('p', { class: 'muted' }, t('pint.c.clock', num1(hh.probable), use.efectivas, use.eficienciaPct, num1(r.horasReloj), r.reloj.dias, num1(r.reloj.horas))),
        nota(t('pint.c.manHoursNote')),
        R.secado.dias > 0 ? h('p', { class: 'muted' }, t('pint.c.dry', R.secado.dias)) : null);
    });
    const cuadrillaCard = h('section', { class: 'card stack' }, h('h2', {}, t('pint.c.title')),
      viva(() => grupoChips(t('pint.c.people'), [1, 2, 3, 4, 5, 6].map((n) => [n, String(n)]), P.cuadrilla.personas, (v) => { P.cuadrilla.personas = Number(v); cambio(); })),
      campoNum(t('pint.c.peopleOther'), P.cuadrilla.personas, (v) => { P.cuadrilla.personas = v ? Math.round(v) : null; cambio(); }, { step: '1', min: '1' }),
      viva(() => grupoChips(t('pint.c.hoursDay'), [6, 8, 10].map((n) => [n, `${n} h`]), P.cuadrilla.horasDia, (v) => { P.cuadrilla.horasDia = Number(v); cambio(); })),
      campoNum(t('pint.c.hoursOther'), P.cuadrilla.horasDia, (v) => { P.cuadrilla.horasDia = v || null; cambio(); }),
      cuadrillaOut,
      h('details', { class: 'det' }, h('summary', {}, t('pint.c.edit')),
        h('div', { class: 'stack' },
          lineaEst(t('pint.c.efficiency'), { ...D.CUADRILLA.eficienciaPct.fuente, estimado: true }),
          campoPct(t('pint.c.efficiency'), P.cuadrilla.eficienciaPct, (v) => { P.cuadrilla.eficienciaPct = Math.min(100, v || 85); cambio(); }),
          lineaEst(t('pint.c.cap'), { ...D.CUADRILLA.ft2PorPersona.fuente, estimado: true }),
          campoNum(t('pint.c.capField'), P.cuadrilla.ft2PorPersona, (v) => { P.cuadrilla.ft2PorPersona = v || 0; cambio(); }),
          checkField(t('pint.c.cold'), P.cuadrilla.frio, (v) => { P.cuadrilla.frio = v; cambio(); }),
          nota(t('pint.c.dryRule')), botonOrigen({ nombre: D.NOTA_REGLA_SECADO, derivada: true }))));
    // ----- materiales -----
    const matOut = viva(() => {
      const m = R.mat;
      if (!m.lineas.length) return aviso('info', t('pint.mat.empty'));
      return h('div', { class: 'stack' },
        h('table', {}, h('tbody', {},
          m.lineas.map((l) => h('tr', {}, h('td', {}, l.nombre || t('pint.prodOther'), h('div', { class: 'muted' }, t('pint.mat.line', num(l.area, 0), l.manos, l.cobertura || '?'))), h('td', { class: 'r' }, `${l.galones} gal`, h('div', { class: 'muted' }, l.precioCents > 0 ? usd(l.costo) : t('pint.mat.noPrice'))))),
          h('tr', {}, h('td', {}, t('pint.mat.reserve', P.materiales.reservaPct)), h('td', { class: 'r' }, usd(m.reservaCents))),
          h('tr', { class: 'tot' }, h('td', {}, t('pint.mat.total')), h('td', { class: 'r' }, usd(m.total))))),
        m.faltan.includes('precioPintura') ? aviso('warn', t('pint.mat.needPrice')) : null,
        m.faltan.includes('primer') ? aviso('warn', t('pint.m.primerNote', D.productoPorId(P.prodExt)?.primerNombre || '')) : null);
    });
    const controlOut = viva(() => {
      const m = R.mat;
      if (!m.lineas.length) return null;
      return h('div', { class: 'stack' }, m.lineas.map((l) => {
        const c = P.materiales.control[l.clave] || (P.materiales.control[l.clave] = { entregados: null, devueltos: null });
        const r = M.controlMateriales(l.galones, c.entregados, c.devueltos);
        const res = h('p', { class: 'resultado-ctl', 'aria-live': 'polite' });
        const act = () => {
          const x = M.controlMateriales(l.galones, c.entregados, c.devueltos);
          res.textContent = c.entregados == null ? t('pint.ctl.none') : x.diferencia > 0 ? t('pint.ctl.over', x.diferencia) : x.diferencia < 0 ? t('pint.ctl.short', -x.diferencia) : t('pint.ctl.exact');
          res.className = 'resultado-ctl ' + (c.entregados == null ? '' : x.diferencia > 0 ? 'sobra' : x.diferencia < 0 ? 'falta' : 'ok');
        };
        act(); void r;
        return h('div', { class: 'card stack' }, h('b', {}, l.nombre || t('pint.prodOther')),
          fila(h('div', {}, etiqueta(t('pint.ctl.required')), h('p', { class: 'grande' }, `${l.galones} gal`)),
            campoNum(t('pint.ctl.delivered'), c.entregados, (v) => { c.entregados = v; act(); guardar(); }, { step: '1' }),
            campoNum(t('pint.ctl.returned'), c.devueltos, (v) => { c.devueltos = v; act(); guardar(); }, { step: '1' })), res);
      }));
    });
    // ----- escenario A -----
    const aOut = viva(() => {
      const A = R.A, efMin = A.tarifaEfectivaMinCents, ef = A.tarifaEfectivaCents;
      return h('div', { class: 'stack' },
        h('p', { class: 'grande' }, t('pint.a.pay', num1(A.horasAcordadas), usd(A.tarifaCents), usd(A.pago))),
        aviso('info', t('pint.a.fixed')),
        ef != null ? h('p', {}, t('pint.a.effective', num1(R.horas.sinContingencia.probable), usd(ef))) : null,
        efMin != null && R.horas.sinContingencia.minimo > 0 ? h('p', { class: 'muted' }, t('pint.a.effectiveMin', num1(R.horas.sinContingencia.minimo), usd(efMin))) : null,
        R.equilibrio.tipo === 'horas' ? aviso('info', t('pint.a.breakeven', num1(R.equilibrio.horas))) : R.equilibrio.tipo === 'siempreSub' ? aviso('info', t('pint.a.alwaysSub')) : aviso('info', t('pint.a.noBreakeven')));
    });
    const aCard = h('section', { class: 'card stack' }, h('h2', {}, t('pint.a.title')), nota(t('pint.a.sub')),
      viva(() => grupoChips(t('pint.a.rate'), D.TARIFAS_SUB.map((c) => [c, usd(c) + '/h']), P.A.tarifaCents, (v) => { P.A.tarifaCents = Number(v); cambio(); })),
      campoDinero(t('pint.a.rateOther'), P.A.tarifaCents, (v) => { P.A.tarifaCents = v || 0; cambio(); }),
      horasElegir, aOut,
      fila(campoNum(t('pint.sv.hours'), P.superv.horas, (v) => { P.superv.horas = v; cambio(); }, { hint: t('pint.sv.hint') }), campoDinero(t('pint.sv.rate'), P.superv.tarifaCents, (v) => { P.superv.tarifaCents = v; cambio(); })),
      campoPct(t('pint.a.insurance'), P.A.seguroBp == null ? null : P.A.seguroBp / 100, (v) => { P.A.seguroBp = v == null ? null : Math.round(v * 100); cambio(); }, { hint: t('pint.a.insuranceHint') }),
      aviso('warn', t('pint.a.legal')));
    // ----- escenario B -----
    const bOut = viva(() => {
      const B = R.B;
      return h('div', { class: 'stack' },
        h('p', { class: 'grande' }, t('pint.b.cost', num1(B.horasTotales), usd(B.salarioH), pct1(B.cargas.bpEfectivo), usd(B.manoObra))),
        nota(t('pint.b.contNote', num1(B.horasContingencia))),
        B.cargas.faltaCompensacion ? aviso('warn', h('b', {}, t('pint.b.compMissing'))) : null);
    });
    const eq = P.B.equipos[0];
    const bCard = h('section', { class: 'card stack' }, h('h2', {}, t('pint.b.title')), nota(t('pint.b.sub')),
      bOut,
      lineaEst(t('pint.b.wage'), D.SALARIO_REF.fuente && { ...D.SALARIO_REF.fuente }),
      campoDinero(t('pint.b.wage'), P.B.salarioCents, (v) => { P.B.salarioCents = v || 0; cambio(); }, { hint: t('pint.b.wageHint') }),
      h('details', { class: 'det' }, h('summary', {}, t('pint.b.loads')),
        h('div', { class: 'stack' },
          lineaEst('FICA', D.CARGAS_DEF.ficaBp.fuente), campoPct('FICA', P.B.ficaBp / 100, (v) => { P.B.ficaBp = Math.round((v || 0) * 100); cambio(); }),
          lineaEst('FUTA', D.CARGAS_DEF.futaBp.fuente), campoPct('FUTA', P.B.futaBp / 100, (v) => { P.B.futaBp = Math.round((v || 0) * 100); cambio(); }),
          lineaEst('SUTA', { ...D.CARGAS_DEF.sutaBp.fuente, estimado: true }), campoPct('SUTA', P.B.sutaBp / 100, (v) => { P.B.sutaBp = Math.round((v || 0) * 100); cambio(); }),
          lineaEst(t('pint.b.comp'), { ...D.CARGAS_DEF.compBp.fuente, unconfirmed: true }),
          campoPct(t('pint.b.comp'), P.B.compBp == null ? null : P.B.compBp / 100, (v) => { P.B.compBp = v == null ? null : Math.round(v * 100); cambio(); }, { hint: t('pint.b.compHint') }),
          nota(t('pint.b.futaNote')))),
      h('details', { class: 'det' }, h('summary', {}, t('pint.b.tools')),
        h('div', { class: 'stack' },
          checkField(`${eq.nombre}: ${usd(eq.precioCents)}, ${eq.vidaH} h → ${usd(Math.round(eq.precioCents / eq.vidaH))}/h`, eq.usar, (v) => { eq.usar = v; cambio(); }),
          lineaEst(t('pint.b.toolLife'), { ...eq.fuente, estimado: true }),
          lineaEst(D.ALQUILER_LIFT.nombre + `: ${usd(D.ALQUILER_LIFT.porDiaMin)}-${usd(D.ALQUILER_LIFT.porDiaMax)}/día`, { ...D.ALQUILER_LIFT.fuente, nota: `${usd(D.ALQUILER_LIFT.porSemanaMin)}-${usd(D.ALQUILER_LIFT.porSemanaMax)} / semana` }),
          fila(campoNum(t('pint.b.liftDays'), P.B.liftDias || null, (v) => { P.B.liftDias = v || 0; cambio(); }, { step: '1' }), campoDinero(t('pint.b.liftRate'), P.B.liftPorDiaCents, (v) => { P.B.liftPorDiaCents = v || 0; cambio(); })),
          campoPct(t('pint.b.consumables'), P.B.consumiblesPct, (v) => { P.B.consumiblesPct = v; cambio(); }, { hint: t('pint.b.consumablesHint') }),
          campoDinero(t('pint.b.vehicle'), P.B.vehiculoDiaCents, (v) => { P.B.vehiculoDiaCents = v; cambio(); }, { hint: t('pint.b.vehicleHint') }))));
    // ----- lo que falta -----
    const faltaOut = viva(() => {
      const fa = [...new Set([...R.A.faltan, ...R.B.faltan])];
      const pl = R.planA;
      if (!fa.length && !pl.incompleto) return aviso('ok', t('pint.missing.none'));
      return aviso('warn', h('div', {}, h('b', {}, t('pint.missing.title')), h('ul', { class: 'razones' },
        fa.map((k) => h('li', {}, t(`pint.missing.${k}`))), pl.incompleto ? h('li', {}, t('pint.missing.crew')) : null)));
    });
    add(cuerpo, h('h1', {}, t('pint.step3')), faltaOut, horasCard, ajustesHoras(), cuadrillaCard,
      h('section', { class: 'card stack' }, h('h2', {}, t('pint.mat.title')), nota(t('pint.mat.sub')), matOut,
        fila(campoPct(t('pint.mat.waste'), P.materiales.desperdicioPct, (v) => { P.materiales.desperdicioPct = v || 0; cambio(); }, { hint: t('pint.mat.estimatedHint') }),
          campoPct(t('pint.mat.reservePct'), P.materiales.reservaPct, (v) => { P.materiales.reservaPct = v || 0; cambio(); }, { hint: t('pint.mat.reserveHint') })),
        h('div', { class: 'dato' }, estTag(), botonOrigen({ nombre: t('pint.mat.defaultsSource'), estimado: true }))),
      h('section', { class: 'card stack' }, h('h2', {}, t('pint.ctl.title')), nota(t('pint.ctl.sub')), controlOut),
      aCard, bCard);
    pintarBarra();
  }

  // =====================================================================
  // PASO 4: Ganancia
  // =====================================================================
  function paso4() {
    const tarjeta = (K) => viva(() => {
      const Ex = K === 'A' ? R.A : R.B;
      const elegido = esc() === K;
      const bp = P.margenBp[K];
      const sem = Ex.semaforo;
      return h('section', { class: 'card stack escenario' + (elegido ? ' elegido' : ''), 'data-esc': K },
        h('h2', {}, t(K === 'A' ? 'pint.a.short' : 'pint.b.short')),
        h('div', { class: 'precio-grande' }, usd(Ex.precio)),
        h('div', { class: 'stepper', role: 'group', 'aria-label': t('pint.g.adjust') },
          h('button', { type: 'button', id: `precio-menos-${K}`, 'aria-label': t('pint.g.lower', usd(M.pasoPrecio(Ex.precio))), onclick: () => { P.margenBp[K] = M.moverPrecio(Ex.costoTotal, bp, -1); cambio(); } }, '−'),
          h('span', { class: 'stepper-txt' }, t('pint.g.price')),
          h('button', { type: 'button', id: `precio-mas-${K}`, 'aria-label': t('pint.g.raise', usd(M.pasoPrecio(Ex.precio))), onclick: () => { P.margenBp[K] = M.moverPrecio(Ex.costoTotal, bp, +1); cambio(); } }, '+')),
        h('p', { class: 'grande sem sem-' + (sem === 'rojo' ? 'rojo' : sem === 'ambar' ? 'ambar' : 'verde') }, t('pint.bar.keep', usd(Ex.margenBp))),
        h('p', {}, h('b', {}, t('pint.g.profitability', t(`pint.g.${Ex.rentabilidad}`)))),
        Ex.margenBp < R.pisoBp ? aviso('err', h('b', {}, t('pint.g.belowMin', pct1(R.pisoBp)))) : null,
        h('p', { class: 'muted' }, t('pint.g.cost', usd(Ex.costoTotal)) + ' · ' + t('pint.g.profit', usd(Ex.ganancia))),
        h('p', {}, t('pint.g.suggested', pct1(Ex.sug.minBp), pct1(Ex.sug.maxBp), t(`pint.g.size.${Ex.sug.id}`)), ' ', botonOrigen({ nombre: t('pint.g.suggestedSource'), estimado: true })),
        Ex.sug.debajoDelMinimo ? aviso('warn', t('pint.g.sugBelowFloor', pct1(R.pisoBp))) : null,
        Ex.faltan.length ? aviso('warn', t('pint.g.incomplete', Ex.faltan.map((k) => t(`pint.missing.${k}`)).join(', '))) : null,
        h('button', { type: 'button', id: `usar-${K}`, class: elegido ? 'primary' : '', 'aria-pressed': elegido ? 'true' : 'false', onclick: () => { P.escenario = K; cambio(true); } }, elegido ? '✓ ' + t('pint.g.chosen') : t('pint.g.choose')));
    });
    const desglose = viva(() => {
      const Ex = E(), fi = (k, v, cls) => h('tr', { class: cls }, h('td', {}, k), h('td', { class: 'r' }, usd(v)));
      return h('section', { class: 'card' }, h('h2', {}, t('pint.g.breakdown', t(esc() === 'A' ? 'pint.a.short' : 'pint.b.short'))),
        h('table', {}, h('tbody', {},
          fi(t('pdf.materials'), Ex.materiales), fi(`${t('pdf.salesTax')} (${(aj.impuestoVentasBp / 100).toFixed(1)}%)`, Ex.impuesto),
          esc() === 'A' ? fi(t('pint.g.subPay'), Ex.pago) : fi(t('pint.g.ownLabor'), Ex.manoObra),
          fi(t('pint.g.others'), Ex.otros),
          Ex.contingencia ? fi(`${t('pint.g.oldHouse')} (${pct1(R.contBp)})`, Ex.contingencia) : null,
          fi(`${t('pdf.overhead')} (${pct1(aj.overheadBp)})`, Ex.overhead), fi(`${t('pdf.warrantyRes')} (${pct1(aj.garantiaBp)})`, Ex.garantia),
          fi(t('pdf.totalCost'), Ex.costoTotal, 'tot'), fi(t('pdf.price'), Ex.precio, 'tot'), fi(t('pdf.profit'), Ex.ganancia)),
        ), nota(t('pint.g.fixedNote')));
    });
    const A = tarjeta('A'), B = tarjeta('B');
    add(cuerpo, h('h1', {}, t('pint.step4')), nota(t('pint.g.intro')), h('div', { class: 'dos-col' }, A, B), desglose,
      viva(() => (R.equilibrio.tipo === 'horas' ? aviso('info', t('pint.a.breakeven', num1(R.equilibrio.horas))) : null)));
    pintarBarra();
  }

  // =====================================================================
  // PASO 5: Enviar
  // =====================================================================
  function paso5() {
    const L = () => q.idiomaPdf || 'en';
    let confirmTxt = '';
    const estado = h('div', { 'aria-live': 'polite' });
    const zona = h('div', { class: 'stack' });
    const ordenCfg = q.ordenTrabajo || (q.ordenTrabajo = { sub: '', notas: '' });
    const T = () => precioMotor();
    const emitir = async (tipo) => {
      clear(estado); add(estado, h('p', {}, h('span', { class: 'spin' }), ' ', t('ui.loading')));
      try {
        await guardarYa();
        sincronizar();
        const c = calcularCotizacion(q);
        const ajPdf = { ...aj };
        for (const k of ['empresa', 'garantia', 'changeOrders', 'exclusiones', 'avisoGravamen', 'avisoRecovery', 'avisoEpa', 'hitosNombres']) ajPdf[k] = S.ajustes[k];
        let doc, nombre;
        const slug = (q.cliente.nombre || 'cliente').replace(/[^\w]+/g, '_');
        if (tipo === 'cliente') { doc = await generarPdfCliente(q, c, ajPdf, q.snapshot.catalogo, L()); nombre = `Propuesta-${q.numero}-${slug}.pdf`; }
        else if (tipo === 'interno') { doc = await generarPdfInterno(q, c, ajPdf, q.snapshot.catalogo); nombre = `INTERNO-${q.numero}-${slug}.pdf`; }
        else { doc = await generarPdfOrdenTrabajo(q, R, ajPdf, L()); nombre = `ORDEN-SUBCONTRATISTA-BORRADOR-${q.numero}-${slug}.pdf`; }
        const buf = doc.output('arraybuffer');
        window.__ultimoPdf = { tipo, buf };
        descargar(nombre, new Blob([buf], { type: 'application/pdf' }));
        clear(estado); add(estado, aviso('ok', t('pdf.done', nombre)));
      } catch (e) { console.error(e); clear(estado); add(estado, aviso('err', t('pdf.fail') + ' ' + e.message)); }
    };
    const pintarZona = () => {
      clear(zona);
      const Tt = T(), e = E();
      if (!Tt || !(Tt.precio > 0) || !q.lineas.length) { add(zona, aviso('info', t('pint.s.noPrice')), h('a', { class: 'btn', href: `#/pintura/${id}/2` }, t('pint.s.goMeasures'))); return; }
      const chk = puedeGenerarPdf(Tt.margenBp, aj.margenPisoBp, confirmTxt);
      const sumaOk = (q.hitosBp || aj.hitosBp).reduce((a, b) => a + b, 0) === BP;
      const habilitar = () => !puedeGenerarPdf(Tt.margenBp, aj.margenPisoBp, confirmTxt).ok || !sumaOk;
      add(zona,
        h('div', { class: 'kpis' }, h('div', { class: 'kpi' }, h('small', {}, t('pdf.price')), h('b', {}, usd(Tt.precio))), h('div', { class: 'kpi sem-' + (barra.dataset.sem === 'rojo' ? 'rojo' : barra.dataset.sem === 'ambar' ? 'ambar' : 'verde') }, h('small', {}, t('pint.s.keepLabel')), h('b', {}, usd(Tt.margenBp)))),
        e.faltan.length ? aviso('warn', t('pint.g.incomplete', e.faltan.map((k) => t(`pint.missing.${k}`)).join(', '))) : null,
        chk.requiereConfirmacion ? h('div', { class: 'stack' }, aviso('err', h('b', {}, t('pdf.blocked', pct1(Tt.margenBp), pct1(aj.margenPisoBp))), ' ', t('pdf.blockedHint', TEXTO_CONFIRMACION)),
          h('div', {}, h('label', { for: 'confirm-txt' }, t('pdf.confirmLabel')), h('input', { id: 'confirm-txt', value: confirmTxt, placeholder: TEXTO_CONFIRMACION, autocomplete: 'off', oninput: (ev) => {
            confirmTxt = ev.target.value;
            for (const bid of ['btn-pdf-cliente', 'btn-pdf-orden']) { const b = document.getElementById(bid); if (b) b.disabled = habilitar() || (bid === 'btn-pdf-orden' && esc() !== 'A'); }
          } }))) : null,
        !sumaOk ? aviso('err', t('rev.sumNot100', '')) : null);
    };
    pintarZona();
    const hay = () => q.lineas.length > 0;
    const bloqueado = () => { const Tt = T(); return !Tt || !(Tt.precio > 0) || !hay() || !puedeGenerarPdf(Tt.margenBp, aj.margenPisoBp, confirmTxt).ok; };
    const horasReales = q.horasReales;
    const realOut = viva(() => {
      const hr = q.horasReales;
      if (!hr) return nota(t('pint.s.realNone'));
      const est = R.horas.sinContingencia.probable;
      return h('div', { class: 'stack' }, h('p', { class: 'grande' }, t('pint.s.realCompare', num1(est), num1(hr.horas))),
        est > 0 ? h('p', {}, t('pint.s.realDiff', ((hr.horas - est) / est * 100 >= 0 ? '+' : '') + ((hr.horas - est) / est * 100).toFixed(0))) : null, nota(t('pint.s.realNote')));
    });
    let horasIn = horasReales ? horasReales.horas : null;
    add(cuerpo, h('h1', {}, t('pint.step5')),
      aviso('info', t('pint.s.neverSends')),
      h('section', { class: 'card stack' }, h('h2', {}, t('pint.s.summary')), zona,
        h('div', {}, h('label', { for: 'sel-lang-pdf' }, t('pdf.language')), h('select', { id: 'sel-lang-pdf', onchange: (ev) => { q.idiomaPdf = ev.target.value; guardar(); } }, [['en', 'English'], ['es', 'Español']].map(([v, n]) => h('option', { value: v, selected: L() === v ? '' : null }, n)))),
        h('p', {}, h('b', {}, t('pint.s.client')), ' ', t('pint.s.clientNote')),
        h('button', { id: 'btn-pdf-cliente', type: 'button', class: 'primary block', disabled: bloqueado() || null, onclick: () => emitir('cliente') }, t('pint.s.pdfClient')),
        nota(t('pint.s.pdfClientNote')),
        h('button', { id: 'btn-pdf-interno', type: 'button', class: 'block', disabled: (!hay() || null), onclick: () => emitir('interno') }, t('pint.s.pdfInternal')),
        nota(t('pdf.internalNote'))),
      h('section', { class: 'card stack' }, h('h2', {}, t('pint.s.orderTitle')), nota(t('pint.s.orderHint')),
        esc() !== 'A' ? aviso('info', t('pint.s.orderOnlyA')) : null,
        field({ label: t('pint.s.subName'), value: ordenCfg.sub, onInput: (v) => { ordenCfg.sub = v.trim(); guardar(); } }),
        campoPct(t('pint.s.retention'), P.retencionBp / 100, (v) => { P.retencionBp = Math.min(5000, Math.round((v || 0) * 100)); guardar(); }, { hint: t('pint.s.retentionHint') }),
        field({ label: t('pint.s.orderNotes'), area: true, value: ordenCfg.notas, onInput: (v) => { ordenCfg.notas = v; guardar(); } }),
        aviso('warn', t('pint.a.legal')),
        h('button', { id: 'btn-pdf-orden', type: 'button', class: 'block', disabled: (bloqueado() || esc() !== 'A') || null, onclick: () => emitir('orden') }, t('pint.s.pdfOrder')),
        nota(t('pint.s.orderReview'))),
      estado,
      h('section', { class: 'card stack' }, h('h2', {}, t('pint.s.realTitle')), nota(t('pint.s.realHint')),
        campoNum(t('pint.s.realHours'), horasIn, (v) => { horasIn = v; }, { step: '0.5' }),
        h('button', { id: 'btn-horas-reales', type: 'button', class: 'block', onclick: () => {
          const inp = document.querySelector('#btn-horas-reales')?.previousElementSibling?.querySelector('input');
          const v = inp ? parseFloat(inp.value) : horasIn;
          if (!(v > 0)) { toast(t('pint.s.realBad'), 'err'); return; }
          q.horasReales = { horas: M.r2(v), estimadoProbable: R.horas.sinContingencia.probable, fecha: new Date().toISOString() };
          guardarYa(); refrescar(); toast(t('pint.s.realSaved'), 'ok');
        } }, t('pint.s.realSave')), realOut),
      h('section', { class: 'card stack' }, h('h2', {}, t('pint.s.legalTitle')), aviso('warn', t('legal.disclaimer'))));
    pintarBarra();
  }

  // ----- armado de la pantalla -----
  sincronizar(); // por si se tocó la cotización desde otra pantalla (p. ej. "Usar en costos" del plano)
  const pasos = h('nav', { class: 'steps pasos', 'aria-label': t('pint.stepsNav') }, PASOS.map((n) => h('button', { type: 'button', 'aria-current': n === p0 ? 'step' : null, onclick: () => irA(n) }, `${n}. ${t(TITULO_PASO[n])}`)));
  shell(q.cliente.nombre || t('pint.title'), h('div', { class: 'pint' }, pasos, cuerpo, barra), '#/');
  render();
  pintarBarra();
  const h1 = cuerpo.querySelector('h1'); // el foco va al título del paso (lector de pantalla); shell() aún no lo veía
  if (h1) { h1.setAttribute('tabindex', '-1'); h1.focus({ preventScroll: true }); }
  guardar();
}
