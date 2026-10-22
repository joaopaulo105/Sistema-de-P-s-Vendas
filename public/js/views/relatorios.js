// Lista de relatórios técnicos.
import { api } from '../api.js';
import { esc, ic, fmtD, pill, vazio } from '../util.js';

export default async function relatorios() {
  const lista = await api.get('/api/relatorios');
  return {
    titulo: 'Relatórios técnicos',
    html: `<section class="card">
      <div class="card-h"><h2>Relatórios técnicos</h2><span class="sub">numeração reinicia a cada ano · ao finalizar, entra no histórico do equipamento</span>
        <div class="r"><a class="btn pri" href="#/relatorios/novo">${ic('plus')}Novo relatório</a></div></div>
      ${lista.length ? `<div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Número</th><th>Cliente</th><th>Equipamento</th><th>Responsável</th><th>Conclusão</th><th>Situação</th><th><span class="sr-only">Documento</span></th></tr></thead>
        <tbody>${lista.map(r => `<tr class="click" data-href="#/relatorios/${r.id}" tabindex="0">
          <td class="mono">${esc(r.codigo)}</td><td>${esc(r.fantasia || '—')}</td>
          <td>${esc(r.equipamento || '—')}<span class="t2 mono">${esc(r.serie || '')}</span></td>
          <td>${esc(r.tecnico || '—')}</td><td class="num">${fmtD(r.conclusao)}</td>
          <td>${r.status === 'finalizado' ? pill('Finalizado', 'var(--ok)') : pill('Rascunho', 'var(--warn)')}</td>
          <td class="r"><a class="btn sm ghost icon" href="/documento.html?tipo=relatorio&id=${r.id}" aria-label="Abrir documento ${esc(r.codigo)}">${ic('print')}</a></td>
        </tr>`).join('')}</tbody></table></div>` : vazio('Nenhum relatório', 'Crie o primeiro a partir de um equipamento do parque.')}
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
