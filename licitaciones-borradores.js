// licitaciones-borradores.js - Paso "Borradores": intención de cotizar, propuesta y RFI.
// La app NO envía nada: copia al portapapeles, abre mailto: (la persona pulsa Enviar) o descarga el PDF.
import { h, clear, usd, add, descargar, copiarTexto } from './util.js';
import { t } from './i18n.js';
import { S } from './state.js';
import { field, selectField, checkField, toast, aviso } from './ui.js';
import { calcularBid, vencimiento } from './bids-calc.js';
import { construirBorrador, bloqueos, armarMailto, mailtoLargo, contarMarcadores, TIPOS } from './bids-drafts.js';
import { TEXTO_CONFIRMACION } from './engine.js';
import { generarPdfBid, generarPdfBidInterno } from './pdf.js';

export function pasoBorradores({ body, bid, guardar }) {
  const ui = { tipo: 'intent', confirmaVencida: false, confirmaMarcadores: false, margenTxt: '' };
  bid.borradores = bid.borradores || {};
  const venc = () => vencimiento(bid.fechaLimite).vencida;
  const res = () => { try { return calcularBid(bid); } catch (e) { console.error(e); return null; } };
  const lang = () => bid.idiomaBorrador || 'en';
  const clave = () => `${ui.tipo}:${lang()}`;
  const ajVivo = () => ({ ...bid.snapshot.ajustes, empresa: S.ajustes.empresa, validezDias: S.ajustes.validezDias });

  const generado = () => construirBorrador({ tipo: ui.tipo, lang: lang(), bid, ajustes: S.ajustes, resumen: res(), rfi: bid.rfiTexto || '' });
  const actual = () => bid.borradores[clave()] || generado();

  const top = h('div'), editor = h('div'), acciones = h('div');
  let asuntoEl, cuerpoEl;

  const estadoBloqueo = (destino) => {
    const d = { asunto: asuntoEl?.value ?? '', cuerpo: cuerpoEl?.value ?? '' };
    return bloqueos({ destino, tipo: ui.tipo, ...d, textosCliente: ui.tipo === 'proposal' ? [bid.calif?.inclusiones, bid.calif?.exclusiones, bid.calif?.supuestos, bid.calif?.addenda] : [],
      vencida: venc(), confirmaVencida: ui.confirmaVencida, confirmaMarcadores: ui.confirmaMarcadores, resumen: res(), confirmaMargenTxt: ui.margenTxt });
  };

  function pintarAcciones() {
    clear(acciones);
    const r = res();
    const bm = estadoBloqueo('correo'), bp = estadoBloqueo('pdf');
    const marcadores = contarMarcadores(asuntoEl?.value, cuerpoEl?.value);
    const href = armarMailto({ para: bid.email, asunto: asuntoEl?.value ?? '', cuerpo: cuerpoEl?.value ?? '' });
    const razones = (lst) => lst.length ? h('ul', { class: 'razones' }, lst.map((c) => h('li', {}, t('bidblock.' + c)))) : null;
    add(acciones,
      venc() ? h('div', { class: 'card stack' }, aviso('err', h('b', {}, t('bid.expiredBanner')), ' ', t('bid.expiredConfirmHint')),
        checkField(t('bid.expiredConfirm'), ui.confirmaVencida, (v) => { ui.confirmaVencida = v; pintarAcciones(); })) : null,
      marcadores ? h('div', { class: 'card stack' }, aviso('warn', h('b', {}, t('bid.placeholders', marcadores)), ' ', t('bid.placeholdersHint')),
        checkField(t('bid.placeholdersConfirm'), ui.confirmaMarcadores, (v) => { ui.confirmaMarcadores = v; pintarAcciones(); })) : null,
      ui.tipo === 'proposal' && r && r.margenBp < r.pisoBp && r.total > 0 ? h('div', { class: 'card stack' },
        aviso('err', h('b', {}, t('pdf.blocked', (r.margenBp / 100).toFixed(1) + '%', (r.pisoBp / 100).toFixed(0) + '%')), ' ', t('pdf.blockedHint', TEXTO_CONFIRMACION)),
        h('div', {}, h('label', { for: 'bid-conf' }, t('pdf.confirmLabel')), h('input', { id: 'bid-conf', value: ui.margenTxt, placeholder: TEXTO_CONFIRMACION, oninput: (e) => { ui.margenTxt = e.target.value; refrescarBotones(); } }))) : null,
      h('div', { class: 'card stack' },
        h('div', { class: 'row' },
          h('button', { onclick: async () => toast((await copiarTexto(cuerpoEl.value)) ? t('bid.copied') : t('bid.copyFail'), 'ok') }, t('bid.copy')),
          h('button', { onclick: async () => toast((await copiarTexto(asuntoEl.value)) ? t('bid.copied') : t('bid.copyFail'), 'ok') }, t('bid.copySubject'))),
        h('button', { id: 'btn-mailto', class: 'primary block', disabled: bm.length ? true : null, onclick: () => abrirCorreo() }, t('bid.openMail')),
        razones(bm),
        !bid.email.trim() ? h('p', { class: 'muted' }, t('bid.noRecipient')) : null,
        h('p', { class: 'muted' }, t('bid.mailtoNote')),
        mailtoLargo(href) ? aviso('warn', t('bid.mailtoLong')) : null,
        ui.tipo === 'proposal' ? h('div', { class: 'stack' },
          h('button', { id: 'btn-pdf-bid', class: 'primary block', disabled: bp.length ? true : null, onclick: () => emitir('cliente') }, t('bid.genPdf')),
          razones(bp),
          h('button', { id: 'btn-pdf-bid-interno', class: 'block', onclick: () => emitir('interno') }, t('bid.genPdfInternal')),
          h('p', { class: 'muted' }, t('pdf.internalNote'))) : null,
        h('div', { id: 'bid-estado' })));
  }
  const refrescarBotones = () => {
    const bm = estadoBloqueo('correo'), bp = estadoBloqueo('pdf');
    const a = document.getElementById('btn-mailto'), b = document.getElementById('btn-pdf-bid');
    if (a) a.disabled = bm.length > 0;
    if (b) b.disabled = bp.length > 0;
  };

  function abrirCorreo() {
    if (estadoBloqueo('correo').length) return; // la UI ya lo deshabilita; doble seguro
    const href = armarMailto({ para: bid.email, asunto: asuntoEl.value, cuerpo: cuerpoEl.value });
    window.__ultimoMailto = href;
    if (!window.__noAbrirCorreo) { const a = h('a', { href }); document.body.append(a); a.click(); a.remove(); }
    toast(t('bid.mailOpened'), 'ok');
  }

  async function emitir(tipo) {
    const est = document.getElementById('bid-estado');
    clear(est); add(est, h('p', {}, h('span', { class: 'spin' }), ' ', t('ui.loading')));
    try {
      if (tipo === 'cliente' && estadoBloqueo('pdf').length) throw new Error(t('bidblock.generic'));
      const r = res();
      const doc = tipo === 'cliente' ? await generarPdfBid(bid, r, ajVivo(), lang()) : await generarPdfBidInterno(bid, r, ajVivo());
      const buf = doc.output('arraybuffer');
      window.__ultimoPdf = { tipo: 'bid-' + tipo, buf };
      const nombre = `${tipo === 'cliente' ? 'Propuesta' : 'INTERNO'}-LIC-${(bid.proyecto || 'proyecto').replace(/[^\w]+/g, '_').slice(0, 40)}.pdf`;
      descargar(nombre, new Blob([buf], { type: 'application/pdf' }));
      clear(est); add(est, aviso('ok', t('pdf.done', nombre)));
    } catch (e) { console.error(e); clear(est); add(est, aviso('err', t('pdf.fail') + ' ' + e.message)); }
  }

  function pintarEditor() {
    clear(editor);
    const d = actual();
    asuntoEl = h('input', { id: 'bid-asunto', value: d.asunto, onchange: (e) => { guardarBorrador(); pintarAcciones(); } });
    cuerpoEl = h('textarea', { id: 'bid-cuerpo', rows: '16', style: 'min-height:280px', onchange: () => { guardarBorrador(); pintarAcciones(); } });
    cuerpoEl.value = d.cuerpo;
    asuntoEl.addEventListener('input', refrescarBotones); cuerpoEl.addEventListener('input', refrescarBotones);
    add(editor, h('div', { class: 'card stack' },
      field({ label: t('bid.to'), type: 'email', inputmode: 'email', value: bid.email || '', onInput: (v) => { bid.email = v.trim(); guardar(); pintarAcciones(); }, hint: t('bid.toHint') }),
      h('div', {}, h('label', { for: 'bid-asunto' }, t('bid.subject')), asuntoEl),
      h('div', {}, h('label', { for: 'bid-cuerpo' }, t('bid.bodyLabel')), cuerpoEl),
      h('button', { class: 'small ghost', onclick: () => { delete bid.borradores[clave()]; guardar(); pintarEditor(); pintarAcciones(); } }, t('bid.regenerate')),
      h('p', { class: 'muted' }, t('bid.regenerateHint'))));
  }
  function guardarBorrador() { bid.borradores[clave()] = { asunto: asuntoEl.value, cuerpo: cuerpoEl.value }; guardar(); }

  const pintarTop = () => {
    clear(top);
    add(top, aviso('info', h('b', {}, t('bid.neverSends')), ' ', t('bid.neverSendsHint')),
      h('div', { class: 'card stack' },
        selectField(t('bid.draftType'), TIPOS.map((x) => [x, t('bidtype.' + x)]), ui.tipo, (v) => { ui.tipo = v; pintarTodo(); }),
        selectField(t('bid.draftLang'), [['en', 'English'], ['es', 'Español']], lang(), (v) => { bid.idiomaBorrador = v; guardar(); pintarTodo(); }),
        ui.tipo === 'rfi' ? field({ label: t('bid.rfiText'), area: true, value: bid.rfiTexto || '', onInput: (v) => { bid.rfiTexto = v; delete bid.borradores[clave()]; guardar(); pintarEditor(); pintarAcciones(); } }) : null,
        ui.tipo === 'proposal' ? propuestaResumen() : null));
  };
  function propuestaResumen() {
    const r = res();
    if (!r || !r.total) return aviso('warn', t('bidblock.sinPrecio'));
    return h('p', {}, t('bid.proposalTotal'), ' ', h('b', {}, usd(r.total)), r.hayDesglose ? ` · ${r.grupos.length} ${t('bid.breakouts').toLowerCase()}` : '');
  }
  const pintarTodo = () => { pintarTop(); pintarEditor(); pintarAcciones(); };
  pintarTodo();
  add(body, top, editor, acciones);
}
