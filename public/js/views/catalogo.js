// Equipamentos · Cadastro: tipos (com opção de incluir mais) e catálogo de nome/marca/modelo.
import { api } from '../api.js';
import { esc, ic, chipTipo, corTipo, opcoes, vazio } from '../util.js';
import { formModal, campo, selecao, toast, erro } from '../ui.js';

function abrirEquipamento(e, tipos, aoSalvar) {
  e = e || { tipo_id: tipos[0]?.id };
  formModal({
    titulo: e.id ? 'Editar equipamento' : 'Novo equipamento',
    corpo: `<div class="grid g2">
      ${campo('nome', 'Nome do equipamento *', e.nome, 'required autofocus maxlength="160"', 'spanall')}
      ${campo('marca', 'Marca *', e.marca, 'required maxlength="80"')}
      ${campo('modelo', 'Modelo *', e.modelo, 'required maxlength="80"')}
      ${selecao('tipo_id', 'Tipo', opcoes(tipos, e.tipo_id), 'spanall')}</div>`,
    aoSalvar: async dados => {
      if (e.id) await api.put(`api/equipamentos/${e.id}`, dados); else await api.post('api/equipamentos', dados);
      toast('Equipamento salvo no catálogo.');
      aoSalvar();
    },
  });
}

export default async function catalogo(ctx) {
  const [tipos, equipamentos] = await Promise.all([api.get('api/tipos'), api.get('api/equipamentos')]);
  const tipoPorId = new Map(tipos.map(t => [t.id, t]));
  return {
    titulo: 'Catálogo de equipamentos',
    html: `<div class="cat">
      <section class="card">
        <div class="card-h"><h2>Tipos</h2><span class="sub">linhas de equipamento</span></div>
        <ul class="types">${tipos.map(t => `<li><span class="sw" style="--c:${corTipo(t.cor)}">${esc(t.sigla)}</span>
          <span class="n">${esc(t.nome)}</span><span class="c">${t.modelos} modelo${t.modelos === 1 ? '' : 's'}</span></li>`).join('')}</ul>
        <form class="card-b type-form" id="fTipo" novalidate>
          <div class="field" style="flex:1;min-width:140px"><label for="tNome">Incluir novo tipo</label><input class="inp" id="tNome" name="nome" placeholder="Ex.: Imunologia" maxlength="60" required></div>
          <div class="field" style="width:80px"><label for="tSigla">Sigla</label><input class="inp mono" id="tSigla" name="sigla" maxlength="4" placeholder="IMU"></div>
          <button class="btn pri" type="submit">${ic('plus')}Incluir</button>
        </form>
      </section>
      <section class="card">
        <div class="card-h"><h2>Equipamentos</h2><span class="sub">nome, marca e modelo de cada equipamento comercializado</span>
          <div class="r"><button class="btn pri" type="button" data-novo>${ic('plus')}Novo equipamento</button></div></div>
        ${equipamentos.length ? `<div class="tbl-wrap"><table class="tbl">
          <thead><tr><th>Nome do equipamento</th><th>Marca</th><th>Modelo</th><th>Tipo</th><th class="r">No parque</th><th><span class="sr-only">Ações</span></th></tr></thead>
          <tbody>${equipamentos.map(e => {
      const t = tipoPorId.get(e.tipo_id) || {}; return `<tr>
            <td><b>${esc(e.nome)}</b></td><td>${esc(e.marca)}</td><td class="mono">${esc(e.modelo)}</td>
            <td>${chipTipo(t.nome, t.sigla, t.cor)}</td><td class="r num">${e.no_parque}</td>
            <td class="r"><button class="btn sm ghost icon" type="button" data-editar="${e.id}" aria-label="Editar ${esc(e.nome)}">${ic('edit')}</button></td></tr>`;
    }).join('')}
          </tbody></table></div>` : vazio('Catálogo vazio', 'Cadastre os equipamentos que sua empresa comercializa.')}
      </section></div>`,
    montar(root) {
      const clique = e => {
        if (e.target.closest('[data-novo]')) abrirEquipamento(null, tipos, ctx.recarregar);
        const ed = e.target.closest('[data-editar]');
        if (ed) abrirEquipamento(equipamentos.find(x => x.id === ed.dataset.editar), tipos, ctx.recarregar);
      };
      const enviar = async e => {
        if (e.target.id !== 'fTipo') return;
        e.preventDefault();
        const f = Object.fromEntries(new FormData(e.target));
        if (!f.nome.trim()) return erro(new Error('Informe o nome do tipo.'));
        try { await api.post('api/tipos', f); toast(`Tipo “${f.nome.trim()}” incluído.`); ctx.recarregar(); } catch (err) { erro(err); }
      };
      root.addEventListener('click', clique);
      root.addEventListener('submit', enviar);
      return () => { root.removeEventListener('click', clique); root.removeEventListener('submit', enviar); };
    },
  };
}