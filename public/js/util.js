// Utilitários de formatação e pequenos componentes em texto HTML.

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const ic = nome => `<svg class="i" aria-hidden="true"><use href="img/icones.svg#${nome}"/></svg>`;

const iso = d => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
export const hoje = () => iso(new Date());
export const somarDias = n => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
export const diasAte = s => Math.round((new Date(s.slice(0, 10) + 'T12:00') - new Date(hoje() + 'T12:00')) / 864e5);
export const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export function fmtD(s) {
  if (!s) return '—';
  if (s instanceof Date || /T\d{2}:\d{2}:\d{2}/.test(s)) {
    const d = new Date(s);
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  const [y, m, d] = s.slice(0, 10).split('-');
  return `${d}/${m}/${y}` + (s.length > 10 ? ' ' + s.slice(11, 16) : '');
}
export const brl = n => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const n2 = v => { const x = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(x) ? x : 0; };
export const iniciais = nome => String(nome || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join('');

// ---- cores ----
export const corTipo = cor => `var(--t-${(Number(cor) || 0) % 7})`;
export const STATUS = { 'Novo': 'var(--info)', 'Locação': 'var(--t-2)', 'Comodato': 'var(--warn)', 'Venda': 'var(--ok)', 'Sucata': 'var(--muted)' };
export const SITUACAO = { 'Em aberto': 'var(--warn)', 'Aprovado': 'var(--ok)', 'Recusado': 'var(--crit)' };

// ---- selos ----
export const chipTipo = (nome, sigla, cor) => `<span class="chip" style="--c:${corTipo(cor)}"><span class="w">${esc(sigla || '—')}</span>${esc(nome || '—')}</span>`;
export const pill = (texto, cor) => `<span class="pill" style="--c:${cor}">${esc(texto)}</span>`;
export const pillStatus = s => pill(s, STATUS[s] || 'var(--muted)');
export function dueChip(data) {
  const n = diasAte(data);
  const c = n < 0 ? 'var(--crit)' : n <= 7 ? 'var(--warn)' : 'var(--ok)';
  const t = n < 0 ? `${-n}d atrasada` : n === 0 ? 'hoje' : `em ${n}d`;
  return `<span class="due" style="--c:${c}">${t}</span>`;
}
export const calendario = (data, cor) => {
  const [, m, d] = data.split('-');
  return `<div class="cal" style="--c:${corTipo(cor)}"><span>${MES[+m - 1]}</span><b class="num">${d}</b></div>`;
};
export const opcoes = (lista, selecionado, rotulo = x => x.nome, valor = x => x.id) =>
  lista.map(x => `<option value="${esc(valor(x))}"${String(valor(x)) === String(selecionado ?? '') ? ' selected' : ''}>${esc(rotulo(x))}</option>`).join('');

/** Lista de manutenções pendentes (painel, sino e aviso ao entrar). */
export function agendaHTML(lista) {
  if (!lista.length) return '';
  return `<ul class="agenda">${lista.map(p => `<li><a href="#/equipamento/${p.parque_id}">
      ${calendario(p.data, p.unidade.cor)}
      <div style="min-width:0"><div class="ttl">${esc(p.unidade.equipamento)} <span class="mono muted">${esc(p.unidade.serie)}</span></div>
      <div class="meta">${esc(p.unidade.fantasia)} · ${esc(p.descricao)}</div></div>
      ${dueChip(p.data)}</a></li>`).join('')}</ul>`;
}

export const vazio = (titulo, texto) => `<div class="empty"><b>${esc(titulo)}</b>${esc(texto)}</div>`;

export const armazenamento = {
  ler(k) { try { return localStorage.getItem(k); } catch { return null; } },
  gravar(k, v) { try { localStorage.setItem(k, v); } catch { /* indisponível */ } },
  lerSessao(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
  gravarSessao(k, v) { try { sessionStorage.setItem(k, v); } catch { /* indisponível */ } },
};