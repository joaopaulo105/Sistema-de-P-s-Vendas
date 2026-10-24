// Lista de orçamentos.
import { api } from '../api.js';
import { esc, ic, fmtD, brl, pill, SITUACAO, vazio } from '../util.js';

export default async function orcamentos() {
  const lista = await api.get('api/orcamentos');
  return {
    titulo: 'Orçamentos',
    html: `<section class="card">
      <div class="card-h"><h2>Orçamentos</h2><span class="sub">peças, mão de obra e deslocamento · numeração por ano</span>
        <div class="r"><a class="btn pri" href="#/orcamentos/novo">${ic('plus')}Novo orçamento</a></div></div>
      ${lista.length ? `<div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Número</th><th>Data</th><th>Cliente</th><th>Equipamento</th><th>Situação</th><th class="r">Valor total</th><th><span class="sr-only">Documento</span></th></tr></thead>
        <tbody>${lista.map(o => `<tr class="click" data-href="#/orcamentos/${o.id}" tabindex="0">
          <td class="mono">${esc(o.codigo)}</td><td class="num">${fmtD(o.data)}</td><td>${esc(o.fantasia || '—')}</td>
          <td>${esc(o.equipamento || '—')}<span class="t2 mono">${esc(o.serie || '')}</span></td>
          <td>${pill(o.situacao, SITUACAO[o.situacao])}</td>
          <td class="r num"><b style="font-weight:600">${brl(o.total)}</b></td>
          <td class="r"><a class="btn sm ghost icon" href="documento.html?tipo=orcamento&id=${o.id}" aria-label="Abrir documento ${esc(o.codigo)}">${ic('print')}</a></td>
        </tr>`).join('')}</tbody></table></div>` : vazio('Nenhum orçamento', 'Crie um orçamento a partir de um equipamento do parque.')}
    </section>`,
    montar(root) {
      const ir = e => {
        if (e.target.closest('a')) return;
        const tr = e.target.closest('[data-href]');
        if (tr && (e.type === 'click' || e.key === 'Enter')) location.hash = tr.dataset.href;
      };
      root.addEventListener('click', ir);
      root.addEventListener('keydown', ir);
      return () => { root.removeEventListener('click', ir); root.removeEventListener('keydown', ir); };
    },
  };
}