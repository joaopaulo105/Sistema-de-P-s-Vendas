// Conexão com o MongoDB, índices e utilitários de dados.
import { MongoClient, ObjectId } from 'mongodb';
import { ClienteMemoria } from './memoria.js';

export const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
export const MONGODB_DB = process.env.MONGODB_DB || 'posvendas';
export const MODO_MEMORIA = MONGODB_URI === 'memoria';

// MONGODB_URI=memoria → modo demonstração sem MongoDB (dados se perdem ao parar o servidor)
export const client = MODO_MEMORIA ? new ClienteMemoria() : new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
export let db;

/** Coleções usadas pelo sistema. */
export const col = new Proxy({}, { get: (_, nome) => db.collection(nome) });

export async function conectar() {
  await client.connect();
  db = client.db(MONGODB_DB);
  await Promise.all([
    col.usuarios.createIndex({ email: 1 }, { unique: true }),
    col.sessoes.createIndex({ expira_em: 1 }, { expireAfterSeconds: 0 }),   // expira sozinha
    col.clientes.createIndex({ fantasia: 1 }),
    col.tipos.createIndex({ nome_norm: 1 }, { unique: true }),
    col.equipamentos.createIndex({ tipo_id: 1 }),
    col.parque.createIndex({ serie_norm: 1 }, { unique: true }),           // nº de série único
    col.parque.createIndex({ cliente_id: 1 }),
    col.manutencoes.createIndex({ realizada: 1, data: 1 }),
    col.manutencoes.createIndex({ parque_id: 1 }),
    col.movimentacoes.createIndex({ parque_id: 1, data: -1 }),
    col.relatorios.createIndex({ ano: 1, numero: 1 }, { unique: true }),
    col.orcamentos.createIndex({ ano: 1, numero: 1 }, { unique: true }),
    col.alertas.createIndex({ manutencao_id: 1, canal: 1, destino: 1, marco: 1 }, { unique: true }),
    col.alertas.createIndex({ criado_em: -1 }),
  ]);
  return db;
}

// ---- identificadores ----
export function oid(v) {
  if (v instanceof ObjectId) return v;
  return ObjectId.isValid(String(v ?? '')) && String(v).length === 24 ? new ObjectId(String(v)) : null;
}
export { ObjectId };

/** Converte _id → id para a API (ObjectId vira texto no JSON). */
export const saida = doc => {
  if (!doc) return doc;
  const { _id, ...resto } = doc;
  return { id: String(_id), ...resto };
};
export const saidas = docs => docs.map(saida);

export const normalizar = s => String(s ?? '').trim().toLowerCase();

/** Próximo número da série no ano (RT, ORC). Reinicia em 1 quando o ano muda. Operação atômica. */
export async function proximoNumero(serie, ano) {
  const r = await col.sequencias.findOneAndUpdate(
    { _id: `${serie}-${ano}` },
    { $inc: { ultimo: 1 }, $setOnInsert: { serie, ano } },
    { upsert: true, returnDocument: 'after' }
  );
  return r.ultimo;
}

/** Histórico de movimentações do equipamento. */
export async function registrar(parqueId, data, tipo, ocorrencia, { refTipo = null, refId = null, usuarioId = null } = {}) {
  await col.movimentacoes.insertOne({ parque_id: oid(parqueId), data, tipo, ocorrencia, ref_tipo: refTipo, ref_id: refId ? oid(refId) : null, usuario_id: usuarioId ? oid(usuarioId) : null, criado_em: new Date() });
}

// ---- configuração (documento único) ----
const CONFIG_PADRAO = { empresa: 'Sua Empresa Assistência Técnica', cnpj: '', endereco: '', contato: '', logo: null, alerta_dias_antes: 7, exemplos: false };
export async function lerConfig() {
  const c = await col.config.findOne({ _id: 'geral' });
  return { ...CONFIG_PADRAO, ...(c || {}), _id: undefined };
}
export const salvarConfig = campos => col.config.updateOne({ _id: 'geral' }, { $set: campos }, { upsert: true });

// ---- datas no fuso local do servidor ----
const iso = d => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
export const hoje = () => iso(new Date());
export const somarDias = (n, base) => { const d = base ? new Date(base + 'T12:00') : new Date(); d.setDate(d.getDate() + n); return iso(d); };
export const diasAte = data => Math.round((new Date(data.slice(0, 10) + 'T12:00') - new Date(hoje() + 'T12:00')) / 864e5);
export const fmtData = s => (s ? s.slice(0, 10).split('-').reverse().join('/') : '—');
export const numDoc = (prefixo, d) => `${prefixo} ${String(d.numero).padStart(4, '0')}/${d.ano}`;

/** Carrega os cadastros de apoio em mapas para montar respostas (clientes, equipamentos, tipos, usuários). */
export async function mapas() {
  const [clientes, equipamentos, tipos, usuarios] = await Promise.all([
    col.clientes.find().toArray(), col.equipamentos.find().toArray(), col.tipos.find().toArray(),
    col.usuarios.find({}, { projection: { senha_hash: 0 } }).toArray(),
  ]);
  const m = arr => new Map(arr.map(x => [String(x._id), x]));
  return { clientes: m(clientes), equipamentos: m(equipamentos), tipos: m(tipos), usuarios: m(usuarios) };
}

/** Une parque + cliente + equipamento + tipo num objeto plano usado em várias telas. */
export function detalharUnidade(u, M) {
  if (!u) return null;
  const c = M.clientes.get(String(u.cliente_id)) || {};
  const e = M.equipamentos.get(String(u.equipamento_id)) || {};
  const t = M.tipos.get(String(e.tipo_id)) || {};
  return {
    id: String(u._id), serie: u.serie, status: u.status, data_instalacao: u.data_instalacao,
    cliente_id: String(u.cliente_id), cliente_nome: c.nome, fantasia: c.fantasia, cnpj: c.cnpj, endereco: c.endereco, cidade: c.cidade, estado: c.estado, telefone: c.telefone, email: c.email,
    equipamento_id: String(u.equipamento_id), equipamento: e.nome, marca: e.marca, modelo: e.modelo,
    tipo_id: t._id ? String(t._id) : null, tipo: t.nome, sigla: t.sigla, cor: t.cor ?? 6,
  };
}
