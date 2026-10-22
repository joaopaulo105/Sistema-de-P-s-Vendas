// Cadastro de cliente, usuário, tipos e catálogo de equipamentos.
import { col, oid, saida, saidas, normalizar } from '../db.js';
import { hashSenha } from '../auth.js';
import { HttpError, txt, opc, exigir, existe, bool } from '../http.js';

const ADMIN = { perfis: ['Administrador'] };
const PERFIS = ['Administrador', 'Técnico', 'Comercial'];
const reEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function dadosCliente(b) {
  const d = { nome: txt(b.nome, 200), fantasia: txt(b.fantasia, 120), cnpj: opc(b.cnpj, 20), endereco: opc(b.endereco, 300), cidade: opc(b.cidade, 80), estado: opc(b.estado, 40), telefone: opc(b.telefone, 40), email: opc(b.email, 160) };
  exigir(d, { nome: 'razão social', fantasia: 'nome fantasia' });
  if (d.email && !reEmail.test(d.email)) throw new HttpError(400, 'E-mail do cliente inválido.');
  return d;
}

function dadosEquipamento(b) {
  const d = { nome: txt(b.nome, 160), marca: txt(b.marca, 80), modelo: txt(b.modelo, 80), tipo_id: oid(b.tipo_id) };
  exigir(d, { nome: 'nome do equipamento', marca: 'marca', modelo: 'modelo', tipo_id: 'tipo' });
  return d;
}

