// borrado.js - Borrar (a la papelera, 30 días) y archivar con Deshacer. Lo usan las listas y los editores.
// REGLAS: solo se borran los borradores (ver papelera.js); lo enviado o cerrado solo se archiva.
// El PDF del plano en IndexedDB se borra SOLO cuando el Deshacer vence (o a los 30 días en la purga).
import { t } from './i18n.js';
import * as store from './store.js';
import { aPapelera, sacarDePapelera, archivar, desarchivar, puedeBorrar, puedeArchivar, idsPlanosPdf } from './papelera.js';
import { ofrecerDeshacer, toast } from './ui.js';

export const nombreDe = (tipo, it) => (tipo === 'cot' ? (it.cliente?.nombre || it.numero || t('home.noName')) : (it.proyecto || t('bid.noName')));

/** Mueve a la papelera y ofrece Deshacer. Devuelve false si la regla no lo permite. */
export async function borrarSuave(tipo, it) {
  if (!puedeBorrar(tipo, it)) return false;
  aPapelera(it);
  await store.guardarItem(tipo, it);
  ofrecerDeshacer({
    msg: tipo === 'cot' ? t('ui.quoteDeleted') : t('ui.bidDeleted'), etiqueta: nombreDe(tipo, it),
    deshacer: async () => { sacarDePapelera(it); await store.guardarItem(tipo, it); },
    expirar: () => { for (const id of idsPlanosPdf(it)) store.borrarPlanoPdf(id).catch(() => {}); },
  });
  return true;
}
export async function archivarConDeshacer(tipo, it) {
  if (!puedeArchivar(it)) return false;
  archivar(it);
  await store.guardarItem(tipo, it);
  ofrecerDeshacer({
    msg: tipo === 'cot' ? t('ui.quoteArchived') : t('ui.bidArchived'), etiqueta: nombreDe(tipo, it),
    deshacer: async () => { desarchivar(it); await store.guardarItem(tipo, it); },
  });
  return true;
}
export async function sacarDelArchivo(tipo, it) {
  desarchivar(it);
  await store.guardarItem(tipo, it);
  toast(t('ui.unarchived'));
}
