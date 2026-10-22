// Assistência: relatório técnico (com assinatura) e orçamento.
import { col, oid, saida, mapas, detalharUnidade, registrar, proximoNumero, numDoc, hoje, fmtData } from '../db.js';
import { HttpError, txt, opc, num, int, data, dataHora, exigir, existe } from '../http.js';

const reAssinatura = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;
const LIMITE_ASSINATURA = 600_000; // ~450 KB de imagem

const anoAtual = () => new Date().getFullYear();

/** PNG da assinatura feita na tela (ou null). */
function lerAssinatura(v, quem) {
  const a = v ? String(v) : null;
  if (a && (!reAssinatura.test(a) || a.length > LIMITE_ASSINATURA)) throw new HttpError(400, `Assinatura ${quem} inválida. Limpe e assine novamente.`);
  return a;
}

/** Peças: código, descrição, quantidade e valor unitário (relatório e orçamento). */
function lerItens(b) {
  const itens = (Array.isArray(b.itens) ? b.itens : [])
    .map(i => ({ codigo: opc(i.codigo, 60), descricao: txt(i.descricao, 300), quantidade: Math.max(0, num(i.quantidade, 1)), valor_unitario: Math.max(0, num(i.valor_unitario)) }))
    .filter(i => i.codigo || i.descricao || i.valor_unitario);
  if (itens.some(i => !i.descricao)) throw new HttpError(400, 'Toda peça precisa de descrição.');
  if (itens.length > 200) throw new HttpError(400, 'Máximo de 200 itens por documento.');
  return itens;
}

/** Totais de peças, horas técnicas e deslocamento (relatório e orçamento). */
function totais(o) {
  const itens = (o.itens || []).reduce((s, i) => s + i.quantidade * i.valor_unitario, 0);
  const mao_obra = (o.horas || 0) * (o.valor_hora || 0);
  const deslocamento = o.deslocamento || 0;
  return { itens, mao_obra, deslocamento, total: itens + mao_obra + deslocamento };
}

function camposRelatorio(b) {
  return {
    tecnico_id: oid(b.tecnico_id), responsavel: opc(b.responsavel, 120),
    procedimentos: txt(b.procedimentos, 20000),
    horas: b.horas === '' || b.horas == null ? null : Math.max(0, num(b.horas)),
    chegada: dataHora(b.chegada), saida: dataHora(b.saida), conclusao: data(b.conclusao),
    retorno: data(b.retorno), proxima_manutencao: data(b.proxima_manutencao),
    itens: lerItens(b), valor_hora: Math.max(0, num(b.valor_hora)), deslocamento: Math.max(0, num(b.deslocamento)),
    assinatura: lerAssinatura(b.assinatura, 'do cliente'), assinante_nome: opc(b.assinante_nome, 160), assinante_doc: opc(b.assinante_doc, 60),
    assinatura_tecnico: lerAssinatura(b.assinatura_tecnico, 'do técnico'),
  };
}

async function montarRelatorio(r, M) {
  M = M || await mapas();
  const unidade = r.snapshot?.unidade || detalharUnidade(await col.parque.findOne({ _id: r.parque_id }), M);
  const tecnico = r.snapshot?.tecnico || M.usuarios.get(String(r.tecnico_id))?.nome || null;
  return { ...saida(r), snapshot: undefined, parque_id: String(r.parque_id), tecnico_id: r.tecnico_id ? String(r.tecnico_id) : null, codigo: numDoc('RT', r), unidade, tecnico, itens: r.itens || [], totais: totais(r) };
}

function camposOrcamento(b) {
  return {
    tecnico_id: oid(b.tecnico_id), data: data(b.data) || hoje(), validade_dias: Math.max(1, int(b.validade_dias) || 15),
    situacao: ['Em aberto', 'Aprovado', 'Recusado'].includes(b.situacao) ? b.situacao : 'Em aberto',
    horas: Math.max(0, num(b.horas)), valor_hora: Math.max(0, num(b.valor_hora)), deslocamento: Math.max(0, num(b.deslocamento)),
    obs: opc(b.obs, 1000), itens: lerItens(b),
    assinatura_tecnico: lerAssinatura(b.assinatura_tecnico, 'do técnico'),
    ...assinaturaCliente(b),
  };
}

/** "De acordo" do cliente no orçamento: assinatura, nome e documento de quem aprovou. */
function assinaturaCliente(b) {
  const assinatura_cliente = lerAssinatura(b.assinatura_cliente, 'do cliente');
  const aprovador_nome = opc(b.aprovador_nome, 160);
  if (assinatura_cliente && !aprovador_nome) throw new HttpError(400, 'Informe o nome completo de quem assinou o orçamento.');
  return { assinatura_cliente, aprovador_nome, aprovador_doc: opc(b.aprovador_doc, 60) };
}

