// Cadastro de usuário (somente administradores alteram).
import { api } from '../api.js';
import { esc, ic, pill, opcoes } from '../util.js';
import { formModal, campo, selecao, toast } from '../ui.js';

const PERFIS = ['Técnico', 'Administrador', 'Comercial'].map(p => ({ id: p, nome: p }));

function abrirFormulario(u, aoSalvar) {
  const novo = !u;
  u = u || { ativo: true, perfil: 'Técnico' };
  formModal({
    titulo: novo ? 'Novo usuário' : 'Editar usuário',
    corpo: `<div class="grid g2">
      ${campo('nome', 'Nome completo *', u.nome, 'required autofocus maxlength="120"', 'spanall')}
      ${campo('email', 'E-mail de acesso *', u.email, 'type="email" required autocomplete="off"')}
      ${campo('telefone', 'Celular (recebe alertas)', u.telefone, 'inputmode="tel"')}
      ${selecao('perfil', 'Perfil', opcoes(PERFIS, u.perfil))}
      ${campo('senha', novo ? 'Senha inicial *' : 'Nova senha (opcional)', '', `type="password" minlength="8" autocomplete="new-password" ${novo ? 'required' : ''}`)}
      <label class="check spanall"><input type="checkbox" name="ativo"${u.ativo ? ' checked' : ''}> Usuário ativo (pode entrar e recebe alertas)</label>
      <p class="hint spanall">Técnicos e administradores ativos recebem os alertas de manutenção no e-mail e no celular cadastrados.</p></div>`,
    aoSalvar: async dados => {
      if (!dados.senha) delete dados.senha;
      if (novo) await api.post('/api/usuarios', dados); else await api.put(`/api/usuarios/${u.id}`, dados);
      toast('Usuário salvo.');
      aoSalvar();
    },
  });
}

export default async function usuarios(ctx) {
  const lista = await api.get('/api/usuarios');
  const admin = ctx.user.perfil === 'Administrador';
  return {
    titulo: 'Usuários',
    html: `<section class="card">
      <div class="card-h"><h2>Usuários</h2><span class="sub">técnicos aparecem como responsáveis nos documentos</span>
        ${admin ? `<div class="r"><button class="btn pri" type="button" data-novo>${ic('plus')}Novo usuário</button></div>` : ''}</div>
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Nome</th><th>Perfil</th><th>E-mail</th><th>Celular</th><th>Situação</th><th><span class="sr-only">Ações</span></th></tr></thead>
        <tbody>${lista.map(u => `<tr>
          <td><b>${esc(u.nome)}</b>${u.id === ctx.user.id ? '<span class="t2">você</span>' : ''}</td><td>${esc(u.perfil)}</td>
          <td>${esc(u.email)}</td><td class="num">${esc(u.telefone || '—')}</td>
          <td>${u.ativo ? pill('Ativo', 'var(--ok)') : pill('Inativo', 'var(--muted)')}</td>
          <td class="r">${admin ? `<button class="btn sm ghost icon" type="button" data-editar="${u.id}" aria-label="Editar ${esc(u.nome)}">${ic('edit')}</button>` : ''}</td>
        </tr>`).join('')}</tbody></table></div>
      ${admin ? '' : '<div class="card-b hint">Somente administradores podem cadastrar ou alterar usuários.</div>'}
    </section>`,
    montar(root) {
      const clique = e => {
        if (e.target.closest('[data-novo]')) abrirFormulario(null, ctx.recarregar);
        const ed = e.target.closest('[data-editar]');
        if (ed) abrirFormulario(lista.find(u => u.id === ed.dataset.editar), ctx.recarregar);
      };
      root.addEventListener('click', clique);
      return () => root.removeEventListener('click', clique);
    },
  };
}
