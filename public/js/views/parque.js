// Equipamentos · Visualização: parque instalado com filtros e vínculo de equipamento ao cliente.
import { api, qs } from '../api.js';
import { $, esc, ic, fmtD, chipTipo, pillStatus, dueChip, opcoes, hoje, STATUS, vazio } from '../util.js';
import { formModal, campo, selecao, toast, erro } from '../ui.js';

const filtros = { cliente_id: '', fantasia: '', tipo_id: '', nome: '', status: '' };
const statusOpc = Object.keys(STATUS).map(s => ({ id: s, nome: s }));

function vincular(clientes, equipamentos, tipos, aoSalvar) {
  if (!clientes.length || !equipamentos.length) return erro(new Error('Cadastre ao menos um cliente e um equipamento no catálogo antes de vincular.'));
  const tipoNome = new Map(tipos.map(t => [t.id, t.nome]));
  formModal({
    titulo: 'Vincular equipamento ao cliente',
    corpo: `<div class="grid g2">
      ${selecao('cliente_id', 'Cliente', opcoes(clientes, filtros.cliente_id, c => `${c.fantasia} — ${c.nome}`), 'spanall')}
      ${selecao('equipamento_id', 'Equipamento (tipo, marca e modelo vêm do catálogo)', opcoes(equipamentos, '', e => `${e.nome} · ${e.marca} ${e.modelo} (${tipoNome.get(e.tipo_id) || '—'})`), 'spanall')}
      <div class="field"><label for="f_serie">Número de série *</label><input class="inp mono" id="f_serie" name="serie" required autofocus maxlength="80" placeholder="Ex.: BC6K-24A/0917#B"><span class="hint">Aceita números, letras e caracteres especiais.</span></div>
      ${selecao('status', 'Status', opcoes(statusOpc, 'Novo'))}
      ${campo('data_instalacao', 'Data', hoje(), 'type="date"')}
      ${campo('primeira_manutencao', 'Primeira manutenção (opcional)', '', `type="date" min="${hoje()}"`)}</div>`,
    ok: 'Vincular',
    aoSalvar: async dados => {
      const r = await api.post('/api/parque', dados);
      toast('Equipamento vinculado.');
      aoSalvar(r.id);
    },
  });
}

export default async function parque(ctx) {
  if (ctx.query.cliente) filtros.cliente_id = ctx.query.cliente;
  const [lista, clientes, tipos] = await Promise.all([api.get('/api/parque' + qs(filtros)), api.get('/api/clientes'), api.get('/api/tipos')]);

  const linhas = l => l.length ? `<div class="tbl-wrap"><table class="tbl">
    <thead><tr><th>Nº de série</th><th>Equipamento</th><th>Tipo</th><th>Cliente</th><th>Status</th><th>Próx. manutenção</th></tr></thead>
    <tbody>${l.map(u => `<tr class="click" data-ir="${u.id}" tabindex="0">
      <td><span class="serial">${esc(u.serie)}</span></td>
      <td><b>${esc(u.equipamento)}</b><span class="t2">${esc(u.marca)} · ${esc(u.modelo)}</span></td>
      <td>${chipTipo(u.tipo, u.sigla, u.cor)}</td>
      <td>${esc(u.fantasia)}<span class="t2">${esc(u.cliente_nome)}</span></td>
      <td>${pillStatus(u.status)}</td>
      <td>${u.proxima_manutencao ? `<span class="num">${fmtD(u.proxima_manutencao)}</span> ${dueChip(u.proxima_manutencao)}` : '<span class="muted">—</span>'}</td>
    </tr>`).join('')}</tbody></table></div>` : vazio('Nenhum equipamento encontrado', 'Ajuste os filtros ou vincule um equipamento a um cliente.');

  return {
    titulo: 'Parque instalado',
    html: `<section class="card">
      <div class="card-h"><h2>Parque instalado</h2><span class="sub" id="contagem">${lista.length} equipamento${lista.length === 1 ? '' : 's'}</span>
        <div class="r"><button class="btn pri" type="button" data-vincular>${ic('plus')}Vincular equipamento</button></div></div>
      <form class="filters" id="fParque" role="search" aria-label="Filtrar parque">
        ${selecao('cliente_id', 'Cliente', '<option value="">Todos</option>' + opcoes(clientes, filtros.cliente_id))}
        ${campo('fantasia', 'Nome fantasia', filtros.fantasia, 'placeholder="Buscar…" autocomplete="off"')}
        ${selecao('tipo_id', 'Tipo', '<option value="">Todos</option>' + opcoes(tipos, filtros.tipo_id))}
        ${campo('nome', 'Equipamento / série', filtros.nome, 'placeholder="Nome, modelo ou nº de série" autocomplete="off"')}
        ${selecao('status', 'Status', '<option value="">Todos</option>' + opcoes(statusOpc, filtros.status))}
        <button class="btn ghost" type="reset">Limpar</button>
      </form>
      <div id="resultado">${linhas(lista)}</div>
    </section>`,
    montar(root) {
      let t;
      const atualizar = async () => {
        try {
          const l = await api.get('/api/parque' + qs(filtros));
          $('#resultado', root).innerHTML = linhas(l);
          $('#contagem', root).textContent = `${l.length} equipamento${l.length === 1 ? '' : 's'}`;
        } catch (e) { erro(e); }
      };
      const entrada = e => {
        if (!e.target.closest('#fParque')) return;
        const nome = e.target.name.replace(/^f_/, '');
        filtros[nome] = e.target.value;
        clearTimeout(t); t = setTimeout(atualizar, e.target.tagName === 'INPUT' ? 250 : 0);
      };
      const reset = e => { if (e.target.id === 'fParque') { Object.keys(filtros).forEach(k => { filtros[k] = ''; }); setTimeout(atualizar); } };
      const ir = id => { location.hash = `#/equipamento/${id}`; };
      const clique = async e => {
        const tr = e.target.closest('[data-ir]');
        if (tr) return ir(tr.dataset.ir);
        if (e.target.closest('[data-vincular]')) {
          const [equipamentos] = await Promise.all([api.get('/api/equipamentos')]);
          vincular(clientes, equipamentos, tipos, novoId => { ctx.atualizarAgenda(); ir(novoId); });
        }
      };
      const tecla = e => { const tr = e.target.closest?.('[data-ir]'); if (tr && e.key === 'Enter') ir(tr.dataset.ir); };
      const sub = e => { if (e.target.id === 'fParque') e.preventDefault(); };
      root.addEventListener('input', entrada);
      root.addEventListener('reset', reset);
      root.addEventListener('click', clique);
      root.addEventListener('keydown', tecla);
      root.addEventListener('submit', sub);
      return () => {
        clearTimeout(t);
        ['input', 'reset', 'click', 'keydown', 'submit'].forEach((ev, i) => root.removeEventListener(ev, [entrada, reset, clique, tecla, sub][i]));
      };
    },
  };
}
