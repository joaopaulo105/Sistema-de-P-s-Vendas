// Casca da aplicação: sessão, menu, roteamento por hash, alertas e tema.
import { $, esc, ic, iniciais, agendaHTML, armazenamento, fmtD, hoje } from './util.js';
import { api } from './api.js';
import { modal, fechar, erro } from './ui.js';

const MENU = [
  { g: 'Visão geral' },
  { rota: 'painel', t: 'Painel', ic: 'grid', eb: 'Visão geral' },
  { g: 'Cadastros' },
  { rota: 'clientes', t: 'Clientes', ic: 'building', eb: 'Cadastro de cliente' },
  { rota: 'usuarios', t: 'Usuários', ic: 'users', eb: 'Cadastro de usuário' },
  { g: 'Pós-vendas' },
  { rota: 'catalogo', t: 'Catálogo de equipamentos', ic: 'flask', eb: 'Equipamentos · Cadastro' },
  { rota: 'parque', t: 'Parque instalado', ic: 'cpu', eb: 'Equipamentos · Visualização' },
  { rota: 'manutencoes', t: 'Programação', ic: 'cal', eb: 'Manutenções programadas', cnt: 'manut' },
  { rota: 'alertas', t: 'Central de alertas', ic: 'send', eb: 'E-mail e celular' },
  { g: 'Assistência' },
  { rota: 'relatorios', t: 'Relatórios técnicos', ic: 'wrench', eb: 'Assistência' },
  { rota: 'orcamentos', t: 'Orçamentos', ic: 'receipt', eb: 'Assistência' },
  { g: 'Sistema' },
  { rota: 'ajustes', t: 'Ajustes', ic: 'gear', eb: 'Sistema' },
];

// rota → módulo da tela (carregado sob demanda)
const ROTAS = [
  [/^painel$/, 'painel'], [/^clientes$/, 'clientes'], [/^usuarios$/, 'usuarios'], [/^catalogo$/, 'catalogo'],
  [/^parque$/, 'parque'], [/^equipamento\/(\w+)$/, 'equipamento'], [/^manutencoes$/, 'manutencoes'], [/^alertas$/, 'alertas'],
  [/^relatorios$/, 'relatorios'], [/^relatorios\/(novo|\w+)$/, 'relatorio'],
  [/^orcamentos$/, 'orcamentos'], [/^orcamentos\/(novo|\w+)$/, 'orcamento'], [/^ajustes$/, 'ajustes'],
];

const estado = { user: null, agenda: [], popAberto: false, config: {} };
let limpar = null;

// ---------- menu ----------
function desenharMenu(atual) {
  const atrasadas = estado.agenda.filter(p => p.dias < 0).length;
  const n30 = estado.agenda.length;
  const raiz = atual.split('/')[0];
  const ativo = { equipamento: 'parque', relatorio: 'relatorios', orcamento: 'orcamentos' }[raiz] || raiz;
  $('#nav').innerHTML = MENU.map(m => m.g ? `<div class="nav-g">${m.g}</div>` :
    `<a href="#/${m.rota}"${m.rota === ativo ? ' aria-current="page"' : ''}>${ic(m.ic)}<span>${m.t}</span>${m.cnt ? `<span class="cnt${atrasadas ? ' hot' : ''}" title="${atrasadas} atrasada(s), ${n30} até 30 dias">${n30}</span>` : ''}</a>`).join('');
  const urgentes = estado.agenda.filter(p => p.dias <= 7).length;
  const sino = $('#bellBtn');
  sino.querySelector('.dot')?.remove();
  if (urgentes) sino.insertAdjacentHTML('beforeend', `<span class="dot">${urgentes}</span>`);
  sino.setAttribute('aria-label', `Alertas de manutenção: ${urgentes} nos próximos 7 dias`);
}

export async function atualizarAgenda() {
  try { estado.agenda = await api.get('/api/agenda?dias=30'); } catch { /* o menu segue sem contagem */ }
  desenharMenu(rotaAtual().caminho);
  if (estado.popAberto) desenharPop();
}

function desenharPop() {
  const lista = estado.agenda.filter(p => p.dias <= 7);
  $('#popHost').innerHTML = estado.popAberto ? `<div class="pop" role="dialog" aria-label="Alertas">
    <div class="pop-h">${ic('bell')}<h3>Alertas de manutenção</h3><span class="hint" style="margin-left:auto">até 7 dias</span></div>
    ${agendaHTML(lista) || '<div class="empty" style="padding:24px"><b>Sem alertas</b>Nenhuma manutenção vence nesta semana.</div>'}</div>` : '';
  $('#bellBtn').setAttribute('aria-expanded', String(estado.popAberto));
}

