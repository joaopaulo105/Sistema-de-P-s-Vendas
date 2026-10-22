// Dados iniciais: administrador, tipos padrão e (opcional) dados de exemplo.
// Roda sozinho na primeira inicialização. Também pode ser chamado com `npm run seed`.
import { fileURLToPath } from 'node:url';
import { col, conectar, client, salvarConfig, somarDias, normalizar, proximoNumero, numDoc } from './db.js';
import { hashSenha } from './auth.js';

const TIPOS = [
  { nome: 'Hematologia', sigla: 'HEM' }, { nome: 'Bioquímica', sigla: 'BIO' },
  { nome: 'Eletrólitos', sigla: 'ISE' }, { nome: 'Coagulação', sigla: 'COA' },
];

export async function semear({ exemplos = process.env.SEED_EXEMPLOS !== 'nao' } = {}) {
  const primeiraVez = (await col.usuarios.countDocuments()) === 0;

  if (primeiraVez) {
    const email = normalizar(process.env.ADMIN_EMAIL || 'admin@posvendas.local');
    const senha = process.env.ADMIN_SENHA || 'trocar-esta-senha';
    await col.usuarios.insertOne({ nome: 'Administrador', email, telefone: null, perfil: 'Administrador', ativo: true, senha_hash: hashSenha(senha), criado_em: new Date() });
    console.log('\n  Primeiro acesso criado:');
    console.log(`    e-mail: ${email}`);
    console.log(`    senha:  ${process.env.ADMIN_SENHA ? '(a definida em ADMIN_SENHA)' : senha}`);
    console.log('  Troque a senha em Ajustes logo após entrar.\n');
  }

  if ((await col.tipos.countDocuments()) === 0)
    await col.tipos.insertMany(TIPOS.map((t, i) => ({ ...t, nome_norm: normalizar(t.nome), cor: i })));

  if (primeiraVez && exemplos && (await col.clientes.countDocuments()) === 0) {
    await dadosExemplo();
    await salvarConfig({ exemplos: true });
    console.log('  Dados de exemplo carregados (podem ser removidos no painel).\n');
  }
}

