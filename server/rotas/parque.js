// Parque instalado (visualização dos equipamentos), transferências e manutenções programadas.
import { col, oid, saida, mapas, detalharUnidade, registrar, normalizar, hoje, diasAte, fmtData } from '../db.js';
import { HttpError, txt, opc, data, bool, exigir, existe } from '../http.js';

export const STATUS = ['Novo', 'Locação', 'Comodato', 'Venda', 'Sucata'];

/** Manutenções pendentes já unidas aos dados do equipamento/cliente. */
export async function pendencias({ ateDias = null, clienteId = null, somenteAtrasadas = false } = {}) {
  const M = await mapas();
  const filtro = { realizada: false };
  const mts = await col.manutencoes.find(filtro).sort({ data: 1 }).toArray();
  const unidades = new Map((await col.parque.find({ _id: { $in: mts.map(m => m.parque_id) } }).toArray()).map(u => [String(u._id), u]));
  return mts.map(m => {
    const u = detalharUnidade(unidades.get(String(m.parque_id)), M);
    return u && { ...saida(m), parque_id: String(m.parque_id), dias: diasAte(m.data), unidade: u };
  }).filter(x => x
    && (!clienteId || x.unidade.cliente_id === clienteId)
    && (somenteAtrasadas ? x.dias < 0 : ateDias == null || x.dias <= ateDias));
}

