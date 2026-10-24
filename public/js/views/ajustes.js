// Ajustes: dados da empresa nos documentos, antecedência dos alertas, minha senha e backup.
import { api } from '../api.js';
import { ic } from '../util.js';
import { campo, toast, erro } from '../ui.js';

/** Reduz o logo para no máximo 800×300 px e devolve como data URL (PNG, ou WEBP se o PNG ficar grande). */
function reduzirImagem(arquivo) {
  return new Promise((ok, falha) => {
    if (!/^image\/(png|jpeg|webp)$/.test(arquivo.type)) return falha(new Error('Use uma imagem PNG, JPG ou WEBP.'));
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const k = Math.min(1, 800 / img.width, 300 / img.height);
      const cv = document.createElement('canvas');
      cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      let dados = cv.toDataURL('image/png');
      if (dados.length > 680_000) dados = cv.toDataURL('image/webp', 0.9);
      if (dados.length > 680_000) return falha(new Error('Imagem grande demais. Use um logo mais simples.'));
      ok(dados);
    };
    img.onerror = () => { URL.revokeObjectURL(url); falha(new Error('Não foi possível ler a imagem.')); };
    img.src = url;
  });
}

export default async function ajustes(ctx) {
  const c = await api.get('api/config');
  const admin = ctx.user.perfil === 'Administrador';
  const dis = admin ? '' : 'disabled';
  return {
    titulo: 'Ajustes',
    html: `
    <section class="card"><div class="card-h"><h2>Empresa e documentos</h2><span class="sub">aparece no cabeçalho do relatório técnico e do orçamento</span></div>
      <form class="card-b grid g3" id="fCfg" novalidate>
        ${campo('empresa', 'Nome da empresa *', c.empresa, `required maxlength="160" ${dis}`, 'span2')}
        ${campo('cnpj', 'CNPJ', c.cnpj, `maxlength="20" ${dis}`)}
        ${campo('endereco', 'Endereço (com CEP)', c.endereco, `maxlength="300" ${dis}`, 'spanall')}
        ${campo('contato', 'Contato (telefone · e-mail)', c.contato, `maxlength="200" ${dis}`, 'span2')}
        ${campo('alerta_dias_antes', 'Avisar com antecedência de (dias)', c.alerta_dias_antes, `type="number" min="0" max="60" ${dis}`)}
        <div class="field spanall"><span class="lbl">Logo nos documentos</span>
          <div style="display:flex;flex-wrap:wrap;align-items:center;gap:12px">
            <img id="logoPrev" alt="Logo atual" style="max-height:56px;max-width:240px;background:#fff;padding:4px;border-radius:4px"${c.logo ? ` src="${c.logo}"` : ' hidden'}>
            ${admin ? `<label class="btn sm">${ic('file')}Escolher imagem<input type="file" id="logoArq" accept="image/png,image/jpeg,image/webp" hidden></label>
              <button class="btn sm ghost danger" type="button" id="logoRem"${c.logo ? '' : ' hidden'}>${ic('trash')}Remover</button>` : ''}
            <span class="hint">PNG, JPG ou WEBP. Clique em “Salvar ajustes” depois de escolher.</span>
          </div></div>
        ${admin ? `<div class="spanall"><button class="btn pri" type="submit">${ic('check')}Salvar ajustes</button></div>` : '<p class="hint spanall">Somente administradores alteram estes dados.</p>'}
      </form></section>

    <section class="card"><div class="card-h"><h2>Minha senha</h2></div>
      <form class="card-b grid g3" id="fSenha" novalidate>
        ${campo('atual', 'Senha atual', '', 'type="password" autocomplete="current-password" required')}
        ${campo('nova', 'Nova senha (mín. 8 caracteres)', '', 'type="password" autocomplete="new-password" minlength="8" required')}
        <div class="field" style="justify-content:flex-end"><button class="btn" type="submit">${ic('lock')}Trocar senha</button></div>
      </form></section>

    ${admin ? `<section class="card"><div class="card-h"><h2>Backup do banco de dados</h2></div>
      <div class="card-b" style="display:flex;flex-wrap:wrap;gap:16px;align-items:center">
        <p class="hint" style="flex:1;min-width:240px">Baixa todas as coleções do MongoDB em um arquivo JSON (formato estendido). Guarde em local seguro: o arquivo contém dados de clientes e os hashes das senhas.</p>
        <a class="btn" href="api/backup" download>${ic('download')}Baixar backup</a>
      </div></section>` : ''}`,
    montar(root) {
      let logo = c.logo || null;
      const mostrarLogo = () => {
        const img = root.querySelector('#logoPrev');
        img.hidden = !logo;
        if (logo) img.src = logo; else img.removeAttribute('src');
        const rem = root.querySelector('#logoRem');
        if (rem) rem.hidden = !logo;
      };
      const escolherLogo = async e => {
        if (e.target.id !== 'logoArq' || !e.target.files[0]) return;
        try { logo = await reduzirImagem(e.target.files[0]); mostrarLogo(); } catch (err) { erro(err); }
        e.target.value = '';
      };
      const removerLogo = e => { if (e.target.closest('#logoRem')) { logo = null; mostrarLogo(); } };
      const enviar = async e => {
        e.preventDefault();
        const f = e.target, dados = Object.fromEntries(new FormData(f));
        const btn = f.querySelector('[type=submit]');
        btn?.classList.add('busy');
        try {
          if (f.id === 'fCfg') { dados.logo = logo; await api.put('api/config', dados); Object.assign(ctx.config, dados); toast('Ajustes salvos.'); }
          if (f.id === 'fSenha') {
            if ((dados.nova || '').length < 8) throw new Error('A nova senha precisa ter ao menos 8 caracteres.');
            await api.put('api/me/senha', dados); f.reset(); toast('Senha alterada.');
          }
        } catch (err) { erro(err); } finally { btn?.classList.remove('busy'); }
      };
      root.addEventListener('submit', enviar);
      root.addEventListener('change', escolherLogo);
      root.addEventListener('click', removerLogo);
      return () => { root.removeEventListener('submit', enviar); root.removeEventListener('change', escolherLogo); root.removeEventListener('click', removerLogo); };
    },
  };
}