async function dadosExemplo() {
  const tipo = Object.fromEntries((await col.tipos.find().toArray()).map(t => [t.sigla, t._id]));
  const ins = async (c, docs) => Object.values((await col[c].insertMany(docs)).insertedIds);

  const [t1, t2] = await ins('usuarios', [
    { nome: 'Rafael Monteiro', email: 'rafael.monteiro@exemplo.com.br', telefone: '(11) 98812-4410', perfil: 'Técnico', ativo: true, senha_hash: hashSenha('tecnico-exemplo'), exemplo: true, criado_em: new Date() },
    { nome: 'Camila Duarte', email: 'camila.duarte@exemplo.com.br', telefone: '(11) 99630-1185', perfil: 'Técnico', ativo: true, senha_hash: hashSenha('tecnico-exemplo'), exemplo: true, criado_em: new Date() },
  ]);
  const [m1, m2, m3, m4, m5, m6] = await ins('equipamentos', [
    { nome: 'Analisador hematológico 5 partes', marca: 'Mindray', modelo: 'BC-6200', tipo_id: tipo.HEM },
    { nome: 'Analisador hematológico 3 partes', marca: 'Mindray', modelo: 'BC-30s', tipo_id: tipo.HEM },
    { nome: 'Analisador bioquímico automático', marca: 'Mindray', modelo: 'BS-240', tipo_id: tipo.BIO },
    { nome: 'Analisador bioquímico semiautomático', marca: 'Bioplus', modelo: 'Bio-2000', tipo_id: tipo.BIO },
    { nome: 'Analisador de eletrólitos', marca: 'Diestro', modelo: '103AP V4', tipo_id: tipo.ISE },
    { nome: 'Coagulômetro 4 canais', marca: 'Wama', modelo: 'Coag-4', tipo_id: tipo.COA },
  ]);
  const agora = new Date();
  const [c1, c2, c3, c4] = await ins('clientes', [
    { nome: 'Laboratório de Análises Clínicas Vale do Paraíba Ltda.', fantasia: 'LabVale (exemplo)', cnpj: '12.345.678/0001-90', endereco: 'Av. Independência, 1450', cidade: 'Taubaté', estado: 'SP', telefone: '(12) 3631-4400', email: 'tecnico@labvale.exemplo', criado_em: agora },
    { nome: 'Centro Diagnóstico São Lucas S.A.', fantasia: 'São Lucas (exemplo)', cnpj: '23.456.789/0001-01', endereco: 'R. XV de Novembro, 820', cidade: 'São José dos Campos', estado: 'SP', telefone: '(12) 3922-1180', email: 'compras@saolucas.exemplo', criado_em: agora },
    { nome: 'Hospital e Maternidade Santa Clara Ltda.', fantasia: 'Santa Clara (exemplo)', cnpj: '34.567.890/0001-12', endereco: 'Av. Brasil, 3300', cidade: 'Jacareí', estado: 'SP', telefone: '(12) 3951-7000', email: 'laboratorio@santaclara.exemplo', criado_em: agora },
    { nome: 'BioAnálise Laboratório Médico EIRELI', fantasia: 'BioAnálise (exemplo)', cnpj: '45.678.901/0001-23', endereco: 'R. Barão de Jaceguai, 512', cidade: 'Mogi das Cruzes', estado: 'SP', telefone: '(11) 4799-2210', email: 'contato@bioanalise.exemplo', criado_em: agora },
  ]);

  const unidades = [
    [c1, m1, 'BC6K-24A0917', 'Comodato', -410, [[-3, 'Preventiva semestral — troca de válvulas e calibração'], [177, 'Preventiva semestral']]],
    [c1, m3, 'BS240-E7/2291', 'Comodato', -300, [[4, 'Preventiva trimestral — lâmpada halógena e cubetas']]],
    [c2, m1, 'BC6K-23C1182', 'Locação', -520, [[11, 'Preventiva semestral']]],
    [c2, m5, 'DST103-V4#88721', 'Locação', -200, [[23, 'Troca de eletrodos Na/K/Cl']]],
    [c3, m6, 'CG4-0042-B', 'Venda', -150, [[-12, 'Verificação óptica dos canais'], [40, 'Preventiva semestral']]],
    [c3, m2, 'BC30S-21K0066', 'Venda', -800, [[58, 'Preventiva anual']]],
    [c4, m4, 'B2K/19-3374', 'Comodato', -260, [[2, 'Calibração de filtros 340/405/505 nm']]],
    [c4, m6, 'CG4-0118-A', 'Novo', -6, [[84, 'Primeira preventiva — 90 dias']]],
    [c2, m2, 'BC30S-18F0310', 'Sucata', -1900, []],
  ];
  const ids = [];
  for (const [cli, eq, serie, status, inst, mts] of unidades) {
    const { insertedId } = await col.parque.insertOne({ cliente_id: cli, equipamento_id: eq, serie, serie_norm: normalizar(serie), status, data_instalacao: somarDias(inst), criado_em: agora });
    ids.push(insertedId);
    await col.movimentacoes.insertOne({ parque_id: insertedId, data: somarDias(inst), tipo: 'cadastro', ocorrencia: `Equipamento instalado — ${status}`, ref_tipo: null, ref_id: null, usuario_id: null, criado_em: agora });
    if (mts.length) await col.manutencoes.insertMany(mts.map(([d, descricao]) => ({ parque_id: insertedId, data: somarDias(d), descricao, alerta_email: true, alerta_celular: true, realizada: false, realizada_em: null, criado_por: null })));
  }
  await col.movimentacoes.insertMany([
    { parque_id: ids[8], data: somarDias(-45), tipo: 'status', ocorrencia: 'Status alterado: Locação → Sucata (fim de vida útil)', ref_tipo: null, ref_id: null, usuario_id: null, criado_em: agora },
    { parque_id: ids[5], data: somarDias(-90), tipo: 'transferencia', ocorrencia: 'Transferência de propriedade: BioAnálise → Santa Clara', ref_tipo: null, ref_id: null, usuario_id: null, criado_em: agora },
  ]);

  const ano = new Date().getFullYear();
  const rt = { numero: await proximoNumero('RT', ano), ano, parque_id: ids[2], tecnico_id: t1, status: 'rascunho',
    procedimentos: 'Atendimento corretivo: equipamento apresentando erro de aspiração.\n- Limpeza da agulha de amostragem e do bloco de válvulas.\n- Substituição do tubo da bomba peristáltica.\n- Background e controle de qualidade nos níveis baixo/normal/alto: aprovados.',
    horas: 3.5, chegada: somarDias(-1) + 'T08:40', saida: somarDias(-1) + 'T12:10', conclusao: somarDias(-1), retorno: null, proxima_manutencao: null,
    responsavel: 'Dra. Marina Alves', valor_hora: 180, deslocamento: 120,
    itens: [{ codigo: 'TB-PER-01', descricao: 'Tubo da bomba peristáltica', quantidade: 1, valor_unitario: 145 }],
    assinatura: null, assinante_nome: null, assinante_doc: null, snapshot: null, finalizado_em: null, criado_por: t1, criado_em: agora, atualizado_em: agora };
  await col.relatorios.insertOne(rt);

  const orc = { numero: await proximoNumero('ORC', ano), ano, parque_id: ids[6], tecnico_id: t2, data: somarDias(-8), validade_dias: 15, situacao: 'Em aberto',
    horas: 2, valor_hora: 180, deslocamento: 150, obs: 'Prazo de entrega das peças: 7 dias úteis.', criado_por: t2, criado_em: agora,
    itens: [{ codigo: 'LMP-12V20', descricao: 'Lâmpada halógena 12V 20W', quantidade: 1, valor_unitario: 289.9 }, { codigo: 'FLT-340', descricao: 'Filtro de interferência 340 nm', quantidade: 1, valor_unitario: 1180 }] };
  const { insertedId: oId } = await col.orcamentos.insertOne(orc);
  await col.movimentacoes.insertOne({ parque_id: ids[6], data: orc.data, tipo: 'orcamento', ocorrencia: `Orçamento ${numDoc('ORC', orc)} emitido — R$ 1.979,90`, ref_tipo: 'orcamento', ref_id: oId, usuario_id: t2, criado_em: agora });
}

// Execução direta: `npm run seed`
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await conectar();
  await semear();
  await client.close();
  console.log('Pronto.');
}
