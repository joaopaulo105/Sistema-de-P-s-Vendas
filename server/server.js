// Espectro Pós-Vendas · servidor HTTP (API REST + arquivos do front-end).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { conectar, MONGODB_DB, MONGODB_URI, MODO_MEMORIA } from './db.js';
import { Router, HttpError } from './http.js';
import { usuarioDaSessao, lerCookies, COOKIE } from './auth.js';
import { semear } from './seed.js';
import { iniciarAgendador } from './alertas.js';
import cadastros from './rotas/cadastros.js';
import parque from './rotas/parque.js';
import assistencia from './rotas/assistencia.js';
import sistema from './rotas/sistema.js';

const PORTA = Number(process.env.PORT || 3000);
const PUBLICO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const LIMITE_CORPO = 2 * 1024 * 1024;

const router = new Router();
[sistema, cadastros, parque, assistencia].forEach(registrar => registrar(router));

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
const SEGURANCA = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' https://fonts.googleapis.com; style-src-attr 'unsafe-inline'; font-src https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; frame-ancestors 'none'",
};

function enviarJSON(res, status, dados, extras = {}) {
  const corpo = JSON.stringify(dados);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SEGURANCA, ...extras });
  res.end(corpo);
}

function lerCorpo(req) {
  return new Promise((ok, falha) => {
    let tam = 0; const partes = [];
    req.on('data', c => {
      tam += c.length;
      if (tam > LIMITE_CORPO) { falha(new HttpError(413, 'Conteúdo grande demais.')); req.destroy(); return; }
      partes.push(c);
    });
    req.on('end', () => {
      if (!partes.length) return ok({});
      try { ok(JSON.parse(Buffer.concat(partes).toString('utf8'))); }
      catch { falha(new HttpError(400, 'JSON inválido.')); }
    });
    req.on('error', falha);
  });
}

async function api(req, res, url) {
  const achou = router.encontrar(req.method, url.pathname);
  if (!achou) throw new HttpError(404, 'Rota não encontrada.');
  if (achou === 'metodo') throw new HttpError(405, 'Método não permitido.');
  const { rota, params } = achou;

  const cookies = lerCookies(req.headers.cookie);
  const user = await usuarioDaSessao(cookies[COOKIE]);
  if (!rota.opcoes.publica && !user) throw new HttpError(401, 'Sessão expirada. Entre novamente.');
  if (rota.opcoes.perfis && !rota.opcoes.perfis.includes(user.perfil)) throw new HttpError(403, 'Seu perfil não tem permissão para esta ação.');

  let body = {};
  if (req.method === 'POST' || req.method === 'PUT') {
    // Exigir JSON impede envio de formulários de outros sites (proteção contra CSRF)
    if (!String(req.headers['content-type'] || '').startsWith('application/json')) throw new HttpError(415, 'Envie os dados como JSON.');
    body = await lerCorpo(req);
  }
  const query = Object.fromEntries(url.searchParams);
  const ip = req.socket.remoteAddress;
  const r = await rota.handler({ params, query, body, user, cookies, ip, req });

  if (r && r.$arquivo) {
    res.writeHead(200, { 'Content-Type': r.$arquivo.tipo, 'Content-Disposition': `attachment; filename="${r.$arquivo.nome}"`, 'Cache-Control': 'no-store', ...SEGURANCA });
    return res.end(r.$arquivo.conteudo);
  }
  if (r && r.$cookie) return enviarJSON(res, 200, r.body, { 'Set-Cookie': r.$cookie });
  enviarJSON(res, 200, r ?? { ok: true });
}

function estatico(req, res, url) {
  let caminho;
  try { caminho = decodeURIComponent(url.pathname); } catch { res.writeHead(400); return res.end(); }
  if (caminho === '/' || caminho === '') caminho = '/index.html';
  const arquivo = path.resolve(PUBLICO, '.' + path.posix.normalize(caminho));
  if (!arquivo.startsWith(PUBLICO + path.sep)) { res.writeHead(403); return res.end(); }
  fs.stat(arquivo, (erro, st) => {
    if (erro || !st.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', ...SEGURANCA });
      return res.end('Página não encontrada.');
    }
    const ext = path.extname(arquivo).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=300', ...SEGURANCA });
    fs.createReadStream(arquivo).pipe(res);
  });
}

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (!url.pathname.startsWith('/api/')) return estatico(req, res, url);
  try {
    await api(req, res, url);
  } catch (e) {
    if (e instanceof HttpError) return enviarJSON(res, e.status, { erro: e.message, campos: e.campos });
    console.error(`[erro] ${req.method} ${url.pathname}`, e);
    enviarJSON(res, 500, { erro: 'Erro interno no servidor. Tente de novo; se persistir, verifique o terminal do servidor.' });
  }
});

try {
  await conectar();
} catch (e) {
  const uri = MONGODB_URI.replace(/\/\/[^@/]*@/, '//***@');
  console.error(`\n  Não foi possível conectar ao MongoDB em ${uri}\n  ${e.message}\n\n  Verifique se o MongoDB está rodando ou ajuste MONGODB_URI no arquivo .env.\n`);
  process.exit(1);
}
await semear();
iniciarAgendador();
servidor.listen(PORTA, () => {
  console.log(`  Espectro Pós-Vendas rodando em http://localhost:${PORTA}  (banco: ${MODO_MEMORIA ? 'MODO DEMONSTRAÇÃO em memória — os dados somem ao parar' : MONGODB_DB})`);
});
