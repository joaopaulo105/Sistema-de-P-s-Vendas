// Central de alertas: situação dos canais (e-mail / celular) e registro de envios.
import { api, qs } from '../api.js';
import { esc, ic, fmtD, pill, vazio } from '../util.js';
import { toast, erro, selecao } from '../ui.js';

const COR = { enviado: 'var(--ok)', pendente: 'var(--info)', erro: 'var(--crit)', 'sem-configuracao': 'var(--warn)' };
const ROTULO = { enviado: 'Enviado', pendente: 'Pendente', erro: 'Erro', 'sem-configuracao': 'Canal não configurado' };
const MARCO = m => m === 'antecipado' ? 'Aviso antecipado' : m === 'no-dia' ? 'No dia' : `Atraso · semana ${Number(m.split('-')[1]) + 1}`;
let filtroStatus = '';

export default async function alertas(ctx) {
  const d = await api.get('/api/alertas' + qs({ status: filtroStatus }));
  const admin = ctx.user.perfil === 'Administrador';
  const canal = (ok, nome, icone, cor, dica) => `<div class="canal" style="--c:${ok ? 'var(--ok)' : cor}">
    <span class="ic">${ic(icone)}</span>
    <div><b>${nome}</b><p class="hint">${ok ? 'Configurado e ativo.' : dica}</p></div>
    <span style="margin-left:auto">${ok ? pill('Ativo', 'var(--ok)') : pill('Não configurado', 'var(--warn)')}</span></div>`;

  return {
    titulo: 'Central de alertas',
    html: `
    <div class="canais">
      ${canal(d.canais.email, 'E-mail', 'mail', 'var(--warn)', 'Defina SMTP_HOST, SMTP_USER e SMTP_PASS no arquivo .env do servidor.')}
      ${canal(d.canais.celular, 'Celular (SMS / WhatsApp)', 'phone', 'var(--warn)', 'Defina ALERTA_WEBHOOK_URL no .env com o endereço do seu provedor de SMS/WhatsApp.')}
    </div>
    <div class="warnbox">${ic('alert')}<div>O servidor verifica as manutenções a cada hora e avisa técnicos e administradores ativos: na antecedência definida em Ajustes, no dia programado e uma vez por semana enquanto estiver atrasada. Cada aviso é enviado uma única vez por pessoa.</div></div>
    <section class="card">
      <div class="card-h"><h2>Registro de envios</h2>
        <span class="sub">${Object.entries(d.resumo).map(([k, v]) => `${ROTULO[k] || k}: ${v}`).join(' · ') || 'nenhum alerta gerado ainda'}</span>
        <div class="r">${admin ? `<button class="btn pri" type="button" data-executar>${ic('send')}Verificar e enviar agora</button>` : ''}</div></div>
      <form class="filters two" id="fAl">${selecao('status', 'Situação', `<option value="">Todas</option>${Object.entries(ROTULO).map(([k, v]) => `<option value="${k}"${k === filtroStatus ? ' selected' : ''}>${v}</option>`).join('')}`)}</form>
      ${d.lista.length ? `<div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Gerado em</th><th>Canal</th><th>Destinatário</th><th>Manutenção</th><th>Marco</th><th>Situação</th></tr></thead>
        <tbody>${d.lista.map(a => `<tr>
          <td class="num">${fmtD(a.criado_em)}</td>
          <td><span style="display:inline-flex;gap:6px;align-items:center">${ic(a.canal === 'email' ? 'mail' : 'phone')}${a.canal === 'email' ? 'E-mail' : 'Celular'}</span></td>
          <td>${esc(a.destinatario || '—')}<span class="t2">${esc(a.destino)}</span></td>
          <td>${a.parque_id ? `<a href="#/equipamento/${a.parque_id}">${esc(a.equipamento)} ${esc(a.serie)}</a>` : '—'}<span class="t2">${esc(a.fantasia || '')} · ${fmtD(a.data)}</span></td>
          <td>${MARCO(a.marco)}</td>
          <td>${pill(ROTULO[a.status], COR[a.status])}${a.erro ? `<span class="t2">${esc(a.erro)}</span>` : ''}${a.enviado_em ? `<span class="t2">${fmtD(a.enviado_em)}</span>` : ''}</td>
        </tr>`).join('')}</tbody></table></div>` : vazio('Nenhum alerta neste filtro', 'Os alertas aparecem aqui quando uma manutenção entra na janela de aviso.')}
    </section>`,
    montar(root) {
      const clique = async e => {
        const b = e.target.closest('[data-executar]');
        if (!b) return;
        b.classList.add('busy');
        try {
          const r = await api.post('/api/alertas/executar');
          toast(`Verificação concluída: ${r.enviados} enviado(s), ${r.falhas} com erro, ${r.sem_configuracao} aguardando configuração.`);
          ctx.recarregar();
        } catch (err) { erro(err); } finally { b.classList.remove('busy'); }
      };
      const troca = e => { if (e.target.closest('#fAl')) { filtroStatus = e.target.value; ctx.recarregar(); } };
      root.addEventListener('click', clique);
      root.addEventListener('change', troca);
      return () => { root.removeEventListener('click', clique); root.removeEventListener('change', troca); };
    },
  };
}
