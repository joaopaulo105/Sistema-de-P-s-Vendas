// Componentes de interface: aviso (toast), modal, confirmação e formulários em modal.
import { $, $$, esc, ic } from './util.js';

let tToast;
export function toast(msg, tipo = 'ok') {
  $('.toast')?.remove();
  clearTimeout(tToast);
  document.body.insertAdjacentHTML('beforeend',
    `<div class="toast${tipo === 'erro' ? ' erro' : ''}" role="${tipo === 'erro' ? 'alert' : 'status'}">${ic(tipo === 'erro' ? 'alert' : 'check')}<span>${esc(msg)}</span></div>`);
  tToast = setTimeout(() => $('.toast')?.remove(), tipo === 'erro' ? 5200 : 3200);
}
export const erro = e => toast(e?.message || String(e), 'erro');

// ---- sobreposição ----
let anterior = null;
export function abrir(html) {
  anterior = document.activeElement;
  const host = $('#overlay');
  host.innerHTML = html;
  const foco = $('[autofocus]', host) || $('.inp', host) || $('button', host);
  foco?.focus();
  return host.firstElementChild;
}
export function fechar() {
  $('#overlay').innerHTML = '';
  anterior?.focus?.();
}
export const aberto = () => !!$('#overlay').innerHTML;

document.addEventListener('click', e => {
  if (e.target.matches('.ov')) fechar();
  if (e.target.closest('[data-fechar]')) fechar();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && aberto()) fechar();
  // mantém o foco dentro do modal
  if (e.key === 'Tab' && aberto()) {
    const f = $$('#overlay button, #overlay a[href], #overlay input:not([type=hidden]):not([disabled]), #overlay select, #overlay textarea').filter(x => x.offsetParent !== null);
    if (!f.length) return;
    const [ini, fim] = [f[0], f[f.length - 1]];
    if (e.shiftKey && document.activeElement === ini) { e.preventDefault(); fim.focus(); }
    else if (!e.shiftKey && document.activeElement === fim) { e.preventDefault(); ini.focus(); }
  }
});

const cabecalho = titulo => `<div class="modal-h"><h2>${esc(titulo)}</h2><button class="btn icon ghost x" type="button" data-fechar aria-label="Fechar">${ic('x')}</button></div>`;

/** Modal simples com conteúdo e rodapé livres. */
export function modal({ titulo, corpo, rodape = '', largura = 640 }) {
  return abrir(`<div class="ov"><div class="modal" style="width:min(${largura}px,100%)" role="dialog" aria-modal="true" aria-label="${esc(titulo)}">
    ${cabecalho(titulo)}<div class="modal-b">${corpo}</div>${rodape ? `<div class="modal-f">${rodape}</div>` : ''}</div></div>`);
}

/** Confirmação dentro da página (sem confirm() do navegador). */
export function confirmar({ titulo, texto, ok = 'Confirmar', perigo = false }) {
  return new Promise(resolve => {
    const el = modal({ titulo, corpo: `<p>${esc(texto)}</p>`, largura: 460,
      rodape: `<button class="btn" type="button" data-r="0">Cancelar</button><button class="btn ${perigo ? 'danger' : 'pri'}" type="button" data-r="1" autofocus>${esc(ok)}</button>` });
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-r]');
      if (b) { fechar(); resolve(b.dataset.r === '1'); }
    });
    const obs = new MutationObserver(() => { if (!aberto()) { obs.disconnect(); resolve(false); } });
    obs.observe($('#overlay'), { childList: true });
  });
}

/** Modal com formulário. aoSalvar(dados) pode lançar erro: o modal continua aberto e mostra a mensagem. */
export function formModal({ titulo, corpo, ok = 'Salvar', largura = 640, aoSalvar }) {
  abrir(`<div class="ov"><form class="modal" style="width:min(${largura}px,100%)" role="dialog" aria-modal="true" aria-label="${esc(titulo)}" novalidate>
    ${cabecalho(titulo)}<div class="modal-b">${corpo}</div>
    <div class="modal-f"><button class="btn" type="button" data-fechar>Cancelar</button><button class="btn pri" type="submit">${esc(ok)}</button></div></form></div>`);
  const form = $('#overlay form');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    $$('.invalido', form).forEach(x => x.classList.remove('invalido'));
    const faltando = $$('[required]', form).filter(x => !String(x.value).trim());
    if (faltando.length) {
      faltando.forEach(x => x.classList.add('invalido'));
      faltando[0].focus();
      return toast('Preencha os campos obrigatórios marcados.', 'erro');
    }
    const dados = Object.fromEntries(new FormData(form));
    $$('input[type=checkbox][name]', form).forEach(c => { dados[c.name] = c.checked; });
    const btn = $('button[type=submit]', form);
    btn.classList.add('busy');
    try {
      await aoSalvar(dados, form);
      fechar();
    } catch (err) {
      erro(err);
    } finally {
      btn.classList.remove('busy');
    }
  });
  return form;
}

/** Campo de formulário padrão. */
export const campo = (nome, rotulo, valor = '', attrs = '', classe = '') =>
  `<div class="field ${classe}"><label for="f_${nome}">${esc(rotulo)}</label><input class="inp" id="f_${nome}" name="${nome}" value="${esc(valor ?? '')}" ${attrs}></div>`;
export const selecao = (nome, rotulo, opcoesHTML, classe = '', attrs = '') =>
  `<div class="field ${classe}"><label for="f_${nome}">${esc(rotulo)}</label><select class="inp" id="f_${nome}" name="${nome}" ${attrs}>${opcoesHTML}</select></div>`;
