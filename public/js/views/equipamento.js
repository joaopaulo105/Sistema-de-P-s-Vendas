// Detalhe do equipamento no parque: dados, manutenções programadas e todo o histórico de movimentações.
import { api } from '../api.js';
import { esc, ic, fmtD, chipTipo, pillStatus, dueChip, calendario, opcoes, somarDias, hoje, STATUS, vazio } from '../util.js';
import { formModal, campo, selecao, toast, erro, confirmar } from '../ui.js';

const ROTULOS = {
  cadastro: ['Cadastro', 'var(--accent)'], transferencia: ['Transferência', 'var(--t-3)'], status: ['Status', 'var(--warn)'],
  manutencao_agendada: ['Manutenção agendada', 'var(--info)'], manutencao_realizada: ['Manutenção realizada', 'var(--ok)'],
  relatorio: ['Relatório técnico', 'var(--t-2)'], orcamento: ['Orçamento', 'var(--t-1)'],
};

/** Item da linha do tempo (usado também no painel). */
export function linhaHistorico(h, mostrarEquip = false) {
  const [rot, cor] = ROTULOS[h.tipo] || ['Ocorrência', 'var(--muted)'];
  const doc = h.ref_id ? (h.ref_tipo === 'relatorio' ? `documento.html?tipo=relatorio&id=${h.ref_id}` : h.ref_tipo === 'orcamento' ? `#/orcamentos/${h.ref_id}` : '') : '';
  return `<li><span class="nd" style="--c:${cor}"></span><div>
    <div class="h">${esc(h.ocorrencia)}</div>
    <div class="m"><span class="num">${fmtD(h.data)}</span> · ${rot}${h.usuario ? ` · ${esc(h.usuario)}` : ''}
      ${mostrarEquip && h.equipamento ? ` · <a href="#/equipamento/${h.parque_id}">${esc(h.equipamento)} ${esc(h.serie)}</a> · ${esc(h.fantasia)}` : ''}
      ${doc ? ` · <a href="${doc}">${h.ref_tipo === 'relatorio' ? 'abrir relatório técnico' : 'abrir orçamento'}</a>` : ''}</div></div></li>`;
}

/** Modal para agendar manutenção (com canais de alerta). */
export async function agendarManutencao(parqueId, aoSalvar) {
  const parque = (await api.get('api/parque')).filter(u => u.status !== 'Sucata');
  if (!parque.length) return erro(new Error('Não há equipamentos ativos no parque.'));
  formModal({
    titulo: 'Agendar manutenção',
    corpo: `<div class="grid g2">
      ${selecao('parque_id', 'Equipamento', opcoes(parque, parqueId, u => `${u.fantasia} — ${u.equipamento} · ${u.serie}`), 'spanall')}
      ${campo('data', 'Data programada *', somarDias(30), `type="date" required min="${hoje()}"`)}
      ${campo('descricao', 'Serviço *', 'Manutenção preventiva', 'required maxlength="200"')}
      <div class="field spanall"><span class="lbl">Alertas</span>
        <div style="display:flex;flex-wrap:wrap;gap:20px;margin-top:4px">
          <label class="check"><input type="checkbox" name="alerta_email" checked> E-mail</label>
          <label class="check"><input type="checkbox" name="alerta_celular" checked> Celular</label>
          <label class="check muted"><input type="checkbox" checked disabled> Lista ao acessar o sistema</label>
        </div>
        <span class="hint">Os alertas vão para técnicos e administradores ativos, conforme a antecedência definida em Ajustes.</span></div></div>`,
    ok: 'Agendar',
    aoSalvar: async dados => { await api.post('api/manutencoes', dados); toast('Manutenção agendada.'); aoSalvar(); },
  });
}

function movimentar(u, clientes, aoSalvar) {
  formModal({
    titulo: 'Transferência de propriedade / status',
    corpo: `<div class="grid g2">
      ${selecao('cliente_id', 'Cliente', opcoes(clientes, u.cliente_id, c => `${c.fantasia} — ${c.nome}`), 'spanall')}
      ${selecao('status', 'Status', opcoes(Object.keys(STATUS).map(s => ({ id: s, nome: s })), u.status))}
      ${campo('data', 'Data da movimentação', hoje(), 'type="date"')}
      ${campo('obs', 'Observação', '', 'placeholder="Motivo, contrato, nota fiscal…" maxlength="300"', 'spanall')}
      <p class="hint spanall">Atual: ${esc(u.fantasia)} · ${esc(u.status)}. A alteração fica registrada no histórico do equipamento.</p></div>`,
    ok: 'Registrar',
    aoSalvar: async dados => { await api.post(`api/parque/${u.id}/movimentar`, dados); toast('Movimentação registrada no histórico.'); aoSalvar(); },
  });
}

