// Alertas de manutenção por e-mail (SMTP) e celular (webhook de SMS/WhatsApp).
//
// Regras de disparo para cada manutenção pendente e cada técnico/administrador ativo:
//   · "antecipado"  — quando entra na janela de N dias antes (Ajustes → dias de antecedência)
//   · "no-dia"      — no dia programado
//   · "atraso-S"    — uma vez por semana enquanto estiver atrasada
// O índice único (manutenção, canal, destino, marco) garante que nada é enviado em dobro.
import { col, oid, lerConfig, fmtData } from './db.js';
import { pendencias } from './rotas/parque.js';

const INTERVALO = 60 * 60 * 1000; // a cada hora
const MAX_TENTATIVAS = 5;

const smtpConfigurado = () => !!process.env.SMTP_HOST;
const celularConfigurado = () => !!process.env.ALERTA_WEBHOOK_URL;

let transporte = null;
async function enviarEmail(para, assunto, texto) {
  if (!transporte) {
    const { default: nodemailer } = await import('nodemailer');
    transporte = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
  }
  await transporte.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to: para, subject: assunto, text: texto });
}

async function enviarCelular(telefone, texto) {
  const r = await fetch(process.env.ALERTA_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(process.env.ALERTA_WEBHOOK_TOKEN ? { Authorization: `Bearer ${process.env.ALERTA_WEBHOOK_TOKEN}` } : {}) },
    body: JSON.stringify({ telefone: telefone.replace(/\D/g, ''), mensagem: texto }),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`Webhook respondeu ${r.status}`);
}

function marcoDe(dias) {
  if (dias > 0) return 'antecipado';
  if (dias === 0) return 'no-dia';
  return `atraso-${Math.floor(-dias / 7)}`;
}

function mensagem(p) {
  const u = p.unidade;
  const quando = p.dias < 0 ? `ATRASADA há ${-p.dias} dia(s)` : p.dias === 0 ? 'HOJE' : `em ${p.dias} dia(s)`;
  return `Manutenção ${quando} — ${fmtData(p.data)}\n${p.descricao}\nEquipamento: ${u.equipamento} (${u.marca} ${u.modelo}) · Série ${u.serie}\nCliente: ${u.fantasia} — ${u.cliente_nome}\nTelefone do cliente: ${u.telefone || '—'}`;
}

/** Gera a fila de alertas do momento e tenta enviar o que estiver pendente. */
export async function executarAlertas() {
  const cfg = await lerConfig();
  const dias = Math.max(0, Number(cfg.alerta_dias_antes) || 7);
  const [lista, destinatarios] = await Promise.all([
    pendencias({ ateDias: dias }),
    col.usuarios.find({ ativo: true, perfil: { $in: ['Administrador', 'Técnico'] } }, { projection: { nome: 1, email: 1, telefone: 1 } }).toArray(),
  ]);

  // 1) enfileira (sem duplicar)
  const novos = [];
  for (const p of lista) {
    const marco = marcoDe(p.dias), texto = mensagem(p);
    for (const d of destinatarios) {
      if (p.alerta_email && d.email) novos.push({ manutencao_id: oid(p.id), canal: 'email', destino: d.email, destinatario: d.nome, marco, mensagem: texto, assunto: `[Pós-vendas] ${p.unidade.fantasia} · ${p.unidade.equipamento} · ${fmtData(p.data)}` });
      if (p.alerta_celular && d.telefone) novos.push({ manutencao_id: oid(p.id), canal: 'celular', destino: d.telefone, destinatario: d.nome, marco, mensagem: texto });
    }
  }
  if (novos.length) {
    await col.alertas.bulkWrite(novos.map(a => ({
      updateOne: {
        filter: { manutencao_id: a.manutencao_id, canal: a.canal, destino: a.destino, marco: a.marco },
        update: { $setOnInsert: { ...a, status: 'pendente', tentativas: 0, erro: null, criado_em: new Date(), enviado_em: null } },
        upsert: true,
      },
    })), { ordered: false });
  }

  // 2) envia pendentes
  const fila = await col.alertas.find({ status: { $in: ['pendente', 'erro', 'sem-configuracao'] }, tentativas: { $lt: MAX_TENTATIVAS }, criado_em: { $gt: new Date(Date.now() - 30 * 864e5) } }).limit(200).toArray();
  let enviados = 0, falhas = 0, semConfig = 0;
  for (const a of fila) {
    const configurado = a.canal === 'email' ? smtpConfigurado() : celularConfigurado();
    if (!configurado) {
      if (a.status !== 'sem-configuracao') await col.alertas.updateOne({ _id: a._id }, { $set: { status: 'sem-configuracao', erro: a.canal === 'email' ? 'Configure SMTP_HOST no arquivo .env' : 'Configure ALERTA_WEBHOOK_URL no arquivo .env' } });
      semConfig++;
      continue;
    }
    try {
      if (a.canal === 'email') await enviarEmail(a.destino, a.assunto || 'Alerta de manutenção', a.mensagem);
      else await enviarCelular(a.destino, a.mensagem);
      await col.alertas.updateOne({ _id: a._id }, { $set: { status: 'enviado', enviado_em: new Date(), erro: null }, $inc: { tentativas: 1 } });
      enviados++;
    } catch (e) {
      await col.alertas.updateOne({ _id: a._id }, { $set: { status: 'erro', erro: String(e.message || e).slice(0, 300) }, $inc: { tentativas: 1 } });
      falhas++;
    }
  }
  return { avaliadas: lista.length, enfileirados: novos.length, enviados, falhas, sem_configuracao: semConfig };
}

export function canaisConfigurados() {
  return { email: smtpConfigurado(), celular: celularConfigurado() };
}

export function iniciarAgendador() {
  const tick = () => executarAlertas()
    .then(r => { if (r.enviados || r.falhas) console.log(`[alertas] ${new Date().toLocaleString('pt-BR')} enviados=${r.enviados} falhas=${r.falhas}`); })
    .catch(e => console.error('[alertas] erro:', e.message));
  setTimeout(tick, 10_000);
  setInterval(tick, INTERVALO).unref();
}

