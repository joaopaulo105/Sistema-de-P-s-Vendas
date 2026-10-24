// Editor de orçamento: itens (código, descrição, quantidade, valor), mão de obra, deslocamento e total.
import { api } from '../api.js';
import { $, $$, esc, ic, opcoes, brl, n2, hoje, fmtD } from '../util.js';
import { toast, erro } from '../ui.js';
import { areaAssinatura, montarAssinatura } from '../assinatura.js';
import { blocoCadastro, itemVazio, linhaItem, totais } from './relatorio.js';

const resumo = t => `<div class="sum-row"><span>Peças e materiais</span><b class="num">${brl(t.itens)}</b></div>
  <div class="sum-row"><span>Mão de obra</span><b class="num">${brl(t.mao)}</b></div>
  <div class="sum-row"><span>Deslocamento</span><b class="num">${brl(t.desl)}</b></div>`;

export default async function orcamento(ctx) {
  const novo = ctx.params[0] === 'novo';
  const [parque, usuarios, atual] = await Promise.all([
    api.get('api/parque'), api.get('api/usuarios'), novo ? null : api.get(`api/orcamentos/${ctx.params[0]}`),
  ]);
  if (!parque.length) return { titulo: 'Orçamento', html: `<div class="card"><div class="empty"><b>Nenhum equipamento no parque</b>Vincule um equipamento a um cliente antes de orçar. <a href="#/parque">Ir para o parque</a></div></div>` };
  const ativos = usuarios.filter(u => u.ativo);
  const d = atual ? { ...atual, itens: atual.itens.length ? atual.itens : [itemVazio()] } : {
    parque_id: ctx.query.parque || parque[0].id, tecnico_id: ctx.user.id, data: hoje(), validade_dias: 15, situacao: 'Em aberto',
    itens: [itemVazio()], horas: '', valor_hora: '', deslocamento: '', obs: '',
    assinatura_cliente: null, aprovador_nome: '', aprovador_doc: '', assinatura_tecnico: null,
  };
  const t = totais(d);
  const v = x => esc(x ?? '');

  return {
    titulo: atual ? `Orçamento ${atual.codigo}` : 'Novo orçamento',
    eyebrow: 'Assistência',
    html: `
    <div class="statusbar"><a class="btn ghost" href="#/orcamentos">${ic('back')}Orçamentos</a>
      <span class="doc-no">${atual ? `<b>${esc(atual.codigo)}</b>` : 'Número gerado ao salvar'}</span></div>
    <form class="editor" id="fOrc" autocomplete="off" novalidate>
      <div class="editor-main">
        <section class="card"><div class="card-h"><h2>Cliente e equipamento</h2><span class="sub">dados trazidos do cadastro</span></div>
          <div class="card-b" style="display:flex;flex-direction:column;gap:16px">
            <div class="grid g4">
              <div class="field span2"><label for="oUni">Equipamento</label><select class="inp" id="oUni" name="parque_id"${atual ? ' disabled' : ''}>${opcoes(parque, d.parque_id, u => `${u.fantasia} — ${u.equipamento} · ${u.serie}`)}</select></div>
              <div class="field"><label for="oTec">Responsável técnico</label><select class="inp" id="oTec" name="tecnico_id">${opcoes(ativos, d.tecnico_id)}</select></div>
              <div class="field"><label for="oDt">Data</label><input class="inp" type="date" id="oDt" name="data" value="${v(d.data)}"></div>
            </div>
            <div id="cadastro">${blocoCadastro(parque.find(u => u.id === d.parque_id) || d.unidade)}</div>
          </div></section>

        <section class="card"><div class="card-h"><h2>Peças e materiais</h2>
          <div class="r"><button class="btn sm" type="button" data-adicionar>${ic('plus')}Adicionar item</button></div></div>
          <div class="tbl-wrap"><table class="tbl items">
            <thead><tr><th style="width:140px">Código do item</th><th>Descrição</th><th style="width:90px">Quantidade</th><th style="width:130px">Valor unit.</th><th class="r" style="width:130px">Valor total</th><th style="width:48px"><span class="sr-only">Remover</span></th></tr></thead>
            <tbody id="itens">${d.itens.map((it, i) => linhaItem(it, i)).join('')}</tbody></table></div></section>

        <section class="card"><div class="card-h"><h2>Mão de obra e deslocamento</h2></div>
          <div class="card-b grid g4">
            <div class="field"><label for="oH">Quantidade de horas</label><input class="inp num" type="number" min="0" step="0.25" id="oH" name="horas" value="${v(d.horas)}"></div>
            <div class="field"><label for="oVh">Valor da hora (R$)</label><input class="inp num" type="number" min="0" step="0.01" id="oVh" name="valor_hora" value="${v(d.valor_hora)}"></div>
            <div class="field"><label for="oMo">Total mão de obra</label><input class="inp num" id="oMo" readonly value="${brl(t.mao)}"></div>
            <div class="field"><label for="oDs">Deslocamento (R$)</label><input class="inp num" type="number" min="0" step="0.01" id="oDs" name="deslocamento" value="${v(d.deslocamento)}"></div>
            <div class="field"><label for="oVal">Validade (dias)</label><input class="inp num" type="number" min="1" id="oVal" name="validade_dias" value="${v(d.validade_dias)}"></div>
            <div class="field"><label for="oSit">Situação</label><select class="inp" id="oSit" name="situacao">${opcoes(['Em aberto', 'Aprovado', 'Recusado'].map(s => ({ id: s, nome: s })), d.situacao)}</select></div>
            <div class="field span2"><label for="oObs">Observações</label><input class="inp" id="oObs" name="obs" maxlength="1000" value="${v(d.obs)}" placeholder="Prazo de entrega, condições de pagamento…"></div>
          </div></section>

        <section class="card"><div class="card-h"><h2>De acordo do cliente</h2><span class="sub">${d.cliente_assinou_em ? `assinado em ${fmtD(d.cliente_assinou_em)}` : 'assine com o dedo no celular ou com o mouse · no celular, use “Tela cheia”'}</span></div>
          <div class="card-b grid g2">
            <div class="spanall">${areaAssinatura('cliente', { valor: d.assinatura_cliente })}</div>
            <div class="field"><label for="oAn">Nome completo</label><input class="inp" id="oAn" name="aprovador_nome" maxlength="160" value="${v(d.aprovador_nome)}" placeholder="Quem aprova o orçamento"></div>
            <div class="field"><label for="oAd">Documento</label><input class="inp" id="oAd" name="aprovador_doc" maxlength="60" value="${v(d.aprovador_doc)}" placeholder="RG, CPF ou registro profissional"></div>
          </div></section>

        <section class="card"><div class="card-h"><h2>Assinatura do responsável técnico</h2></div>
          <div class="card-b">${areaAssinatura('tecnico', { valor: d.assinatura_tecnico })}</div></section>
      </div>

      <aside class="sticky-side">
        <section class="card"><div class="card-h"><h2>Resumo</h2></div>
          <div class="card-b" id="resumo">${resumo(t)}</div>
          <div class="sum-total"><span class="lbl">Valor total do orçamento</span><b id="total">${brl(t.total)}</b></div></section>
        <section class="card"><div class="card-b side-actions">
          <button class="btn pri" type="button" data-salvar>${ic('check')}Salvar orçamento</button>
          ${atual ? `<a class="btn" href="documento.html?tipo=orcamento&id=${atual.id}">${ic('print')}Imprimir / gerar PDF</a>` : ''}
        </div></section>
      </aside>
    </form>`,

    montar(root) {
      const form = $('#fOrc', root);
      const pads = [
        montarAssinatura(root, 'cliente', {
          valor: d.assinatura_cliente, titulo: 'De acordo do cliente', aoMudar: val => {
            d.assinatura_cliente = val;
            // assinar o "de acordo" é aprovar o orçamento
            if (val && d.situacao === 'Em aberto') { d.situacao = 'Aprovado'; $('#oSit', root).value = 'Aprovado'; toast('Situação alterada para Aprovado. Salve para confirmar.'); }
          }
        }),
        montarAssinatura(root, 'tecnico', { valor: d.assinatura_tecnico, titulo: 'Assinatura do responsável técnico', aoMudar: val => { d.assinatura_tecnico = val; } }),
      ];
      const recalcular = () => {
        const tt = totais(d);
        d.itens.forEach((it, i) => { const c = $(`[data-lt="${i}"]`, root); if (c) c.textContent = brl(n2(it.quantidade) * n2(it.valor_unitario)); });
        $('#resumo', root).innerHTML = resumo(tt);
        $('#total', root).textContent = brl(tt.total);
        $('#oMo', root).value = brl(tt.mao);
      };
      const redesenharItens = () => { $('#itens', root).innerHTML = d.itens.map((it, i) => linhaItem(it, i)).join(''); recalcular(); };
      const entrada = e => {
        const el = e.target;
        if (el.dataset.i != null) d.itens[+el.dataset.i][el.dataset.f] = el.value;
        else if (el.name) d[el.name] = el.value;
        if (el.name === 'parque_id') $('#cadastro', root).innerHTML = blocoCadastro(parque.find(u => u.id === el.value));
        recalcular();
      };
      let registro = atual;
      const clique = async e => {
        if (e.target.closest('[data-adicionar]')) { d.itens.push(itemVazio()); redesenharItens(); $$('[data-f="codigo"]', root).pop()?.focus(); return; }
        const rm = e.target.closest('[data-remover]');
        if (rm) { d.itens.splice(+rm.dataset.remover, 1); if (!d.itens.length) d.itens.push(itemVazio()); redesenharItens(); return; }
        const b = e.target.closest('[data-salvar]');
        if (!b) return;
        b.classList.add('busy');
        try {
          const corpo = { ...d, unidade: undefined, totais: undefined };
          registro = registro ? await api.put(`api/orcamentos/${registro.id}`, corpo) : await api.post('api/orcamentos', corpo);
          toast(`${registro.codigo} salvo.`);
          if (novo) location.hash = `#/orcamentos/${registro.id}`; else ctx.recarregar();
        } catch (err) { erro(err); } finally { b.classList.remove('busy'); }
      };
      form.addEventListener('input', entrada);
      form.addEventListener('click', clique);
      form.addEventListener('submit', e => e.preventDefault());
      return () => pads.forEach(p => p.destruir());
    },
  };
}