// Modo demonstração: banco em memória que imita o subconjunto da API do MongoDB usado pelo sistema.
// Ative com MONGODB_URI=memoria. Os dados são perdidos ao parar o servidor.
import { ObjectId } from 'mongodb';

const ehObj = v => v && typeof v === 'object' && !(v instanceof ObjectId) && !(v instanceof Date) && !Array.isArray(v);
function clonar(v) {
  if (v instanceof Date) return new Date(v);
  if (v instanceof ObjectId || v == null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(clonar);
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clonar(x)]));
}
const chave = v => (v instanceof ObjectId ? 'oid:' + v.toHexString() : v instanceof Date ? 'd:' + v.getTime() : JSON.stringify(v ?? null));
const igual = (a, b) => chave(a) === chave(b);
const comparar = (a, b) => {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (a instanceof Date) a = a.getTime();
  if (b instanceof Date) b = b.getTime();
  if (a instanceof ObjectId) a = a.toHexString();
  if (b instanceof ObjectId) b = b.toHexString();
  if (typeof a === 'string' && typeof b === 'string') return a.localeCompare(b, 'pt', { sensitivity: 'base' });
  return a < b ? -1 : a > b ? 1 : 0;
};

function casa(doc, filtro = {}) {
  return Object.entries(filtro).every(([campo, cond]) => {
    const v = doc[campo];
    if (ehObj(cond) && Object.keys(cond).some(k => k.startsWith('$'))) {
      return Object.entries(cond).every(([op, x]) => {
        switch (op) {
          case '$in': return x.some(y => igual(v, y));
          case '$ne': return !igual(v, x);
          case '$gt': return v != null && comparar(v, x) > 0;
          case '$gte': return v != null && comparar(v, x) >= 0;
          case '$lt': return v != null && comparar(v, x) < 0;
          case '$lte': return v != null && comparar(v, x) <= 0;
          default: throw new Error(`Operador ${op} não suportado no modo demonstração`);
        }
      });
    }
    if (cond === null) return v == null;
    return igual(v, cond);
  });
}

function projetar(doc, proj) {
  if (!proj || !Object.keys(proj).length) return clonar(doc);
  const inclui = Object.values(proj).some(v => v);
  if (inclui) {
    const out = { _id: doc._id };
    for (const k of Object.keys(proj)) if (proj[k] && k in doc) out[k] = clonar(doc[k]);
    return out;
  }
  const out = clonar(doc);
  for (const k of Object.keys(proj)) delete out[k];
  return out;
}

function aplicarUpdate(doc, upd, inserindo) {
  for (const [op, campos] of Object.entries(upd)) {
    if (op === '$set') Object.assign(doc, clonar(campos));
    else if (op === '$inc') for (const [k, n] of Object.entries(campos)) doc[k] = (doc[k] || 0) + n;
    else if (op === '$setOnInsert') { if (inserindo) Object.assign(doc, clonar(campos)); }
    else throw new Error(`Atualização ${op} não suportada no modo demonstração`);
  }
  for (const k of Object.keys(doc)) if (doc[k] === undefined) delete doc[k];
}

class Cursor {
  constructor(docs) { this.docs = docs; }
  sort(s) {
    const campos = Object.entries(s);
    this.docs.sort((a, b) => { for (const [k, d] of campos) { const c = comparar(a[k], b[k]); if (c) return c * d; } return 0; });
    return this;
  }
  collation() { return this; }
  limit(n) { this.docs = this.docs.slice(0, n); return this; }
  async toArray() { return this.docs; }
}

class Colecao {
  constructor() { this.docs = []; this.unicos = []; }

  verificarUnicos(doc, ignorar) {
    for (const campos of this.unicos) {
      if (campos.some(c => doc[c] === undefined)) continue;
      const dup = this.docs.find(d => d !== ignorar && campos.every(c => igual(d[c], doc[c])));
      if (dup) { const e = new Error(`E11000 duplicate key: ${campos.join(', ')}`); e.code = 11000; throw e; }
    }
  }

  async createIndex(spec, opcoes = {}) { if (opcoes.unique) this.unicos.push(Object.keys(spec)); return Object.keys(spec).join('_'); }

  find(filtro = {}, opcoes = {}) { return new Cursor(this.docs.filter(d => casa(d, filtro)).map(d => projetar(d, opcoes.projection))); }
  async findOne(filtro = {}, opcoes = {}) { const d = this.docs.find(x => casa(x, filtro)); return d ? projetar(d, opcoes.projection) : null; }
  async countDocuments(filtro = {}) { return this.docs.filter(d => casa(d, filtro)).length; }

