// Senhas (scrypt) e sessões por cookie HttpOnly guardadas no MongoDB.
import crypto from 'node:crypto';
import { col } from './db.js';

const DURACAO_SESSAO = 1000 * 60 * 60 * 24 * 7; // 7 dias
export const COOKIE = 'pv_sessao';

export function hashSenha(senha) {
  const sal = crypto.randomBytes(16);
  const h = crypto.scryptSync(String(senha), sal, 64);
  return `scrypt$${sal.toString('hex')}$${h.toString('hex')}`;
}

export function confereSenha(senha, armazenado) {
  const [alg, sal, h] = String(armazenado || '').split('$');
  if (alg !== 'scrypt' || !sal || !h) return false;
  const calc = crypto.scryptSync(String(senha), Buffer.from(sal, 'hex'), 64);
  const esperado = Buffer.from(h, 'hex');
  return esperado.length === calc.length && crypto.timingSafeEqual(calc, esperado);
}

// O token vai no cookie; no banco fica só o hash dele.
const hashToken = t => crypto.createHash('sha256').update(t).digest('hex');

export async function criarSessao(usuarioId) {
  const token = crypto.randomBytes(32).toString('hex');
  await col.sessoes.insertOne({ _id: hashToken(token), usuario_id: usuarioId, expira_em: new Date(Date.now() + DURACAO_SESSAO) });
  return token;
}

export const encerrarSessao = token => token && col.sessoes.deleteOne({ _id: hashToken(token) });

export async function usuarioDaSessao(token) {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const s = await col.sessoes.findOne({ _id: hashToken(token), expira_em: { $gt: new Date() } });
  if (!s) return null;
  const u = await col.usuarios.findOne({ _id: s.usuario_id, ativo: true }, { projection: { senha_hash: 0 } });
  return u ? { id: String(u._id), _id: u._id, nome: u.nome, email: u.email, telefone: u.telefone, perfil: u.perfil } : null;
}

export const cookieSessao = token => `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${DURACAO_SESSAO / 1000}`;
export const cookieLimpo = () => `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;

export function lerCookies(header = '') {
  return Object.fromEntries(header.split(';').map(p => p.trim().split('=')).filter(p => p[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
}

// Bloqueio simples contra tentativa e erro: 5 falhas → 5 minutos de espera
const falhas = new Map();
const JANELA = 5 * 60 * 1000;
export function podeTentar(chave) {
  const f = falhas.get(chave);
  return !f || f.n < 5 || Date.now() - f.t > JANELA;
}
export function registrarFalha(chave) {
  const f = falhas.get(chave);
  if (!f || Date.now() - f.t > JANELA) falhas.set(chave, { n: 1, t: Date.now() });
  else { f.n++; f.t = Date.now(); }
}
export const limparFalhas = chave => falhas.delete(chave);
