// Editor do relatório técnico: dados do cadastro, atendimento, horas, datas e assinatura no celular.
import { api } from '../api.js';
import { $, $$, esc, ic, opcoes, pill, brl, n2 } from '../util.js';
import { toast, erro, confirmar } from '../ui.js';
import { areaAssinatura, montarAssinatura } from '../assinatura.js';

/** Bloco somente leitura com os dados trazidos do cadastro (usado também no orçamento). */
export function blocoCadastro(u) {
  u = u || {};
  const v = x => esc(x || '—');
  return `<div class="ro">
      <div class="w2"><span class="lbl">Nome</span><p>${v(u.cliente_nome)}</p></div><div><span class="lbl">Nome fantasia</span><p>${v(u.fantasia)}</p></div>
      <div><span class="lbl">CNPJ</span><p class="mono">${v(u.cnpj)}</p></div><div class="w2"><span class="lbl">Endereço</span><p>${v(u.endereco)}</p></div>
      <div><span class="lbl">Cidade</span><p>${v(u.cidade)}</p></div><div><span class="lbl">Estado</span><p>${v(u.estado)}</p></div><div><span class="lbl">Telefone</span><p>${v(u.telefone)}</p></div>
      <div class="w3"><span class="lbl">E-mail</span><p>${v(u.email)}</p></div>
    </div>
    <div class="ro" style="margin-top:12px">
      <div><span class="lbl">Equipamento</span><p>${v(u.equipamento)}</p></div>
      <div><span class="lbl">Modelo / Marca</span><p>${v(u.modelo)} / ${v(u.marca)}</p></div>
      <div><span class="lbl">Série</span><p class="mono">${v(u.serie)}</p></div>
    </div>`;
}

export const itemVazio = () => ({ codigo: '', descricao: '', quantidade: 1, valor_unitario: '' });

/** Linha editável da tabela de peças (usada também no orçamento). */
export const linhaItem = (it, i, bloqueado = false) => {
  const dis = bloqueado ? ' disabled' : '';
  return `<tr>
  <td><input class="inp mono" aria-label="Código do item ${i + 1}" data-i="${i}" data-f="codigo" value="${esc(it.codigo ?? '')}" maxlength="60"${dis}></td>
  <td><input class="inp" aria-label="Descrição do item ${i + 1}" data-i="${i}" data-f="descricao" value="${esc(it.descricao ?? '')}" maxlength="300"${dis}></td>
  <td><input class="inp num" aria-label="Quantidade do item ${i + 1}" type="number" min="0" step="1" data-i="${i}" data-f="quantidade" value="${esc(it.quantidade ?? '')}"${dis}></td>
  <td><input class="inp num" aria-label="Valor unitário do item ${i + 1}" type="number" min="0" step="0.01" data-i="${i}" data-f="valor_unitario" value="${esc(it.valor_unitario ?? '')}"${dis}></td>
  <td class="r num" data-lt="${i}">${brl(n2(it.quantidade) * n2(it.valor_unitario))}</td>
  <td>${bloqueado ? '' : `<button class="btn sm ghost icon danger" type="button" data-remover="${i}" aria-label="Remover item ${i + 1}">${ic('trash')}</button>`}</td>
</tr>`;
};

/** Totais de peças, horas técnicas e deslocamento. */
export function totais(d) {
  const itens = d.itens.reduce((s, i) => s + n2(i.quantidade) * n2(i.valor_unitario), 0);
  const mao = n2(d.horas) * n2(d.valor_hora);
  const desl = n2(d.deslocamento);
  return { itens, mao, desl, total: itens + mao + desl };
}

function dicaHoras(d) {
  if (!d.chegada || !d.saida) return 'Preencha chegada e saída para ver a permanência no local.';
  const h = (new Date(d.saida) - new Date(d.chegada)) / 36e5;
  return h > 0 ? `Permanência registrada: ${h.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} h` : 'A saída está antes da chegada.';
}

