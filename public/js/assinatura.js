// Área de assinatura com o dedo (celular/tablet) ou mouse. Gera PNG legível na impressão/PDF.

const LARGURA_MAX = 1000; // px do PNG exportado — mantém a imagem bem abaixo do limite do servidor
const MARGEM = 10;

export class Assinatura {
  constructor(canvas, { valor = null, bloqueada = false, aoMudar = () => {} } = {}) {
    this.c = canvas;
    this.valor = valor;
    this.bloqueada = bloqueada;
    this.aoMudar = aoMudar;
    this.caixa = null; // retângulo ocupado pelos traços (px CSS), usado para recortar o PNG
    // Só redesenha quando o tamanho da área muda de verdade. No celular a barra de endereço
    // aparece/some ao rolar e dispara "resize" na janela, o que apagava a assinatura.
    this.obs = new ResizeObserver(() => this.ajustar());
    this.obs.observe(canvas);
    this.ajustar();
    if (!bloqueada) this.ligar();
  }

  ajustar() {
    const r = this.c.getBoundingClientRect();
    if (!r.width || (r.width === this.w && r.height === this.h)) return;
    this.w = r.width; this.h = r.height;
    this.dpr = window.devicePixelRatio || 1;
    this.c.width = Math.round(r.width * this.dpr);
    this.c.height = Math.round(r.height * this.dpr);
    this.g = this.c.getContext('2d');
    this.g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.g.lineCap = 'round';
    this.g.lineJoin = 'round';
    this.g.strokeStyle = '#0B1A3A'; // tinta escura sobre papel branco nos dois temas
    this.caixa = null;
    if (this.valor) this.desenharImagem(this.valor);
  }

  /** Desenha uma assinatura salva centralizada na área, sem distorcer. */
  desenharImagem(src) {
    const img = new Image();
    img.onload = () => {
      if (this.valor !== src) return;
      const nw = img.width / this.dpr, nh = img.height / this.dpr; // tamanho natural em px CSS
      const esc = Math.min(1, (this.w - 2 * MARGEM) / nw, (this.h - 2 * MARGEM) / nh);
      const iw = nw * esc, ih = nh * esc;
      const x = (this.w - iw) / 2, y = (this.h - ih) / 2;
      this.g.drawImage(img, x, y, iw, ih);
      this.marcar(x, y, 0); this.marcar(x + iw, y + ih, 0);
    };
    img.src = src;
  }

  marcar(x, y, folga) {
    const c = this.caixa || { x0: x, y0: y, x1: x, y1: y };
    this.caixa = { x0: Math.min(c.x0, x - folga), y0: Math.min(c.y0, y - folga), x1: Math.max(c.x1, x + folga), y1: Math.max(c.y1, y + folga) };
  }

  /** PNG recortado em volta dos traços, com no máximo LARGURA_MAX px de largura. */
  exportar() {
    if (!this.caixa) return null;
    const x0 = Math.max(0, this.caixa.x0 - MARGEM), y0 = Math.max(0, this.caixa.y0 - MARGEM);
    const x1 = Math.min(this.w, this.caixa.x1 + MARGEM), y1 = Math.min(this.h, this.caixa.y1 + MARGEM);
    const sw = (x1 - x0) * this.dpr, sh = (y1 - y0) * this.dpr;
    if (sw < 2 || sh < 2) return null;
    const esc = Math.min(1, LARGURA_MAX / sw);
    const out = document.createElement('canvas');
    out.width = Math.round(sw * esc); out.height = Math.round(sh * esc);
    out.getContext('2d').drawImage(this.c, x0 * this.dpr, y0 * this.dpr, sw, sh, 0, 0, out.width, out.height);
    return out.toDataURL('image/png');
  }

