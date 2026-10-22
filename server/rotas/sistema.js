// Login, painel, ajustes, central de alertas e backup.
import { BSON } from 'mongodb';
import { col, db, saida, mapas, detalharUnidade, lerConfig, salvarConfig, hoje, normalizar } from '../db.js';
import { confereSenha, hashSenha, criarSessao, encerrarSessao, cookieSessao, cookieLimpo, podeTentar, registrarFalha, limparFalhas, COOKIE } from '../auth.js';
import { executarAlertas, canaisConfigurados } from '../alertas.js';
import { pendencias, STATUS } from './parque.js';
import { HttpError, txt, opc, int, exigir } from '../http.js';

const ADMIN = { perfis: ['Administrador'] };
const PUBLICA = { publica: true };
const reLogo = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
const LIMITE_LOGO = 700_000; // ~500 KB de imagem
const COLECOES_BACKUP = ['config', 'usuarios', 'clientes', 'tipos', 'equipamentos', 'parque', 'manutencoes', 'movimentacoes', 'sequencias', 'relatorios', 'orcamentos', 'alertas'];

export default r => {
  // ---------- autenticação ----------
  r.post('/api/login', async ({ body, ip }) => {
    const email = normalizar(body.email);
    const chave = `${ip}|${email}`;
    if (!podeTentar(chave)) throw new HttpError(429, 'Muitas tentativas. Aguarde 5 minutos e tente de novo.');
    const u = await col.usuarios.findOne({ email });
    if (!u || !u.ativo || !confereSenha(body.senha || '', u.senha_hash)) {
      registrarFalha(chave);
      throw new HttpError(401, 'E-mail ou senha incorretos.');
    }
    limparFalhas(chave);
    const token = await criarSessao(u._id);
    return { $cookie: cookieSessao(token), body: { id: String(u._id), nome: u.nome, perfil: u.perfil } };
  }, PUBLICA);

  r.post('/api/logout', async ({ cookies }) => {
    await encerrarSessao(cookies[COOKIE]);
    return { $cookie: cookieLimpo(), body: { ok: true } };
  }, PUBLICA);

  r.get('/api/me', async ({ user }) => ({ ...user, _id: undefined }));

  r.put('/api/me/senha', async ({ body, user }) => {
    const u = await col.usuarios.findOne({ _id: user._id });
    if (!confereSenha(body.atual || '', u.senha_hash)) throw new HttpError(400, 'Senha atual incorreta.');
    if (String(body.nova || '').length < 8) throw new HttpError(400, 'A nova senha precisa ter ao menos 8 caracteres.');
    await col.usuarios.updateOne({ _id: u._id }, { $set: { senha_hash: hashSenha(body.nova) } });
    return { ok: true };
  });

  // ---------- painel ----------
  r.get('/api/painel', async () => {
    const ano = new Date().getFullYear();
    const M = await mapas();
    const [parque, pend, rtAno, rtRasc, abertos, movs] = await Promise.all([
      col.parque.find().toArray(),
      pendencias({ ateDias: 30 }),
      col.relatorios.aggregate([{ $match: { ano } }, { $group: { _id: '$status', n: { $sum: 1 } } }]).toArray(),
      col.relatorios.countDocuments({ status: 'rascunho' }),
      col.orcamentos.find({ situacao: 'Em aberto' }).toArray(),
      col.movimentacoes.find().sort({ data: -1, criado_em: -1 }).limit(8).toArray(),
    ]);
    const ativos = parque.filter(u => u.status !== 'Sucata');
    const tipoDe = u => String(M.equipamentos.get(String(u.equipamento_id))?.tipo_id);
    const valorAberto = abertos.reduce((s, o) => s + (o.itens || []).reduce((a, i) => a + i.quantidade * i.valor_unitario, 0) + o.horas * o.valor_hora + o.deslocamento, 0);
    const unidades = new Map(parque.map(u => [String(u._id), u]));
    const rt = Object.fromEntries(rtAno.map(x => [x._id, x.n]));
    // pendências dos próximos 30 dias agrupadas em 6 faixas de 5 dias (minigráfico)
    const faixas = Array(6).fill(0);
    pend.forEach(p => { if (p.dias >= 0 && p.dias < 30) faixas[Math.floor(p.dias / 5)]++; });
    return {
      ano,
      parque: { total: parque.length, ativos: ativos.length },
      manutencao: { atrasadas: pend.filter(p => p.dias < 0).length, proximas: pend.filter(p => p.dias >= 0).length, semana: pend.filter(p => p.dias >= 0 && p.dias <= 7).length, faixas },
      relatorios: { ano: (rt.rascunho || 0) + (rt.finalizado || 0), finalizados: rt.finalizado || 0, rascunhos: rtRasc },
      orcamentos: { abertos: abertos.length, valor: valorAberto },
      agenda: pend.slice(0, 8),
      por_tipo: [...M.tipos.values()].sort((a, b) => a.cor - b.cor).map(t => ({ id: String(t._id), nome: t.nome, sigla: t.sigla, cor: t.cor, n: ativos.filter(u => tipoDe(u) === String(t._id)).length })),
      por_status: STATUS.map(s => ({ status: s, n: parque.filter(u => u.status === s).length })).filter(x => x.n),
      recentes: movs.map(h => {
        const u = detalharUnidade(unidades.get(String(h.parque_id)), M);
        return { ...saida(h), parque_id: String(h.parque_id), ref_id: h.ref_id ? String(h.ref_id) : null, equipamento: u?.equipamento, serie: u?.serie, fantasia: u?.fantasia };
      }),
    };
  });

  // ---------- ajustes ----------
  r.get('/api/config', async () => ({ ...(await lerConfig()), canais: canaisConfigurados() }));

  r.put('/api/config', async ({ body }) => {
    const logo = body.logo ? String(body.logo) : null;
    if (logo && (!reLogo.test(logo) || logo.length > LIMITE_LOGO)) throw new HttpError(400, 'Logo inválido. Use PNG, JPG ou WEBP de até 500 KB.');
    const c = { empresa: txt(body.empresa, 160), cnpj: opc(body.cnpj, 20), endereco: opc(body.endereco, 300), contato: opc(body.contato, 200), logo, alerta_dias_antes: Math.min(60, Math.max(0, int(body.alerta_dias_antes) ?? 7)) };
    exigir(c, { empresa: 'nome da empresa' });
    await salvarConfig(c);
    return lerConfig();
  }, ADMIN);

  // Remove os dados de exemplo (mantém usuários, tipos e ajustes)
  r.post('/api/exemplos/remover', async () => {
    await Promise.all(['clientes', 'equipamentos', 'parque', 'manutencoes', 'movimentacoes', 'relatorios', 'orcamentos', 'alertas', 'sequencias'].map(c => col[c].deleteMany({})));
    await col.usuarios.deleteMany({ exemplo: true });
    await salvarConfig({ exemplos: false });
    return { ok: true };
  }, ADMIN);
  r.post('/api/exemplos/manter', async () => { await salvarConfig({ exemplos: false }); return { ok: true }; }, ADMIN);

  // ---------- central de alertas ----------
  r.get('/api/alertas', async ({ query }) => {
    const f = query.status ? { status: query.status } : {};
    const lista = await col.alertas.find(f).sort({ criado_em: -1 }).limit(200).toArray();
    const mts = new Map((await col.manutencoes.find({ _id: { $in: lista.map(a => a.manutencao_id) } }).toArray()).map(m => [String(m._id), m]));
    const M = await mapas();
    const unidades = new Map((await col.parque.find({ _id: { $in: [...mts.values()].map(m => m.parque_id) } }).toArray()).map(u => [String(u._id), u]));
    const resumo = await col.alertas.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]).toArray();
    return {
      canais: canaisConfigurados(),
      resumo: Object.fromEntries(resumo.map(x => [x._id, x.n])),
      lista: lista.map(a => {
        const m = mts.get(String(a.manutencao_id));
        const u = m && detalharUnidade(unidades.get(String(m.parque_id)), M);
        return { id: String(a._id), canal: a.canal, destino: a.destino, destinatario: a.destinatario, marco: a.marco, status: a.status, erro: a.erro, tentativas: a.tentativas, criado_em: a.criado_em, enviado_em: a.enviado_em,
          data: m?.data, descricao: m?.descricao, parque_id: m ? String(m.parque_id) : null, equipamento: u?.equipamento, serie: u?.serie, fantasia: u?.fantasia };
      }),
    };
  });

  r.post('/api/alertas/executar', async () => executarAlertas(), ADMIN);

  // ---------- backup (JSON estendido do MongoDB, restaurável com mongoimport ou pelo próprio Node) ----------
  r.get('/api/backup', async () => {
    const dump = { gerado_em: new Date(), banco: db.databaseName, colecoes: {} };
    for (const c of COLECOES_BACKUP) dump.colecoes[c] = await col[c].find().toArray();
    return { $arquivo: { nome: `posvendas-backup-${hoje()}.json`, tipo: 'application/json', conteudo: BSON.EJSON.stringify(dump, { relaxed: false }) } };
  }, ADMIN);
};

