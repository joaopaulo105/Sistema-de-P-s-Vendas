// Roteador mínimo + validação de entrada.

export class HttpError extends Error {
  constructor(status, mensagem, campos) { super(mensagem); this.status = status; this.campos = campos; }
}

export class Router {
  constructor() { this.rotas = []; }
  add(metodo, padrao, handler, opcoes = {}) {
    const chaves = [];
    const re = new RegExp('^' + padrao.replace(/:(\w+)/g, (_, k) => { chaves.push(k); return '([^/]+)'; }) + '/?$');
    this.rotas.push({ metodo, re, chaves, handler, opcoes });
  }
  get(p, h, o) { this.add('GET', p, h, o); }
  post(p, h, o) { this.add('POST', p, h, o); }
  put(p, h, o) { this.add('PUT', p, h, o); }
  del(p, h, o) { this.add('DELETE', p, h, o); }
  encontrar(metodo, caminho) {
    let existeCaminho = false;
    for (const r of this.rotas) {
      const m = r.re.exec(caminho);
      if (!m) continue;
      existeCaminho = true;
      if (r.metodo !== metodo) continue;
      const params = Object.fromEntries(r.chaves.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      return { rota: r, params };
    }
    return existeCaminho ? 'metodo' : null;
  }
}

// ---- validação ----
export const txt = (v, max = 500) => (v == null ? '' : String(v).trim().slice(0, max));
export const opc = (v, max = 500) => { const t = txt(v, max); return t || null; };
export const num = (v, padrao = 0) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : padrao; };
export const int = v => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; };
export const bool = v => v === true || v === 1 || v === '1' || v === 'true' || v === 'on';
const reData = /^\d{4}-\d{2}-\d{2}$/;
const reDataHora = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
export const data = v => (v && reData.test(String(v)) ? String(v) : null);
export const dataHora = v => (v && reDataHora.test(String(v).slice(0, 16)) ? String(v).slice(0, 16) : null);

export function exigir(obj, rotulos) {
  const faltando = Object.entries(rotulos).filter(([k]) => obj[k] == null || obj[k] === '').map(([, r]) => r);
  if (faltando.length) throw new HttpError(400, `Preencha: ${faltando.join(', ')}.`, faltando);
}
export function existe(row, oque) {
  if (!row) throw new HttpError(404, `${oque} não encontrado.`);
  return row;
}