export default r => {
  // ---------- PARQUE: listagem com filtros (cliente / fantasia / tipo / nome do equipamento / status) ----------
  r.get('/api/parque', async ({ query }) => {
    const M = await mapas();
    const f = {};
    if (oid(query.cliente_id)) f.cliente_id = oid(query.cliente_id);
    if (STATUS.includes(query.status)) f.status = query.status;
    const [unidades, proximas] = await Promise.all([
      col.parque.find(f).toArray(),
      col.manutencoes.aggregate([{ $match: { realizada: false } }, { $group: { _id: '$parque_id', data: { $min: '$data' } } }]).toArray(),
    ]);
    const prox = new Map(proximas.map(p => [String(p._id), p.data]));
    const fant = normalizar(query.fantasia), nome = normalizar(query.nome);
    return unidades.map(u => ({ ...detalharUnidade(u, M), proxima_manutencao: prox.get(String(u._id)) || null }))
      .filter(u => (!query.tipo_id || u.tipo_id === query.tipo_id)
        && (!fant || normalizar(u.fantasia).includes(fant))
        && (!nome || normalizar(`${u.equipamento} ${u.marca} ${u.modelo} ${u.serie}`).includes(nome)))
      .sort((a, b) => (a.fantasia || '').localeCompare(b.fantasia || '', 'pt') || a.serie.localeCompare(b.serie));
  });

  // ---------- PARQUE: detalhe com todo o histórico ----------
  r.get('/api/parque/:id', async ({ params }) => {
    const u = existe(await col.parque.findOne({ _id: oid(params.id) }), 'Equipamento');
    const M = await mapas();
    const [manutencoes, movs] = await Promise.all([
      col.manutencoes.find({ parque_id: u._id }).sort({ data: 1 }).toArray(),
      col.movimentacoes.find({ parque_id: u._id }).sort({ data: -1, criado_em: -1 }).toArray(),
    ]);
    return {
      ...detalharUnidade(u, M),
      manutencoes: manutencoes.map(m => ({ ...saida(m), parque_id: String(m.parque_id), dias: diasAte(m.data) })),
      historico: movs.map(h => ({ ...saida(h), parque_id: String(h.parque_id), ref_id: h.ref_id ? String(h.ref_id) : null, usuario: M.usuarios.get(String(h.usuario_id))?.nome || null })),
    };
  });

  // ---------- PARQUE: vincular equipamento ao cliente ----------
  r.post('/api/parque', async ({ body, user }) => {
    const d = { cliente_id: oid(body.cliente_id), equipamento_id: oid(body.equipamento_id), serie: txt(body.serie, 80), status: body.status, data_instalacao: data(body.data_instalacao) || hoje() };
    exigir(d, { cliente_id: 'cliente', equipamento_id: 'equipamento', serie: 'número de série' });
    if (!STATUS.includes(d.status)) throw new HttpError(400, 'Status inválido.');
    const [cli] = await Promise.all([
      col.clientes.findOne({ _id: d.cliente_id }).then(x => existe(x, 'Cliente')),
      col.equipamentos.findOne({ _id: d.equipamento_id }).then(x => existe(x, 'Equipamento do catálogo')),
    ]);
    let id;
    try {
      ({ insertedId: id } = await col.parque.insertOne({ ...d, serie_norm: normalizar(d.serie), criado_em: new Date() }));
    } catch (e) {
      if (e.code === 11000) throw new HttpError(409, `Já existe um equipamento com o número de série ${d.serie}.`);
      throw e;
    }
    await registrar(id, d.data_instalacao, 'cadastro', `Equipamento cadastrado para ${cli.fantasia} — ${d.status}`, { usuarioId: user._id });
    const pm = data(body.primeira_manutencao);
    if (pm) {
      await col.manutencoes.insertOne({ parque_id: id, data: pm, descricao: 'Manutenção preventiva', alerta_email: true, alerta_celular: true, realizada: false, realizada_em: null, criado_por: user._id });
      await registrar(id, hoje(), 'manutencao_agendada', `Manutenção agendada para ${fmtData(pm)}`, { usuarioId: user._id });
    }
    return { id: String(id) };
  });

  // ---------- PARQUE: transferência de propriedade / alteração de status ----------
  r.post('/api/parque/:id/movimentar', async ({ params, body, user }) => {
    const u = existe(await col.parque.findOne({ _id: oid(params.id) }), 'Equipamento');
    const novoCli = oid(body.cliente_id) || u.cliente_id;
    const novoStatus = STATUS.includes(body.status) ? body.status : u.status;
    const quando = data(body.data) || hoje();
    const obs = opc(body.obs, 300);
    const mudouCli = String(novoCli) !== String(u.cliente_id), mudouStatus = novoStatus !== u.status;
    if (!mudouCli && !mudouStatus) throw new HttpError(400, 'Nenhuma alteração: escolha outro cliente ou outro status.');
    const [antigo, novo] = await Promise.all([col.clientes.findOne({ _id: u.cliente_id }), col.clientes.findOne({ _id: novoCli })]);
    existe(novo, 'Cliente de destino');
    await col.parque.updateOne({ _id: u._id }, { $set: { cliente_id: novoCli, status: novoStatus } });
    const sufixo = obs ? ` (${obs})` : '';
    if (mudouCli) await registrar(u._id, quando, 'transferencia', `Transferência de propriedade: ${antigo?.fantasia || '—'} → ${novo.fantasia}${sufixo}`, { usuarioId: user._id });
    if (mudouStatus) await registrar(u._id, quando, 'status', `Status alterado: ${u.status} → ${novoStatus}${mudouCli ? '' : sufixo}`, { usuarioId: user._id });
    return { ok: true };
  });

  // ---------- MANUTENÇÕES ----------
  r.get('/api/manutencoes', async ({ query }) => {
    const p = query.periodo || '30';
    return pendencias({
      clienteId: query.cliente_id || null,
      somenteAtrasadas: p === 'atrasadas',
      ateDias: p === 'todas' || p === 'atrasadas' ? null : Number(p) || 30,
    });
  });

  r.post('/api/manutencoes', async ({ body, user }) => {
    const d = { parque_id: oid(body.parque_id), data: data(body.data), descricao: txt(body.descricao, 200) };
    exigir(d, { parque_id: 'equipamento', data: 'data programada', descricao: 'serviço' });
    existe(await col.parque.findOne({ _id: d.parque_id }), 'Equipamento');
    const { insertedId } = await col.manutencoes.insertOne({ ...d, alerta_email: bool(body.alerta_email), alerta_celular: bool(body.alerta_celular), realizada: false, realizada_em: null, criado_por: user._id });
    await registrar(d.parque_id, hoje(), 'manutencao_agendada', `Manutenção agendada para ${fmtData(d.data)} — ${d.descricao}`, { usuarioId: user._id });
    return { id: String(insertedId) };
  });

  r.post('/api/manutencoes/:id/realizar', async ({ params, user }) => {
    const m = await col.manutencoes.findOneAndUpdate({ _id: oid(params.id), realizada: false }, { $set: { realizada: true, realizada_em: hoje() } });
    existe(m, 'Manutenção pendente');
    await registrar(m.parque_id, hoje(), 'manutencao_realizada', `Manutenção realizada — ${m.descricao}`, { usuarioId: user._id });
    return { ok: true };
  });

  r.del('/api/manutencoes/:id', async ({ params }) => {
    const m = existe(await col.manutencoes.findOneAndDelete({ _id: oid(params.id) }), 'Manutenção');
    await col.alertas.deleteMany({ manutencao_id: m._id });
    return { ok: true };
  });

  // Lista exibida ao acessar o sistema e no sino de alertas
  r.get('/api/agenda', async ({ query }) => pendencias({ ateDias: Math.min(90, Number(query.dias) || 7) }));
};