  ligar() {
    let desenhando = null, ultimo = null, mudou = false;
    const ponto = e => { const r = this.c.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, p: e.pressure > 0 && e.pointerType === 'pen' ? e.pressure : .5 }; };
    const traco = p => {
      this.g.lineWidth = 1.3 + p.p * 2.4;
      this.g.beginPath();
      this.g.moveTo(ultimo.x, ultimo.y);
      this.g.quadraticCurveTo(ultimo.x, ultimo.y, (ultimo.x + p.x) / 2, (ultimo.y + p.y) / 2);
      this.g.lineTo(p.x, p.y);
      this.g.stroke();
      this.marcar(p.x, p.y, this.g.lineWidth);
      ultimo = p; mudou = true;
    };
    this.c.addEventListener('pointerdown', e => {
      if (!e.isPrimary || desenhando != null) return; // ignora o segundo dedo
      desenhando = e.pointerId; ultimo = ponto(e);
      this.c.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    this.c.addEventListener('pointermove', e => {
      if (e.pointerId !== desenhando) return;
      // eventos agrupados deixam o traço do dedo mais liso em celulares
      for (const ev of e.getCoalescedEvents?.() || [e]) traco(ponto(ev));
    });
    const fim = e => {
      if (e.pointerId !== desenhando) return;
      desenhando = null;
      if (mudou) { mudou = false; this.valor = this.exportar(); this.aoMudar(this.valor); }
    };
    this.c.addEventListener('pointerup', fim);
    this.c.addEventListener('pointercancel', fim);
  }

  /** Troca a assinatura (ex.: a feita em tela cheia). */
  definir(valor) {
    this.g.clearRect(0, 0, this.w, this.h);
    this.caixa = null;
    this.valor = valor;
    if (valor) this.desenharImagem(valor);
    this.aoMudar(valor);
  }

  limpar() { this.definir(null); }

  destruir() { this.obs.disconnect(); }
}

/** HTML da área de assinatura com os botões "Tela cheia" e "Limpar". Ligue com montarAssinatura(). */
export const areaAssinatura = (id, { valor = null, bloqueada = false } = {}) => `<div class="sig-wrap${bloqueada ? ' locked' : ''}" data-sig="${id}">
    <canvas aria-label="Área de assinatura"></canvas><div class="base"></div><div class="x">×</div>
    <div class="ph"${valor ? ' hidden' : ''}>${bloqueada ? 'Sem assinatura' : 'Assine aqui'}</div>
    ${bloqueada ? '' : '<div class="tools"><button type="button" data-sig-acao="cheia">Tela cheia</button><button type="button" data-sig-acao="limpar">Limpar</button></div>'}
  </div>`;

/** Liga a área criada por areaAssinatura(). Devolve a Assinatura (chame destruir() ao sair da tela). */
export function montarAssinatura(root, id, { valor = null, bloqueada = false, titulo, aoMudar = () => {} } = {}) {
  const wrap = root.querySelector(`[data-sig="${id}"]`);
  const ph = wrap.querySelector('.ph');
  const pad = new Assinatura(wrap.querySelector('canvas'), { valor, bloqueada, aoMudar: v => { ph.hidden = !!v; aoMudar(v); } });
  wrap.addEventListener('click', async e => {
    const acao = e.target.closest('[data-sig-acao]')?.dataset.sigAcao;
    if (acao === 'limpar') pad.limpar();
    if (acao === 'cheia') {
      const v = await assinarTelaCheia({ valor: pad.valor, titulo });
      if (v !== undefined) pad.definir(v);
    }
  });
  return pad;
}

/**
 * Abre uma área de assinatura ocupando a tela inteira (pensada para o celular na horizontal).
 * Resolve com o PNG novo, null se foi limpa, ou undefined se a pessoa cancelou.
 */
export function assinarTelaCheia({ valor = null, titulo = 'Assinatura do cliente' } = {}) {
  return new Promise(resolve => {
    const anterior = document.activeElement;
    document.body.insertAdjacentHTML('beforeend', `<div class="sig-full" role="dialog" aria-modal="true" aria-label="${titulo}">
      <div class="sig-full-h">
        <div class="t"><b>${titulo}</b><span class="hint">Assine com o dedo dentro da área branca</span></div>
        <button class="btn sm" type="button" data-sf="limpar">Limpar</button>
        <button class="btn sm" type="button" data-sf="cancelar">Cancelar</button>
        <button class="btn sm pri" type="button" data-sf="ok">Concluir</button>
      </div>
      <div class="sig-wrap"><canvas aria-label="Área de assinatura em tela cheia"></canvas><div class="base"></div><div class="x">×</div></div>
      <div class="sig-full-gire"><p><b>Gire o celular na horizontal</b>para ter mais espaço para assinar.</p>
        <button class="btn" type="button" data-sf="vertical">Assinar na vertical mesmo</button></div>
    </div>`);
    const el = document.body.lastElementChild;
    const pad = new Assinatura(el.querySelector('canvas'), { valor });
    document.documentElement.classList.add('sig-full-aberta');

    // Android: tela cheia de verdade e trava na horizontal. No iPhone não existe; a sobreposição já cobre a tela.
    const tentouTelaCheia = !document.fullscreenElement && document.documentElement.requestFullscreen;
    if (tentouTelaCheia) {
      document.documentElement.requestFullscreen({ navigationUI: 'hide' })
        .then(() => screen.orientation?.lock?.('landscape'))
        .catch(() => {});
    }

    const fechar = res => {
      pad.destruir();
      el.remove();
      document.documentElement.classList.remove('sig-full-aberta');
      document.removeEventListener('keydown', tecla);
      try { screen.orientation?.unlock?.(); } catch { /* sem suporte */ }
      if (tentouTelaCheia && document.fullscreenElement) document.exitFullscreen().catch(() => {});
      anterior?.focus?.();
      resolve(res);
    };
    const tecla = e => { if (e.key === 'Escape') fechar(undefined); };
    document.addEventListener('keydown', tecla);
    el.addEventListener('click', e => {
      const acao = e.target.closest('[data-sf]')?.dataset.sf;
      if (acao === 'limpar') pad.limpar();
      if (acao === 'cancelar') fechar(undefined);
      if (acao === 'ok') fechar(pad.valor);
      if (acao === 'vertical') el.classList.add('vertical-ok');
    });
    el.querySelector('[data-sf="ok"]').focus();
  });
}
