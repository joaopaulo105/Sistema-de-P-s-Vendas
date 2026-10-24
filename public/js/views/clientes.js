// Cadastro de cliente.
import { api } from '../api.js';
import { esc, ic, vazio } from '../util.js';
import { formModal, campo, toast, confirmar, erro } from '../ui.js';

function abrirFormulario(c, aoSalvar) {
  c = c || {};
  formModal({
    titulo: c.id ? 'Editar cliente' : 'Novo cliente',
    corpo: `<div class="grid g2">
      ${campo('nome', 'Razão social / Nome *', c.nome, 'required autofocus maxlength="200"', 'spanall')}
      ${campo('fantasia', 'Nome fantasia *', c.fantasia, 'required maxlength="120"')}
      ${campo('cnpj', 'CNPJ', c.cnpj, 'inputmode="numeric" placeholder="00.000.000/0000-00" maxlength="20"')}
      ${campo('endereco', 'Endereço', c.endereco, 'maxlength="300"', 'spanall')}
      ${campo('cidade', 'Cidade', c.cidade, 'maxlength="80"')}
      ${campo('estado', 'Estado', c.estado, 'maxlength="40" placeholder="UF"')}
      ${campo('telefone', 'Telefone', c.telefone, 'inputmode="tel" maxlength="40"')}
      ${campo('email', 'E-mail', c.email, 'type="email" maxlength="160"')}</div>`,
    aoSalvar: async dados => {
      if (c.id) await api.put(`api/clientes/${c.id}`, dados); else await api.post('api/clientes', dados);
      toast('Cliente salvo.');
      aoSalvar();
    },
  });
}

// máscara simples de CNPJ enquanto digita
function mascaraCnpj(v) {
  const d = v.replace(/\D/g, '').slice(0, 14);
  return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2');
}

export default async function clientes(ctx) {
  const lista = await api.get('api/clientes');
  const admin = ctx.user.perfil === 'Administrador';
  return {
    titulo: 'Clientes',
    html: `<section class="card">
      <div class="card-h"><h2>Clientes</h2><span class="sub">${lista.length} cadastrado${lista.length === 1 ? '' : 's'} · os dados alimentam relatórios e orçamentos</span>
        <div class="r"><button class="btn pri" type="button" data-novo>${ic('plus')}Novo cliente</button></div></div>
      ${lista.length ? `<div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Razão social / Fantasia</th><th>CNPJ</th><th>Contato</th><th>Endereço</th><th class="r">Equip.</th><th><span class="sr-only">Ações</span></th></tr></thead>
        <tbody>${lista.map(c => `<tr>
          <td><b>${esc(c.nome)}</b><span class="t2">${esc(c.fantasia)}</span></td>
          <td class="mono">${esc(c.cnpj || '—')}</td>
          <td>${esc(c.telefone || '—')}<span class="t2">${esc(c.email || '')}</span></td>
          <td style="max-width:280px">${esc(c.endereco || '—')}${c.cidade || c.estado ? `<span class="t2">${esc([c.cidade, c.estado].filter(Boolean).join(' / '))}</span>` : ''}</td>
          <td class="r num"><a href="#/parque?cliente=${c.id}">${c.equipamentos}</a></td>
          <td class="r" style="white-space:nowrap"><button class="btn sm ghost icon" type="button" data-editar="${c.id}" aria-label="Editar ${esc(c.fantasia)}">${ic('edit')}</button>
            ${admin && !c.equipamentos ? `<button class="btn sm ghost icon danger" type="button" data-excluir="${c.id}" aria-label="Excluir ${esc(c.fantasia)}">${ic('trash')}</button>` : ''}</td>
        </tr>`).join('')}</tbody></table></div>`
        : vazio('Nenhum cliente ainda', 'Cadastre o primeiro cliente para vincular equipamentos.')}
    </section>`,
    montar(root) {
      const recarregar = () => ctx.recarregar();
      const porId = id => lista.find(c => c.id === id);
      const clique = async e => {
        if (e.target.closest('[data-novo]')) abrirFormulario(null, recarregar);
        const ed = e.target.closest('[data-editar]');
        if (ed) abrirFormulario(porId(ed.dataset.editar), recarregar);
        const ex = e.target.closest('[data-excluir]');
        if (ex) {
          const c = porId(ex.dataset.excluir);
          if (!await confirmar({ titulo: 'Excluir cliente', texto: `Excluir “${c.fantasia}”? Esta ação não pode ser desfeita.`, ok: 'Excluir', perigo: true })) return;
          try { await api.del(`api/clientes/${c.id}`); toast('Cliente excluído.'); recarregar(); } catch (err) { erro(err); }
        }
      };
      const mascara = e => { if (e.target.name === 'cnpj') e.target.value = mascaraCnpj(e.target.value); };
      root.addEventListener('click', clique);
      document.addEventListener('input', mascara);
      return () => { root.removeEventListener('click', clique); document.removeEventListener('input', mascara); };
    },
  };
}