  async insertOne(doc) {
    if (doc._id === undefined) doc._id = new ObjectId();
    const novo = clonar(doc);
    this.verificarUnicos(novo);
    this.docs.push(novo);
    return { acknowledged: true, insertedId: doc._id };
  }
  async insertMany(docs) {
    const ids = {};
    for (const [i, d] of docs.entries()) ids[i] = (await this.insertOne(d)).insertedId;
    return { acknowledged: true, insertedIds: ids };
  }

  async updateOne(filtro, upd, opcoes = {}) {
    const d = this.docs.find(x => casa(x, filtro));
    if (d) {
      const tentativa = clonar(d);
      aplicarUpdate(tentativa, upd, false);
      this.verificarUnicos(tentativa, d);
      Object.keys(d).forEach(k => delete d[k]); Object.assign(d, tentativa);
      return { matchedCount: 1, modifiedCount: 1, upsertedId: null };
    }
    if (!opcoes.upsert) return { matchedCount: 0, modifiedCount: 0, upsertedId: null };
    const novo = Object.fromEntries(Object.entries(filtro).filter(([, v]) => !ehObj(v) || !Object.keys(v).some(k => k.startsWith('$'))));
    aplicarUpdate(novo, upd, true);
    const { insertedId } = await this.insertOne(novo);
    return { matchedCount: 0, modifiedCount: 0, upsertedId: insertedId };
  }

  async findOneAndUpdate(filtro, upd, opcoes = {}) {
    const antes = this.docs.find(x => casa(x, filtro));
    if (!antes && !opcoes.upsert) return null;
    const copiaAntes = antes ? clonar(antes) : null;
    const r = await this.updateOne(filtro, upd, opcoes);
    const depois = antes || this.docs.find(x => igual(x._id, r.upsertedId));
    const alvo = opcoes.returnDocument === 'after' ? depois : copiaAntes;
    return alvo ? projetar(alvo, opcoes.projection) : null;
  }

  async findOneAndDelete(filtro) {
    const i = this.docs.findIndex(x => casa(x, filtro));
    return i < 0 ? null : this.docs.splice(i, 1)[0];
  }
  async deleteOne(filtro) {
    const i = this.docs.findIndex(x => casa(x, filtro));
    if (i >= 0) this.docs.splice(i, 1);
    return { deletedCount: i >= 0 ? 1 : 0 };
  }
  async deleteMany(filtro = {}) {
    const antes = this.docs.length;
    this.docs = this.docs.filter(d => !casa(d, filtro));
    return { deletedCount: antes - this.docs.length };
  }

  async bulkWrite(ops) {
    for (const op of ops) {
      if (!op.updateOne) throw new Error('bulkWrite: só updateOne é suportado no modo demonstração');
      await this.updateOne(op.updateOne.filter, op.updateOne.update, { upsert: op.updateOne.upsert });
    }
    return { ok: 1 };
  }

  aggregate(pipeline) {
    let docs = this.docs.map(clonar);
    for (const etapa of pipeline) {
      if (etapa.$match) docs = docs.filter(d => casa(d, etapa.$match));
      else if (etapa.$group) {
        const { _id: expr, ...acc } = etapa.$group;
        const grupos = new Map();
        for (const d of docs) {
          const id = typeof expr === 'string' && expr.startsWith('$') ? d[expr.slice(1)] : expr;
          const k = chave(id);
          if (!grupos.has(k)) grupos.set(k, { _id: id });
          const g = grupos.get(k);
          for (const [nome, op] of Object.entries(acc)) {
            if (op.$sum !== undefined) g[nome] = (g[nome] || 0) + (typeof op.$sum === 'string' ? d[op.$sum.slice(1)] || 0 : op.$sum);
            else if (op.$min !== undefined) { const v = d[op.$min.slice(1)]; if (g[nome] === undefined || comparar(v, g[nome]) < 0) g[nome] = v; }
            else throw new Error('Acumulador não suportado no modo demonstração');
          }
        }
        docs = [...grupos.values()];
      } else throw new Error(`Etapa ${Object.keys(etapa)[0]} não suportada no modo demonstração`);
    }
    return new Cursor(docs);
  }
}

export class ClienteMemoria {
  constructor() { this.colecoes = new Map(); }
  async connect() { return this; }
  async close() {}
  db(nome) {
    return {
      databaseName: `${nome} (memória)`,
      collection: n => { if (!this.colecoes.has(n)) this.colecoes.set(n, new Colecao()); return this.colecoes.get(n); },
    };
  }
}