// ---------- roteamento ----------
function rotaAtual() {
  const h = location.hash.replace(/^#\/?/, '') || 'painel';
  const [caminho, q = ''] = h.split('?');
  return { caminho, query: Object.fromEntries(new URLSearchParams(q)) };
}

async function navegar() {
  const { caminho, query } = rotaAtual();
  const achou = ROTAS.find(([re]) => re.test(caminho));
  if (!achou) { location.hash = '#/painel'; return; }
  const [re, modulo] = achou;
  const params = caminho.match(re).slice(1);
  estado.popAberto = false; desenharPop();
  $('#side').classList.remove('open');
  fechar();
  desenharMenu(caminho);
  limpar?.(); limpar = null;

  const view = $('#view');
  view.innerHTML = '<div class="skeleton"></div><div class="skeleton" style="height:280px"></div>';
  try {
    const mod = await import(`./views/${modulo}.js`);
    const ctx = { params, query, user: estado.user, config: estado.config, atualizarAgenda, recarregar: navegar };
    const tela = await mod.default(ctx);
    const meta = MENU.find(m => m.rota === caminho.split('/')[0]) || {};
    $('#eyebrow').textContent = tela.eyebrow || meta.eb || '';
    $('#title').textContent = tela.titulo || meta.t || '';
    document.title = `${tela.titulo || meta.t} · Espectro Pós-Vendas`;
    view.innerHTML = (estado.config.exemplos && estado.user.perfil === 'Administrador' && modulo === 'painel' ? avisoExemplos() : '') + tela.html;
    limpar = tela.montar?.(view, ctx) || null;
    $('#scroll').scrollTop = 0;
  } catch (e) {
    if (e.status === 401) return;
    view.innerHTML = `<div class="card"><div class="empty"><b>Não foi possível abrir esta tela</b>${esc(e.message)}</div></div>`;
    $('#title').textContent = 'Erro';
  }
}

// ---------- dados de exemplo ----------
const avisoExemplos = () => `<div class="notice" id="avisoEx">${'<span class="pill" style="--c:var(--accent)">Dados de exemplo</span>'}
  <p>Clientes, equipamentos e documentos fictícios para você explorar o sistema. Remova quando for cadastrar os dados reais.</p>
  <button class="btn sm" type="button" data-ex="remover">Remover exemplos</button><button class="btn sm ghost" type="button" data-ex="manter">Manter</button></div>`;

document.addEventListener('click', async e => {
  const b = e.target.closest('[data-ex]');
  if (!b) return;
  try {
    await api.post(`/api/exemplos/${b.dataset.ex}`);
    estado.config.exemplos = false;
    await atualizarAgenda();
    navegar();
  } catch (err) { erro(err); }
});

// ---------- aviso ao entrar ----------
function avisoDeEntrada() {
  if (armazenamento.lerSessao('espectro:aviso')) return;
  armazenamento.gravarSessao('espectro:aviso', '1');
  const lista = estado.agenda.filter(p => p.dias <= 15);
  if (!lista.length) return;
  const atrasadas = lista.filter(p => p.dias < 0).length;
  modal({
    titulo: 'Programação de manutenção',
    corpo: `<p class="hint" style="margin-bottom:10px">${fmtD(hoje())} · ${atrasadas ? `<b style="color:var(--crit)">${atrasadas} atrasada${atrasadas > 1 ? 's' : ''}</b> · ` : ''}${lista.length - atrasadas} nos próximos 15 dias</p>
      <div class="card flat" style="margin-inline:-6px">${agendaHTML(lista)}</div>`,
    rodape: `<button class="btn" type="button" data-fechar>Fechar</button><a class="btn pri" href="#/manutencoes">Abrir programação</a>`,
  });
}

// ---------- tema ----------
function temaEscuro() {
  const t = document.documentElement.dataset.theme;
  return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
}
function desenharBotaoTema() {
  $('#themeBtn').innerHTML = ic(temaEscuro() ? 'sun' : 'moon');
  $('#themeBtn').setAttribute('aria-label', temaEscuro() ? 'Usar tema claro' : 'Usar tema escuro');
}

// ---------- eventos da casca ----------
$('#themeBtn').addEventListener('click', () => {
  const novo = temaEscuro() ? 'light' : 'dark';
  document.documentElement.dataset.theme = novo;
  armazenamento.gravar('espectro:tema', novo);
  desenharBotaoTema();
});
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', desenharBotaoTema);
$('#menuBtn').addEventListener('click', () => $('#side').classList.toggle('open'));
$('#bellBtn').addEventListener('click', e => { e.stopPropagation(); estado.popAberto = !estado.popAberto; desenharPop(); });
document.addEventListener('click', e => {
  if (estado.popAberto && !e.target.closest('.pop')) { estado.popAberto = false; desenharPop(); }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && estado.popAberto) { estado.popAberto = false; desenharPop(); $('#bellBtn').focus(); }
});
$('#logoutBtn').addEventListener('click', async () => {
  try { await api.post('/api/logout'); } finally { location.href = '/login.html'; }
});
window.addEventListener('hashchange', navegar);

// ---------- início ----------
(async function iniciar() {
  try {
    estado.user = await api.get('/api/me');
  } catch { return; } // api.js redireciona para o login
  $('#userName').textContent = estado.user.nome;
  $('#userRole').textContent = estado.user.perfil;
  $('#avatar').textContent = iniciais(estado.user.nome);
  desenharBotaoTema();
  try { estado.config = await api.get('/api/config'); } catch { estado.config = {}; }
  await atualizarAgenda();
  await navegar();
  avisoDeEntrada();
  setInterval(atualizarAgenda, 5 * 60 * 1000);
})();
