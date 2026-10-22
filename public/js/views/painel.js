// Painel: indicadores, programação de manutenção, parque por tipo/status e movimentações recentes.
import { api } from '../api.js';
import { esc, ic, brl, corTipo, STATUS, agendaHTML, vazio } from '../util.js';
import { linhaHistorico } from './equipamento.js';

export default async function painel() {
  const d = await api.get('/api/painel');
  const dataLonga = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const { atrasadas, proximas, semana, faixas } = d.manutencao;
  const maxF = Math.max(1, ...faixas);
  const maxT = Math.max(1, ...d.por_tipo.map(t => t.n));
  const manchete = atrasadas
    ? `${atrasadas} manutenç${atrasadas > 1 ? 'ões atrasadas pedem' : 'ão atrasada pede'} atenção`
    : 'Parque em dia';

  return {
    titulo: 'Painel',
    html: `
    <div class="hello">
      <div><span class="hint">${esc(dataLonga.charAt(0).toUpperCase() + dataLonga.slice(1))}</span><h2>${manchete}</h2></div>
      <div class="acts">
        <a class="btn" href="#/manutencoes?agendar=1">${ic('cal')}Agendar manutenção</a>
        <a class="btn" href="#/orcamentos/novo">${ic('receipt')}Novo orçamento</a>
      </div>
    </div>

    <section class="kpis" aria-label="Indicadores">
      <div class="kpi" style="--k:var(--accent)"><span class="lbl">Parque ativo</span>
        <div class="v">${d.parque.ativos}<small>/ ${d.parque.total}</small></div><div class="d">equipamentos em clientes</div></div>
      <div class="kpi" style="--k:var(--crit)"><span class="lbl">Atrasadas</span>
        <div class="v" style="color:${atrasadas ? 'var(--crit)' : 'inherit'}">${atrasadas}</div><div class="d">manutenções vencidas</div></div>
      <div class="kpi" style="--k:var(--warn)"><span class="lbl">Próximos 30 dias</span>
        <div class="v">${proximas}</div><div class="d">${semana} nesta semana</div>
        <div class="spark" title="Manutenções a cada 5 dias" aria-hidden="true">${faixas.map(n => `<i style="height:${Math.max(2, n / maxF * 26)}px;opacity:${.3 + .7 * n / maxF}"></i>`).join('')}</div></div>
      <div class="kpi" style="--k:var(--t-2)"><span class="lbl">Relatórios ${d.ano}</span>
        <div class="v">${d.relatorios.ano}</div><div class="d">${d.relatorios.finalizados} finalizados · ${d.relatorios.rascunhos} em rascunho</div></div>
      <div class="kpi" style="--k:var(--t-1)"><span class="lbl">Orçamentos em aberto</span>
        <div class="v sm">${brl(d.orcamentos.valor)}</div><div class="d">${d.orcamentos.abertos} documento${d.orcamentos.abertos === 1 ? '' : 's'}</div></div>
    </section>

    <div class="dash">
      <section class="card">
        <div class="card-h"><h2>Programação de manutenção</h2><span class="sub">atrasadas e próximos 30 dias</span>
          <div class="r"><a class="btn sm ghost" href="#/manutencoes">Ver tudo</a></div></div>
        ${agendaHTML(d.agenda) || vazio('Nenhuma manutenção no período', 'Agende a próxima pela tela do equipamento.')}
      </section>
      <div class="dash-col">
        <section class="card"><div class="card-h"><h2>Parque por tipo</h2><span class="sub">equipamentos ativos</span></div>
          <div class="card-b bars">${d.por_tipo.map(t => `<div class="bar-row"><span>${esc(t.nome)}</span>
            <div class="bar-track"><i style="--c:${corTipo(t.cor)};width:${t.n / maxT * 100}%"></i></div><b>${t.n}</b></div>`).join('') || '<span class="hint">Nenhum tipo cadastrado.</span>'}</div>
        </section>
        <section class="card"><div class="card-h"><h2>Status do parque</h2></div>
          <div class="card-b">${d.por_status.length ? `
            <div class="stack" role="img" aria-label="${d.por_status.map(s => `${s.status}: ${s.n}`).join(', ')}">${d.por_status.map(s => `<i style="--c:${STATUS[s.status]};flex:${s.n}" title="${s.status}: ${s.n}"></i>`).join('')}</div>
            <div class="legend">${d.por_status.map(s => `<span style="--c:${STATUS[s.status]}">${s.status} <b class="num">${s.n}</b></span>`).join('')}</div>`
            : '<span class="hint">Nenhum equipamento no parque.</span>'}</div>
        </section>
      </div>
    </div>

    <section class="card"><div class="card-h"><h2>Movimentações recentes</h2><span class="sub">histórico de todo o parque</span></div>
      ${d.recentes.length ? `<ul class="tl">${d.recentes.map(h => linhaHistorico(h, true)).join('')}</ul>` : vazio('Sem movimentações', 'Vincule um equipamento a um cliente para começar o histórico.')}
    </section>`,
  };
}