export default async function relatorio(ctx) {
  const novo = ctx.params[0] === 'novo';
  const [parque, usuarios, atual] = await Promise.all([
    api.get('/api/parque'), api.get('/api/usuarios'),
    novo ? null : api.get(`/api/relatorios/${ctx.params[0]}`),
  ]);
  const tecnicos = usuarios.filter(u => u.ativo);
  const d = atual ? { ...atual, itens: atual.itens.length ? atual.itens : [itemVazio()] } : {
    parque_id: ctx.query.parque || parque.find(u => u.status !== 'Sucata')?.id || '',
    tecnico_id: (tecnicos.find(u => u.id === ctx.user.id && u.perfil === 'Técnico') || tecnicos.find(u => u.perfil === 'Técnico') || tecnicos[0] || {}).id || '',
    responsavel: '', procedimentos: '', horas: '', chegada: '', saida: '', conclusao: '', retorno: '', proxima_manutencao: '',
    itens: [itemVazio()], valor_hora: '', deslocamento: '', assinatura: null, assinante_nome: '', assinante_doc: '', assinatura_tecnico: null, status: 'rascunho',
  };
  const bloqueado = d.status === 'finalizado';
  const t = totais(d);
  const dis = bloqueado ? ' disabled' : '';
  const unidadeDe = id => (bloqueado && d.unidade) || parque.find(u => u.id === id) || d.unidade;
  const v = x => esc(x ?? '');

  if (!parque.length) return { titulo: 'Relatório técnico', html: `<div class="card"><div class="empty"><b>Nenhum equipamento no parque</b>Vincule um equipamento a um cliente antes de emitir relatórios. <a href="#/parque">Ir para o parque</a></div></div>` };

  return {
    titulo: atual ? `Relatório técnico ${atual.codigo}` : 'Novo relatório técnico',
    eyebrow: 'Assistência',
    html: `
    <div class="statusbar">
      <a class="btn ghost" href="#/relatorios">${ic('back')}Relatórios</a>
      <span class="doc-no">${atual ? `<b>${esc(atual.codigo)}</b>` : 'Número gerado ao salvar'}</span>
      ${bloqueado ? pill('Finalizado', 'var(--ok)') : pill('Rascunho', 'var(--warn)')}
    </div>
    <form class="editor" id="fRt" autocomplete="off" novalidate>
      <div class="editor-main">
        ${bloqueado ? `<div class="lock">${ic('lock')}Relatório finalizado e incluído no histórico do equipamento. Os dados do cliente foram congelados na data da finalização.</div>` : ''}
        <section class="card"><div class="card-h"><h2>Cliente e equipamento</h2><span class="sub">dados trazidos do cadastro</span></div>
          <div class="card-b" style="display:flex;flex-direction:column;gap:16px">
            <div class="grid g2">
              <div class="field"><label for="rUni">Equipamento atendido</label><select class="inp" id="rUni" name="parque_id"${dis}>${opcoes(parque, d.parque_id, u => `${u.fantasia} — ${u.equipamento} · ${u.serie}`)}</select></div>
              <div class="field"><label for="rTec">Assistente técnico</label><select class="inp" id="rTec" name="tecnico_id"${dis}>${opcoes(tecnicos, d.tecnico_id, u => `${u.nome} (${u.perfil})`)}</select></div>
              <div class="field spanall"><label for="rResp">Responsável técnico do cliente</label><input class="inp" id="rResp" name="responsavel" maxlength="120" value="${v(d.responsavel)}" placeholder="Quem responde pelo laboratório"${dis}></div>
            </div>
            <div id="cadastro">${blocoCadastro(unidadeDe(d.parque_id))}</div>
          </div></section>

        <section class="card"><div class="card-h"><h2>Atendimento</h2></div>
          <div class="card-b grid g3">
            <div class="field spanall"><label for="rProc">Descrição dos procedimentos realizados</label>
              <textarea class="inp" id="rProc" name="procedimentos" maxlength="20000" placeholder="Diagnóstico, peças substituídas, ajustes, testes e controle de qualidade…"${dis}>${v(d.procedimentos)}</textarea></div>
            <div class="field"><label for="rCh">Data de chegada</label><input class="inp" type="datetime-local" id="rCh" name="chegada" value="${v(d.chegada)}"${dis}></div>
            <div class="field"><label for="rSa">Data de saída</label><input class="inp" type="datetime-local" id="rSa" name="saida" value="${v(d.saida)}"${dis}></div>
            <div class="field"><label for="rCo">Data da conclusão</label><input class="inp" type="date" id="rCo" name="conclusao" value="${v(d.conclusao)}"${dis}></div>
            <div class="field"><label for="rHr">Carga horária (h)</label><input class="inp num" type="number" min="0" step="0.25" id="rHr" name="horas" value="${v(d.horas)}" placeholder="0,00"${dis}><span class="hint" id="dicaHoras">${dicaHoras(d)}</span></div>
            <div class="field"><label for="rRet">Retorno (se houver)</label><input class="inp" type="date" id="rRet" name="retorno" value="${v(d.retorno)}"${dis}></div>
            <div class="field"><label for="rPx">Próxima manutenção</label><input class="inp" type="date" id="rPx" name="proxima_manutencao" value="${v(d.proxima_manutencao)}"${dis}>
              <span class="hint">Ao finalizar, entra na programação com alertas.</span></div>
          </div></section>

        <section class="card"><div class="card-h"><h2>Peças</h2>
          ${bloqueado ? '' : `<div class="r"><button class="btn sm" type="button" data-adicionar>${ic('plus')}Adicionar peça</button></div>`}</div>
          <div class="tbl-wrap"><table class="tbl items">
            <thead><tr><th style="width:140px">Código</th><th>Descrição</th><th style="width:90px">Quantidade</th><th style="width:130px">Valor unit.</th><th class="r" style="width:130px">Valor total</th><th style="width:48px"><span class="sr-only">Remover</span></th></tr></thead>
            <tbody id="itens">${d.itens.map((it, i) => linhaItem(it, i, bloqueado)).join('')}</tbody></table></div></section>

        <section class="card"><div class="card-h"><h2>Orçamento</h2><span class="sub">valores que saem no relatório</span></div>
          <div class="card-b grid g4">
            <div class="field"><label for="rVh">Valor da hora técnica (R$)</label><input class="inp num" type="number" min="0" step="0.01" id="rVh" name="valor_hora" value="${v(d.valor_hora)}"${dis}></div>
            <div class="field"><label for="rMo">Total em horas técnicas</label><input class="inp num" id="rMo" readonly value="${brl(t.mao)}"></div>
            <div class="field"><label for="rDs">Deslocamento (R$)</label><input class="inp num" type="number" min="0" step="0.01" id="rDs" name="deslocamento" value="${v(d.deslocamento)}"${dis}></div>
            <div class="field"><label for="rTot">Valor total</label><input class="inp num" id="rTot" readonly value="${brl(t.total)}"></div>
          </div></section>

        <section class="card"><div class="card-h"><h2>Assinatura do cliente</h2><span class="sub">assine com o dedo no celular ou com o mouse · no celular, use “Tela cheia”</span></div>
          <div class="card-b grid g2">
            <div class="spanall">${areaAssinatura('cliente', { valor: d.assinatura, bloqueada: bloqueado })}</div>
            <div class="field"><label for="rNm">Nome completo</label><input class="inp" id="rNm" name="assinante_nome" maxlength="160" value="${v(d.assinante_nome)}" placeholder="Quem recebeu o atendimento"${dis}></div>
            <div class="field"><label for="rDc">Documento</label><input class="inp" id="rDc" name="assinante_doc" maxlength="60" value="${v(d.assinante_doc)}" placeholder="RG, CPF ou registro profissional"${dis}></div>
          </div></section>

        <section class="card"><div class="card-h"><h2>Assinatura do técnico</h2><span class="sub">assessor técnico responsável pelo atendimento</span></div>
          <div class="card-b">${areaAssinatura('tecnico', { valor: d.assinatura_tecnico, bloqueada: bloqueado })}</div></section>
      </div>

      <aside class="sticky-side">
        <section class="card"><div class="card-h"><h2>Ações</h2></div>
          <div class="card-b side-actions">
            ${bloqueado ? '' : `<button class="btn" type="button" data-acao="salvar">${ic('file')}Salvar rascunho</button>
              <button class="btn pri" type="button" data-acao="finalizar">${ic('check')}Finalizar relatório</button>`}
            ${atual ? `<a class="btn" href="/documento.html?tipo=relatorio&id=${atual.id}">${ic('print')}Imprimir / gerar PDF</a>` : ''}
            ${atual && !bloqueado ? `<button class="btn ghost danger" type="button" data-acao="excluir">${ic('trash')}Excluir rascunho</button>` : ''}
            <p class="hint">Para finalizar: procedimentos, data da conclusão, assistente técnico, assinatura e nome completo.</p>
          </div></section>
      </aside>
    </form>`,

    montar(root) {
      const form = $('#fRt', root);
      const pads = [
        montarAssinatura(root, 'cliente', { valor: d.assinatura, bloqueada: bloqueado, titulo: 'Assinatura do cliente', aoMudar: val => { d.assinatura = val; } }),
        montarAssinatura(root, 'tecnico', { valor: d.assinatura_tecnico, bloqueada: bloqueado, titulo: 'Assinatura do técnico', aoMudar: val => { d.assinatura_tecnico = val; } }),
      ];
      const ler = () => {
        const f = Object.fromEntries(new FormData(form));
        return { ...f, itens: d.itens, assinatura: d.assinatura, assinatura_tecnico: d.assinatura_tecnico };
      };
      const recalcular = () => {
        const tt = totais(ler());
        d.itens.forEach((it, i) => { const c = $(`[data-lt="${i}"]`, root); if (c) c.textContent = brl(n2(it.quantidade) * n2(it.valor_unitario)); });
        $('#rMo', root).value = brl(tt.mao);
        $('#rTot', root).value = brl(tt.total);
      };
      const redesenharItens = () => { $('#itens', root).innerHTML = d.itens.map((it, i) => linhaItem(it, i)).join(''); recalcular(); };
      const entrada = e => {
        const el = e.target;
        if (el.dataset.i != null) d.itens[+el.dataset.i][el.dataset.f] = el.value;
        if (el.name === 'parque_id') $('#cadastro', root).innerHTML = blocoCadastro(unidadeDe(el.value));
        if (el.name === 'chegada' || el.name === 'saida') $('#dicaHoras', root).textContent = dicaHoras(ler());
        recalcular();
      };
      let registro = atual; // depois do primeiro POST, as próximas gravações usam PUT
      const salvar = async () => {
        registro = registro ? await api.put(`/api/relatorios/${registro.id}`, ler()) : await api.post('/api/relatorios', ler());
        return registro;
      };
      const clique = async e => {
        if (e.target.closest('[data-adicionar]')) { d.itens.push(itemVazio()); redesenharItens(); $$('[data-f="codigo"]', root).pop()?.focus(); return; }
        const rm = e.target.closest('[data-remover]');
        if (rm) { d.itens.splice(+rm.dataset.remover, 1); if (!d.itens.length) d.itens.push(itemVazio()); redesenharItens(); return; }
        const b = e.target.closest('[data-acao]');
        if (!b) return;
        b.classList.add('busy');
        try {
          if (b.dataset.acao === 'salvar') {
            const r = await salvar();
            toast(`Rascunho ${r.codigo} salvo.`);
            if (novo) location.hash = `#/relatorios/${r.id}`; else ctx.recarregar();
          }
          if (b.dataset.acao === 'finalizar') {
            const dados = ler();
            const falta = [];
            if (!dados.procedimentos?.trim()) falta.push('procedimentos');
            if (!dados.conclusao) falta.push('data da conclusão');
            if (!dados.assinatura) falta.push('assinatura');
            if (!dados.assinante_nome?.trim()) falta.push('nome completo');
            if (falta.length) throw new Error(`Falta preencher: ${falta.join(', ')}.`);
            if (!await confirmar({ titulo: 'Finalizar relatório', texto: 'Depois de finalizado, o relatório entra no histórico do equipamento e não pode mais ser alterado.', ok: 'Finalizar' })) return;
            const salvo = await salvar();
            const r = await api.post(`/api/relatorios/${salvo.id}/finalizar`, dados);
            toast(`${r.codigo} finalizado e incluído no histórico do equipamento.`);
            ctx.atualizarAgenda();
            if (novo) location.hash = `#/relatorios/${r.id}`; else ctx.recarregar();
          }
          if (b.dataset.acao === 'excluir') {
            if (!await confirmar({ titulo: 'Excluir rascunho', texto: `Excluir o rascunho ${atual.codigo}? O número não será reutilizado.`, ok: 'Excluir', perigo: true })) return;
            await api.del(`/api/relatorios/${atual.id}`);
            toast('Rascunho excluído.');
            location.hash = '#/relatorios';
          }
        } catch (err) { erro(err); } finally { b.classList.remove('busy'); }
      };
      form.addEventListener('input', entrada);
      form.addEventListener('click', clique);
      form.addEventListener('submit', e => e.preventDefault());
      return () => pads.forEach(p => p.destruir());
    },
  };
}