/** Data do "de acordo": registrada quando o cliente assina (ou assina de novo) e apagada se a assinatura for removida. */
const dataAssinatura = (novo, atual = {}) =>
  !novo.assinatura_cliente ? null : novo.assinatura_cliente === atual.assinatura_cliente ? atual.cliente_assinou_em || hoje() : hoje();

async function montarOrcamento(o, M) {
  M = M || await mapas();
  const unidade = detalharUnidade(await col.parque.findOne({ _id: o.parque_id }), M);
  return { ...saida(o), parque_id: String(o.parque_id), tecnico_id: o.tecnico_id ? String(o.tecnico_id) : null, codigo: numDoc('ORC', o), unidade, tecnico: M.usuarios.get(String(o.tecnico_id))?.nome || null, totais: totais(o) };
}

export default r => {
  // ================= RELATÓRIO TÉCNICO =================
  r.get('/api/relatorios', async () => {
    const M = await mapas();
    const lista = await col.relatorios.find({}, { projection: { assinatura: 0, assinatura_tecnico: 0 } }).sort({ ano: -1, numero: -1 }).toArray();
    const unidades = new Map((await col.parque.find({ _id: { $in: lista.map(x => x.parque_id) } }).toArray()).map(u => [String(u._id), u]));
    return lista.map(x => {
      const u = x.snapshot?.unidade || detalharUnidade(unidades.get(String(x.parque_id)), M) || {};
      return { id: String(x._id), codigo: numDoc('RT', x), numero: x.numero, ano: x.ano, status: x.status, conclusao: x.conclusao, parque_id: String(x.parque_id),
        fantasia: u.fantasia, equipamento: u.equipamento, serie: u.serie, tecnico: x.snapshot?.tecnico || M.usuarios.get(String(x.tecnico_id))?.nome || null };
    });
  });

  r.get('/api/relatorios/:id', async ({ params }) =>
    montarRelatorio(existe(await col.relatorios.findOne({ _id: oid(params.id) }), 'Relatório técnico')));

  // Cria o rascunho e já reserva o número do ano
  r.post('/api/relatorios', async ({ body, user }) => {
    const parque_id = oid(body.parque_id);
    exigir({ parque_id }, { parque_id: 'equipamento atendido' });
    existe(await col.parque.findOne({ _id: parque_id }), 'Equipamento');
    const ano = anoAtual();
    const doc = { ...camposRelatorio(body), parque_id, ano, numero: await proximoNumero('RT', ano), status: 'rascunho', snapshot: null, finalizado_em: null, criado_por: user._id, criado_em: new Date(), atualizado_em: new Date() };
    const { insertedId } = await col.relatorios.insertOne(doc);
    return montarRelatorio({ _id: insertedId, ...doc });
  });

  r.put('/api/relatorios/:id', async ({ params, body }) => {
    const atual = existe(await col.relatorios.findOne({ _id: oid(params.id) }), 'Relatório técnico');
    if (atual.status === 'finalizado') throw new HttpError(409, 'Relatório finalizado não pode ser alterado.');
    const set = { ...camposRelatorio(body), atualizado_em: new Date() };
    const pid = oid(body.parque_id);
    if (pid && String(pid) !== String(atual.parque_id)) { existe(await col.parque.findOne({ _id: pid }), 'Equipamento'); set.parque_id = pid; }
    const novo = await col.relatorios.findOneAndUpdate({ _id: atual._id, status: 'rascunho' }, { $set: set }, { returnDocument: 'after' });
    return montarRelatorio(existe(novo, 'Relatório em rascunho'));
  });

  // Finaliza: congela os dados do cadastro, entra no histórico do equipamento e agenda a próxima manutenção
  r.post('/api/relatorios/:id/finalizar', async ({ params, body, user }) => {
    const atual = existe(await col.relatorios.findOne({ _id: oid(params.id) }), 'Relatório técnico');
    if (atual.status === 'finalizado') throw new HttpError(409, 'Este relatório já foi finalizado.');
    const d = { ...atual, ...camposRelatorio(body) };
    const pid = oid(body.parque_id) || atual.parque_id;
    exigir({ procedimentos: d.procedimentos, conclusao: d.conclusao, assinatura: d.assinatura, assinante_nome: d.assinante_nome, tecnico_id: d.tecnico_id },
      { procedimentos: 'procedimentos realizados', conclusao: 'data da conclusão', assinatura: 'assinatura', assinante_nome: 'nome completo de quem assina', tecnico_id: 'assistente técnico' });
    const M = await mapas();
    const unidade = existe(detalharUnidade(await col.parque.findOne({ _id: pid }), M), 'Equipamento');
    const snapshot = { unidade, tecnico: M.usuarios.get(String(d.tecnico_id))?.nome || null };
    const { _id, ...campos } = d;
    const novo = await col.relatorios.findOneAndUpdate({ _id, status: 'rascunho' },
      { $set: { ...campos, parque_id: pid, status: 'finalizado', snapshot, finalizado_em: new Date(), atualizado_em: new Date() } }, { returnDocument: 'after' });
    existe(novo, 'Relatório em rascunho');
    const codigo = numDoc('RT', novo);
    const resumo = d.procedimentos.split('\n')[0].slice(0, 90);
    await registrar(pid, d.conclusao, 'relatorio', `Relatório técnico ${codigo} — ${resumo}`, { refTipo: 'relatorio', refId: _id, usuarioId: user._id });
    if (d.proxima_manutencao) {
      await col.manutencoes.insertOne({ parque_id: pid, data: d.proxima_manutencao, descricao: `Manutenção programada no ${codigo}`, alerta_email: true, alerta_celular: true, realizada: false, realizada_em: null, criado_por: user._id });
      await registrar(pid, d.conclusao, 'manutencao_agendada', `Próxima manutenção agendada para ${fmtData(d.proxima_manutencao)}`, { usuarioId: user._id });
    }
    return montarRelatorio(novo, M);
  });

  r.del('/api/relatorios/:id', async ({ params }) => {
    const { deletedCount } = await col.relatorios.deleteOne({ _id: oid(params.id), status: 'rascunho' });
    if (!deletedCount) throw new HttpError(409, 'Só é possível excluir relatórios em rascunho.');
    return { ok: true };
  });

  // ================= ORÇAMENTO =================
  r.get('/api/orcamentos', async () => {
    const M = await mapas();
    const lista = await col.orcamentos.find({}, { projection: { assinatura_cliente: 0, assinatura_tecnico: 0 } }).sort({ ano: -1, numero: -1 }).toArray();
    const unidades = new Map((await col.parque.find({ _id: { $in: lista.map(x => x.parque_id) } }).toArray()).map(u => [String(u._id), u]));
    return lista.map(o => {
      const u = detalharUnidade(unidades.get(String(o.parque_id)), M) || {};
      return { id: String(o._id), codigo: numDoc('ORC', o), data: o.data, situacao: o.situacao, total: totais(o).total, fantasia: u.fantasia, equipamento: u.equipamento, serie: u.serie };
    });
  });

  r.get('/api/orcamentos/:id', async ({ params }) =>
    montarOrcamento(existe(await col.orcamentos.findOne({ _id: oid(params.id) }), 'Orçamento')));

  r.post('/api/orcamentos', async ({ body, user }) => {
    const parque_id = oid(body.parque_id);
    exigir({ parque_id }, { parque_id: 'equipamento' });
    existe(await col.parque.findOne({ _id: parque_id }), 'Equipamento');
    const ano = anoAtual();
    const campos = camposOrcamento(body);
    const doc = { ...campos, cliente_assinou_em: dataAssinatura(campos), parque_id, ano, numero: await proximoNumero('ORC', ano), criado_por: user._id, criado_em: new Date() };
    const { insertedId } = await col.orcamentos.insertOne(doc);
    const o = { _id: insertedId, ...doc };
    await registrar(parque_id, doc.data, 'orcamento', `Orçamento ${numDoc('ORC', o)} emitido — ${totais(o).total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`, { refTipo: 'orcamento', refId: insertedId, usuarioId: user._id });
    return montarOrcamento(o);
  });

  r.put('/api/orcamentos/:id', async ({ params, body, user }) => {
    const atual = existe(await col.orcamentos.findOne({ _id: oid(params.id) }), 'Orçamento');
    const set = camposOrcamento(body);
    set.cliente_assinou_em = dataAssinatura(set, atual);
    const novo = await col.orcamentos.findOneAndUpdate({ _id: atual._id }, { $set: set }, { returnDocument: 'after' });
    if (set.situacao !== atual.situacao && set.situacao !== 'Em aberto')
      await registrar(atual.parque_id, hoje(), 'orcamento', `Orçamento ${numDoc('ORC', atual)} ${set.situacao.toLowerCase()} pelo cliente`, { refTipo: 'orcamento', refId: atual._id, usuarioId: user._id });
    return montarOrcamento(novo);
  });
};
