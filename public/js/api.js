// Cliente da API REST do servidor.

export class ErroApi extends Error {
  constructor(status, mensagem, campos) { super(mensagem); this.status = status; this.campos = campos || []; }
}

async function chamar(metodo, url, corpo) {
  let r;
  try {
    r = await fetch(url, {
      method: metodo,
      credentials: 'same-origin',
      headers: corpo !== undefined ? { 'Content-Type': 'application/json' } : {},
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
    });
  } catch {
    throw new ErroApi(0, 'Sem conexão com o servidor. Verifique se ele está rodando.');
  }
  const dados = await r.json().catch(() => ({}));
  if (r.status === 401 && !url.endsWith('/login')) {
    location.href = '/login.html?voltar=' + encodeURIComponent(location.hash || '');
    throw new ErroApi(401, dados.erro || 'Sessão expirada.');
  }
  if (!r.ok) throw new ErroApi(r.status, dados.erro || `Erro ${r.status}`, dados.campos);
  return dados;
}

export const api = {
  get: url => chamar('GET', url),
  post: (url, corpo = {}) => chamar('POST', url, corpo),
  put: (url, corpo = {}) => chamar('PUT', url, corpo),
  del: url => chamar('DELETE', url),
};

/** Monta uma query string ignorando valores vazios. */
export const qs = obj => {
  const p = new URLSearchParams(Object.entries(obj).filter(([, v]) => v !== '' && v != null));
  const s = p.toString();
  return s ? '?' + s : '';
};
