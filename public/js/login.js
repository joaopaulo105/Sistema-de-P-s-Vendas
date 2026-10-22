// Tela de entrada + animação do espectro no painel lateral.
import { api } from './api.js';
import { $ } from './util.js';

const form = $('#fLogin');
const caixaErro = $('#erro');

form.addEventListener('submit', async e => {
  e.preventDefault();
  caixaErro.hidden = true;
  const dados = Object.fromEntries(new FormData(form));
  if (!dados.email || !dados.senha) { caixaErro.textContent = 'Informe e-mail e senha.'; caixaErro.hidden = false; return; }
  const btn = $('#entrar');
  btn.classList.add('busy'); btn.textContent = 'Entrando…';
  try {
    await api.post('/api/login', dados);
    const voltar = new URLSearchParams(location.search).get('voltar') || '';
    location.href = '/' + (voltar.startsWith('#/') ? voltar : '');
  } catch (err) {
    caixaErro.textContent = err.message;
    caixaErro.hidden = false;
    $('#senha').select();
  } finally {
    btn.classList.remove('busy'); btn.textContent = 'Entrar';
  }
});

// já logado? vai direto para o sistema
fetch('/api/me', { credentials: 'same-origin' }).then(r => { if (r.ok) location.href = '/'; }).catch(() => {});

// ---- espectro animado (curvas de absorbância nas cores dos tipos) ----
const c = $('#espectro');
const g = c.getContext('2d');
const cores = ['#B28DFF', '#5BA7FF', '#38D9C6', '#F5BE45', '#FF8A4C', '#FF5D72'];
const reduzir = matchMedia('(prefers-reduced-motion: reduce)').matches;
function ajustar() {
  const r = c.getBoundingClientRect(), dpr = devicePixelRatio || 1;
  c.width = r.width * dpr; c.height = r.height * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0);
}
function quadro(t) {
  const w = c.clientWidth, h = c.clientHeight;
  g.clearRect(0, 0, w, h);
  // grade milimetrada
  g.strokeStyle = 'rgba(140,157,255,.07)'; g.lineWidth = 1;
  for (let x = 0; x < w; x += 24) { g.beginPath(); g.moveTo(x + .5, 0); g.lineTo(x + .5, h); g.stroke(); }
  for (let y = 0; y < h; y += 24) { g.beginPath(); g.moveTo(0, y + .5); g.lineTo(w, y + .5); g.stroke(); }
  // picos gaussianos que respiram devagar
  cores.forEach((cor, i) => {
    const centro = w * (0.12 + i * 0.155), largura = w * 0.07, altura = h * (0.22 + 0.1 * Math.sin(t / 2400 + i * 1.3));
    g.beginPath();
    for (let x = 0; x <= w; x += 4) {
      const y = h * 0.82 - altura * Math.exp(-((x - centro) ** 2) / (2 * largura ** 2));
      x === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
    }
    g.strokeStyle = cor; g.globalAlpha = .55; g.lineWidth = 1.6; g.stroke();
    g.lineTo(w, h); g.lineTo(0, h); g.closePath();
    g.globalAlpha = .06; g.fillStyle = cor; g.fill();
    g.globalAlpha = 1;
  });
  if (!reduzir) requestAnimationFrame(quadro);
}
ajustar();
addEventListener('resize', ajustar);
requestAnimationFrame(quadro);