export default async function equipamento(ctx) {
  const id = ctx.params[0];
  const u = await api.get(`api/parque/${id}`);
  const pend = u.manutencoes.filter(m => !m.realizada);
  const feitas = u.manutencoes.filter(m => m.realizada);
  const mt = m => `<div class="mt${m.realizada ? ' done' : ''}">
    ${calendario(m.data, u.cor)}
    <div style="min-width:0"><div class="t">${esc(m.descricao)}</div>
      <div class="meta hint"><span class="num">${fmtD(m.data)}</span>${m.realizada ? `<span>realizada em ${fmtD(m.realizada_em)}</span>` : dueChip(m.data)}
        <span class="ch" title="Canais de alerta">${m.alerta_email ? ic('mail') : ''}${m.alerta_celular ? ic('phone') : ''}</span></div></div>
    <div class="acts">${m.realizada ? '' : `<button class="btn sm" type="button" data-realizar="${m.id}" title="Marcar como realizada">${ic('check')}<span class="sr-only">Realizada</span></button>
      <button class="btn sm ghost icon danger" type="button" data-excluir="${m.id}" aria-label="Excluir manutenção">${ic('trash')}</button>`}</div></div>`;

  return {
    titulo: u.equipamento,
    eyebrow: 'Parque instalado · Equipamento',
    html: `
    <div class="statusbar"><a class="btn ghost" href="#/parque">${ic('back')}Parque instalado</a></div>
    <section class="card"><div class="card-b eq-head">
      <div class="row">${chipTipo(u.tipo, u.sigla, u.cor)} ${pillStatus(u.status)}</div>
      <h2>${esc(u.equipamento)}</h2>
      <div class="row"><span class="serial">${esc(u.serie)}</span><span class="muted">${esc(u.marca)} · ${esc(u.modelo)}</span></div>
      <div class="row" style="margin-top:4px">
        <a class="btn sm pri" href="#/relatorios/novo?parque=${u.id}">${ic('wrench')}Relatório técnico</a>
        <a class="btn sm" href="#/orcamentos/novo?parque=${u.id}">${ic('receipt')}Orçamento</a>
        <button class="btn sm" type="button" data-agendar>${ic('cal')}Agendar manutenção</button>
        <button class="btn sm" type="button" data-movimentar>${ic('swap')}Transferir / alterar status</button>
      </div>
    </div></section>

    <div class="ro">
      <div class="w2"><span class="lbl">Cliente</span><p>${esc(u.cliente_nome)}</p></div>
      <div><span class="lbl">Nome fantasia</span><p>${esc(u.fantasia)}</p></div>
      <div><span class="lbl">CNPJ</span><p class="mono">${esc(u.cnpj || '—')}</p></div>
      <div><span class="lbl">Telefone</span><p>${esc(u.telefone || '—')}</p></div>
      <div><span class="lbl">Data de instalação</span><p class="num">${fmtD(u.data_instalacao)}</p></div>
    </div>

    <div class="eq-grid">
      <section>
        <div class="sec-t"><h3>Manutenções programadas</h3></div>
        <div class="mt-list">${pend.length ? pend.map(mt).join('') : '<p class="hint">Nenhuma manutenção pendente.</p>'}</div>
        ${feitas.length ? `<div class="sec-t" style="margin-top:22px"><h3>Realizadas</h3></div><div class="mt-list">${feitas.slice(-5).reverse().map(mt).join('')}</div>` : ''}
      </section>
      <section>
        <div class="sec-t"><h3>Histórico de movimentações</h3></div>
        <div class="card flat">${u.historico.length ? `<ul class="tl">${u.historico.map(h => linhaHistorico(h)).join('')}</ul>` : vazio('Sem histórico', '')}</div>
      </section>
    </div>`,
    montar(root) {
      const recarregar = () => { ctx.atualizarAgenda(); ctx.recarregar(); };
      const clique = async e => {
        if (e.target.closest('[data-agendar]')) return agendarManutencao(u.id, recarregar);
        if (e.target.closest('[data-movimentar]')) return movimentar(u, await api.get('api/clientes'), recarregar);
        const r = e.target.closest('[data-realizar]');
        if (r) { try { await api.post(`api/manutencoes/${r.dataset.realizar}/realizar`); toast('Manutenção marcada como realizada.'); recarregar(); } catch (err) { erro(err); } }
        const x = e.target.closest('[data-excluir]');
        if (x && await confirmar({ titulo: 'Excluir manutenção', texto: 'Remover esta manutenção da programação? Os alertas dela também serão removidos.', ok: 'Excluir', perigo: true })) {
          try { await api.del(`api/manutencoes/${x.dataset.excluir}`); toast('Manutenção removida.'); recarregar(); } catch (err) { erro(err); }
        }
      };
      root.addEventListener('click', clique);
      return () => root.removeEventListener('click', clique);
    },
  };
}