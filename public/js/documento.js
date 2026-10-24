// Página de documento para impressão / PDF: relatório técnico, orçamento ou programação de manutenção.
import { api, qs } from './api.js';
import { $, esc, fmtD, brl, n2, hoje } from './util.js';

const p = Object.fromEntries(new URLSearchParams(location.search));

const cabecalho = (cfg, titulo, numero, sub) => `
  <div class="ph"><div><h1>${esc(titulo)}</h1>
    <div style="margin-top:4px"><b>${esc(cfg.empresa)}</b>${cfg.cnpj ? `<br>CNPJ ${esc(cfg.cnpj)}` : ''}${cfg.contato ? `<br>${esc(cfg.contato)}` : ''}</div></div>
    <div class="no"><b>${esc(numero)}</b><br>${esc(sub)}</div></div>
  <div class="spectrum"></div>`;

// ---------- formulário no padrão do relatório técnico em papel ----------
const so = s => (s ? fmtD(String(s).slice(0, 10)) : '');                      // só a data
const rs = v => (n2(v) ? brl(v) : 'R$');                                      // "R$" em branco quando não há valor
const qtd = v => n2(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const linha = (rotulo, valor) => `<tr><th>${rotulo}</th><td>${esc(valor || '')}</td></tr>`;

const topo = (cfg, titulo, numero, data, extra = '') => `
  <div class="f-top">
    <div class="f-logo">${cfg.logo ? `<img src="${cfg.logo}" alt="${esc(cfg.empresa)}">` : `<b>${esc(cfg.empresa)}</b>`}</div>
    <h1>${esc(titulo)}</h1>
    <div class="f-no"><b>${esc(numero)}</b>${extra}<div class="f-data">DATA <span>${data || '&nbsp;'}</span></div></div>
  </div>`;

const dadosCliente = (u, responsavel) => `
  <table class="f-t"><caption>Dados do cliente</caption><tbody>
    ${linha('Cliente', u.fantasia)}${linha('Razão social', u.cliente_nome)}${linha('CNPJ', u.cnpj)}
    ${linha('Responsável técnico', responsavel)}${linha('Endereço', u.endereco)}${linha('Telefone', u.telefone)}
    ${linha('E-mail', u.email)}${linha('Cidade', u.cidade)}${linha('Estado', u.estado)}</tbody></table>`;

const dadosEquipamento = u => `
  <table class="f-t"><caption>Dados do equipamento</caption><tbody>
    ${linha('Equipamento', u.equipamento)}${linha('Modelo/Marca', [u.modelo, u.marca].filter(Boolean).join(' / '))}${linha('Nº de série', u.serie)}</tbody></table>`;

function pecas(lista, titulo, minimo) {
  const itens = (lista || []).filter(i => i.codigo || i.descricao);
  const vazias = Math.max(0, minimo - itens.length);
  return `<table class="f-g"><caption>${titulo}</caption>
    <thead><tr><th style="width:16%">Código</th><th>Descrição</th><th style="width:13%">Quantidade</th><th style="width:16%">Valor unitário</th><th style="width:16%">Valor total</th></tr></thead>
    <tbody>${itens.map(i => `<tr><td>${esc(i.codigo || '')}</td><td>${esc(i.descricao)}</td><td class="c">${qtd(i.quantidade)}</td><td class="r">${brl(i.valor_unitario)}</td><td class="r">${brl(n2(i.quantidade) * n2(i.valor_unitario))}</td></tr>`).join('')}
      ${'<tr><td>&nbsp;</td><td></td><td></td><td></td><td></td></tr>'.repeat(vazias)}</tbody></table>`;
}

const assinaturaLinha = (img, rotulo, nome, doc) => `<div>
    ${img ? `<img src="${img}" alt="Assinatura">` : '<div class="space"></div>'}
    <div class="ln"><b>${rotulo}</b>${nome ? `<br>${esc(nome)}` : ''}${doc ? `<br>${esc(doc)}` : ''}</div></div>`;

const rodapeEmpresa = cfg => `<div class="f-foot">
    <b>${esc(cfg.empresa)}${cfg.cnpj ? ` &nbsp;CNPJ: ${esc(cfg.cnpj)}` : ''}</b>
    ${cfg.endereco ? `<br>ENDEREÇO: ${esc(cfg.endereco)}` : ''}${cfg.contato ? `<br>${esc(cfg.contato)}` : ''}</div>`;

function relatorio(r, cfg) {
  const u = r.unidade || {};
  const t = r.totais;
  const horas = r.horas != null && r.horas !== '' ? `${qtd(r.horas)} h` : '';
  const rasc = r.status === 'finalizado' ? '' : '<span class="selo rasc">Rascunho</span>';
  return `<div class="paper form">
    ${topo(cfg, 'Relatório Técnico', r.codigo, so(r.chegada || r.conclusao), rasc)}
    ${dadosCliente(u, r.responsavel)}
    ${dadosEquipamento(u)}
    <table class="f-g"><caption>Descrição dos procedimentos realizados</caption>
      <tbody><tr><td class="f-proc">${esc(r.procedimentos)}</td></tr></tbody></table>
    ${pecas(r.itens, 'Peças', 5)}
    <div class="f-2">
      <table class="f-t f-v"><caption>Orçamento</caption><tbody>
        <tr><th>Valor da hora técnica</th><td>${rs(r.valor_hora)}</td></tr>
        <tr><th>Valor total em horas técnicas</th><td>${rs(t.mao_obra)}</td></tr>
        <tr><th>Deslocamento</th><td>${rs(t.deslocamento)}</td></tr>
        <tr><th>Valor total</th><td>${rs(t.total)}</td></tr></tbody></table>
      <table class="f-t f-v"><caption>Dados do serviço</caption><tbody>
        ${linha('Assistente técnico', r.tecnico)}
        <tr><th>Data de chegada</th><td>${fmtD(r.chegada).replace('—', '')}</td></tr>
        <tr><th>Data de saída</th><td>${fmtD(r.saida).replace('—', '')}</td></tr>
        <tr><th>Carga horária</th><td>${horas}</td></tr>
        <tr><th>Retorno</th><td>${so(r.retorno)}</td></tr>
        <tr><th>Trabalho concluído</th><td>${so(r.conclusao)}</td></tr></tbody></table>
    </div>
    <div class="sig">
      ${assinaturaLinha(r.assinatura_tecnico, 'Assessor técnico', r.tecnico)}
      ${assinaturaLinha(r.assinatura, 'Cliente', r.assinante_nome, r.assinante_doc)}
    </div>
    ${rodapeEmpresa(cfg)}</div>`;
}

function orcamento(o, cfg) {
  const u = o.unidade || {};
  const t = o.totais;
  return `<div class="paper form">
    ${topo(cfg, 'Orçamento', o.codigo, so(o.data), `<div class="f-val">Válido por ${o.validade_dias} dias</div>`)}
    ${dadosCliente(u, o.tecnico)}
    ${dadosEquipamento(u)}
    ${pecas(o.itens, 'Peças e materiais', 3)}
    <table class="f-g"><caption>Mão de obra</caption>
      <thead><tr><th>Quantidade de horas</th><th>Valor da hora</th><th style="width:16%">Valor total</th></tr></thead>
      <tbody><tr><td class="c">${qtd(o.horas)} h</td><td class="c">${brl(o.valor_hora)}</td><td class="r">${brl(t.mao_obra)}</td></tr></tbody></table>
    <div class="f-2">
      <table class="f-t f-v"><caption>Deslocamento</caption><tbody><tr><th>Valor</th><td>${brl(t.deslocamento)}</td></tr></tbody></table>
      <table class="f-t f-v"><caption>Resumo</caption><tbody>
        <tr><th>Peças e materiais</th><td>${brl(t.itens)}</td></tr>
        <tr><th>Mão de obra</th><td>${brl(t.mao_obra)}</td></tr>
        <tr><th>Deslocamento</th><td>${brl(t.deslocamento)}</td></tr></tbody></table>
    </div>
    <div class="f-total"><span>Valor total do orçamento</span><b>${brl(t.total)}</b></div>
    ${o.obs ? `<table class="f-g"><caption>Observações</caption><tbody><tr><td style="white-space:pre-wrap">${esc(o.obs)}</td></tr></tbody></table>` : ''}
    <div class="sig">
      ${assinaturaLinha(o.assinatura_tecnico, 'Responsável técnico', o.tecnico)}
      ${assinaturaLinha(o.assinatura_cliente, 'De acordo — Cliente', o.aprovador_nome,
    [o.aprovador_doc, `Data: ${o.cliente_assinou_em ? fmtD(o.cliente_assinou_em) : '____/____/______'}`].filter(Boolean).join(' · '))}
    </div>
    ${rodapeEmpresa(cfg)}</div>`;
}

function programacao(lista, cfg) {
  const rot = { atrasadas: 'Somente atrasadas', 7: 'Até 7 dias', 30: 'Até 30 dias', 90: 'Até 90 dias', todas: 'Todas pendentes' }[p.periodo || '30'];
  return `<div class="paper">
    ${cabecalho(cfg, 'Programação de Manutenção', rot, `Emitido em ${fmtD(hoje())}`)}
    <table><thead><tr><th>Data</th><th>Prazo</th><th>Cliente</th><th>Equipamento</th><th>Série</th><th>Serviço</th></tr></thead>
      <tbody>${lista.map(m => `<tr><td>${fmtD(m.data)}</td><td>${m.dias < 0 ? `${-m.dias}d atrasada` : m.dias === 0 ? 'hoje' : `${m.dias}d`}</td>
        <td>${esc(m.unidade.fantasia)}</td><td>${esc(m.unidade.equipamento)}</td><td>${esc(m.unidade.serie)}</td><td>${esc(m.descricao)}</td></tr>`).join('') || '<tr><td colspan="6">Nenhuma manutenção no filtro.</td></tr>'}</tbody></table>
    <div class="foot"><span>${esc(cfg.empresa)}</span><span>${lista.length} registro(s)</span></div></div>`;
}

$('#imprimir').addEventListener('click', () => window.print());
$('#voltar').addEventListener('click', () => { if (history.length > 1) history.back(); else location.href = './'; });

(async () => {
  try {
    const cfg = await api.get('api/config');
    let html = '';
    if (p.tipo === 'relatorio') { const r = await api.get(`api/relatorios/${encodeURIComponent(p.id)}`); html = relatorio(r, cfg); document.title = `${r.codigo} · Relatório técnico`; }
    else if (p.tipo === 'orcamento') { const o = await api.get(`api/orcamentos/${encodeURIComponent(p.id)}`); html = orcamento(o, cfg); document.title = `${o.codigo} · Orçamento`; }
    else if (p.tipo === 'programacao') { const l = await api.get('api/manutencoes' + qs({ periodo: p.periodo || '30', cliente_id: p.cliente_id || '' })); html = programacao(l, cfg); document.title = 'Programação de manutenção'; }
    else throw new Error('Documento não informado.');
    $('#doc').innerHTML = html;
  } catch (e) {
    $('#doc').innerHTML = `<div class="paper"><b>Não foi possível abrir o documento.</b><p>${esc(e.message)}</p></div>`;
  }
})();