// Programação de manutenção: filtro por período e cliente, relatório para impressão.
import { api, qs } from '../api.js';
import { $, esc, ic, fmtD, dueChip, opcoes, vazio } from '../util.js';
import { toast, erro, selecao } from '../ui.js';
import { agendarManutencao } from './equipamento.js';

const PERIODOS = [['atrasadas', 'Somente atrasadas'], ['7', 'Até 7 dias'], ['30', 'Até 30 dias'], ['90', 'Até 90 dias'], ['todas', 'Todas pendentes']].map(([id, nome]) => ({ id, nome }));
const filtro = { periodo: '30', cliente_id: '' };

export default async function manutencoes(ctx) {
  const [lista, clientes] = await Promise.all([api.get('api/manutencoes' + qs(filtro)), api.get('api/clientes')]);

  const tabela = l => l.length ? `<div class="tbl-wrap"><table class="tbl">
    <thead><tr><th>Data</th><th>Equipamento</th><th>Cliente</th><th>Serviço</th><th>Alertas</th><th><span class="sr-only">Ações</span></th></tr></thead>
    <tbody>${l.map(p => `<tr class="click" data-ir="${p.parque_id}" tabindex="0">
      <td><span class="num">${fmtD(p.data)}</span><span class="t2">${dueChip(p.data)}</span></td>
      <td>${esc(p.unidade.equipamento)}<span class="t2 mono">${esc(p.unidade.serie)}</span></td>
      <td>${esc(p.unidade.fantasia)}</td><td>${esc(p.descricao)}</td>
      <td><span class="muted" style="display:inline-flex;gap:6px">${p.alerta_email ? ic('mail') : ''}${p.alerta_celular ? ic('phone') : ''}</span></td>
      <td class="r"><button class="btn sm" type="button" data-realizar="${p.id}">${ic('check')}Realizada</button></td>
    </tr>`).join('')}</tbody></table></div>` : vazio('Nada pendente neste filtro', 'Amplie o período ou agende uma nova manutenção.');

  const tela = {
    titulo: 'Programação de manutenção',
    html: `<section class="card">
      <div class="card-h"><h2>Programação de manutenção</h2><span class="sub" id="cont">${lista.length} pendente${lista.length === 1 ? '' : 's'}</span>
        <div class="r">
          <a class="btn" id="imprimir" href="documento.html?tipo=programacao${qs(filtro).replace('?', '&')}" target="_blank" rel="noopener">${ic('print')}Gerar relatório</a>
          <button class="btn pri" type="button" data-agendar>${ic('plus')}Agendar</button></div></div>
      <form class="filters two" id="fMt">
        ${selecao('periodo', 'Período', opcoes(PERIODOS, filtro.periodo))}
        ${selecao('cliente_id', 'Cliente', '<option value="">Todos</option>' + opcoes(clientes, filtro.cliente_id, c => c.fantasia))}
      </form>
      <div id="res">${tabela(lista)}</div>
    </section>`,
    montar(root) {
      const atualizar = async () => {
        try {
          const l = await api.get('api/manutencoes' + qs(filtro));
          $('#res', root).innerHTML = tabela(l);
          $('#cont', root).textContent = `${l.length} pendente${l.length === 1 ? '' : 's'}`;
          $('#imprimir', root).href = `documento.html?tipo=programacao${qs(filtro).replace('?', '&')}`;
        } catch (e) { erro(e); }
      };
      const entrada = e => { if (e.target.closest('#fMt')) { filtro[e.target.name] = e.target.value; atualizar(); } };
      const clique = async e => {
        if (e.target.closest('[data-agendar]')) return agendarManutencao('', () => { ctx.atualizarAgenda(); atualizar(); });
        const r = e.target.closest('[data-realizar]');
        if (r) {
          e.stopPropagation();
          try { await api.post(`api/manutencoes/${r.dataset.realizar}/realizar`); toast('Manutenção marcada como realizada.'); ctx.atualizarAgenda(); atualizar(); } catch (err) { erro(err); }
          return;
        }
        const tr = e.target.closest('[data-ir]');
        if (tr) location.hash = `#/equipamento/${tr.dataset.ir}`;
      };
      root.addEventListener('change', entrada);
      root.addEventListener('click', clique);
      if (ctx.query.agendar) agendarManutencao('', () => { ctx.atualizarAgenda(); atualizar(); });
      return () => { root.removeEventListener('change', entrada); root.removeEventListener('click', clique); };
    },
  };
  return tela;
}