export default r => {
  // ---------- CLIENTES ----------
  r.get('/api/clientes', async () => {
    const [clientes, contagem] = await Promise.all([
      col.clientes.find().sort({ fantasia: 1 }).collation({ locale: 'pt', strength: 1 }).toArray(),
      col.parque.aggregate([{ $group: { _id: '$cliente_id', n: { $sum: 1 } } }]).toArray(),
    ]);
    const n = new Map(contagem.map(x => [String(x._id), x.n]));
    return clientes.map(c => ({ ...saida(c), equipamentos: n.get(String(c._id)) || 0 }));
  });

  r.post('/api/clientes', async ({ body }) => {
    const d = { ...dadosCliente(body), criado_em: new Date() };
    const { insertedId } = await col.clientes.insertOne(d);
    return saida({ _id: insertedId, ...d });
  });

  r.put('/api/clientes/:id', async ({ params, body }) => {
    const r2 = await col.clientes.findOneAndUpdate({ _id: oid(params.id) }, { $set: dadosCliente(body) }, { returnDocument: 'after' });
    return saida(existe(r2, 'Cliente'));
  });

  r.del('/api/clientes/:id', async ({ params }) => {
    const id = oid(params.id);
    if (await col.parque.countDocuments({ cliente_id: id })) throw new HttpError(409, 'Este cliente tem equipamentos no parque. Transfira os equipamentos antes de excluir.');
    const { deletedCount } = await col.clientes.deleteOne({ _id: id });
    if (!deletedCount) throw new HttpError(404, 'Cliente não encontrado.');
    return { ok: true };
  }, ADMIN);

  // ---------- USUÁRIOS ----------
  r.get('/api/usuarios', async () =>
    saidas(await col.usuarios.find({}, { projection: { senha_hash: 0 } }).sort({ nome: 1 }).toArray()));

  r.post('/api/usuarios', async ({ body }) => {
    const d = { nome: txt(body.nome, 120), email: normalizar(body.email), telefone: opc(body.telefone, 40), perfil: PERFIS.includes(body.perfil) ? body.perfil : 'Técnico', ativo: body.ativo === undefined ? true : bool(body.ativo) };
    exigir({ ...d, senha: body.senha }, { nome: 'nome', email: 'e-mail', senha: 'senha' });
    if (!reEmail.test(d.email)) throw new HttpError(400, 'E-mail inválido.');
    if (String(body.senha).length < 8) throw new HttpError(400, 'A senha precisa ter ao menos 8 caracteres.');
    try {
      const { insertedId } = await col.usuarios.insertOne({ ...d, senha_hash: hashSenha(body.senha), criado_em: new Date() });
      return saida({ _id: insertedId, ...d });
    } catch (e) {
      if (e.code === 11000) throw new HttpError(409, 'Já existe um usuário com este e-mail.');
      throw e;
    }
  }, ADMIN);

  r.put('/api/usuarios/:id', async ({ params, body, user }) => {
    const id = oid(params.id);
    const d = { nome: txt(body.nome, 120), email: normalizar(body.email), telefone: opc(body.telefone, 40), perfil: PERFIS.includes(body.perfil) ? body.perfil : 'Técnico', ativo: bool(body.ativo) };
    exigir(d, { nome: 'nome', email: 'e-mail' });
    if (String(id) === user.id && (!d.ativo || d.perfil !== 'Administrador')) throw new HttpError(400, 'Você não pode desativar nem rebaixar o próprio acesso.');
    if (body.senha) {
      if (String(body.senha).length < 8) throw new HttpError(400, 'A senha precisa ter ao menos 8 caracteres.');
      d.senha_hash = hashSenha(body.senha);
    }
    try {
      const r2 = await col.usuarios.findOneAndUpdate({ _id: id }, { $set: d }, { returnDocument: 'after', projection: { senha_hash: 0 } });
      if (!d.ativo) await col.sessoes.deleteMany({ usuario_id: id });
      return saida(existe(r2, 'Usuário'));
    } catch (e) {
      if (e.code === 11000) throw new HttpError(409, 'Já existe um usuário com este e-mail.');
      throw e;
    }
  }, ADMIN);

  // ---------- TIPOS ----------
  r.get('/api/tipos', async () => {
    const [tipos, cont] = await Promise.all([
      col.tipos.find().sort({ cor: 1 }).toArray(),
      col.equipamentos.aggregate([{ $group: { _id: '$tipo_id', n: { $sum: 1 } } }]).toArray(),
    ]);
    const n = new Map(cont.map(x => [String(x._id), x.n]));
    return tipos.map(t => ({ ...saida(t), modelos: n.get(String(t._id)) || 0 }));
  });

  r.post('/api/tipos', async ({ body }) => {
    const nome = txt(body.nome, 60);
    exigir({ nome }, { nome: 'nome do tipo' });
    const sigla = (txt(body.sigla, 4) || nome.slice(0, 3)).toUpperCase();
    const cor = await col.tipos.countDocuments();
    try {
      const { insertedId } = await col.tipos.insertOne({ nome, nome_norm: normalizar(nome), sigla, cor });
      return saida({ _id: insertedId, nome, sigla, cor });
    } catch (e) {
      if (e.code === 11000) throw new HttpError(409, `O tipo “${nome}” já existe.`);
      throw e;
    }
  });

  // ---------- CATÁLOGO DE EQUIPAMENTOS ----------
  r.get('/api/equipamentos', async () => {
    const [eqs, cont] = await Promise.all([
      col.equipamentos.find().sort({ nome: 1 }).toArray(),
      col.parque.aggregate([{ $group: { _id: '$equipamento_id', n: { $sum: 1 } } }]).toArray(),
    ]);
    const n = new Map(cont.map(x => [String(x._id), x.n]));
    return eqs.map(e => ({ ...saida(e), tipo_id: String(e.tipo_id), no_parque: n.get(String(e._id)) || 0 }));
  });

  r.post('/api/equipamentos', async ({ body }) => {
    const d = dadosEquipamento(body);
    existe(await col.tipos.findOne({ _id: d.tipo_id }), 'Tipo');
    const { insertedId } = await col.equipamentos.insertOne(d);
    return saida({ _id: insertedId, ...d });
  });

  r.put('/api/equipamentos/:id', async ({ params, body }) => {
    const r2 = await col.equipamentos.findOneAndUpdate({ _id: oid(params.id) }, { $set: dadosEquipamento(body) }, { returnDocument: 'after' });
    return saida(existe(r2, 'Equipamento'));
  });
};
