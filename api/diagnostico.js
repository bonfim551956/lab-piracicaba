// ============================================================================
// api/diagnostico.js  — versão 2
// Além de listar as variáveis, TESTA de verdade a conexão com o Supabase e
// com o Z-API, e diz qual das duas está com problema.
// Nunca mostra o valor das credenciais.
//
// Abra:  https://saovicente.oticasidealize.online/api/diagnostico
// APAGUE ESTE ARQUIVO quando o WhatsApp estiver funcionando.
// ============================================================================

const ESPERADAS = [
  'ZAPI_INSTANCE', 'ZAPI_TOKEN', 'ZAPI_CLIENT_TOKEN',
  'SB_URL', 'SB_SERVICE_KEY', 'LOJA_UNIDADE', 'LOJA_NOME', 'ORIGENS',
];

async function testarSupabase() {
  const { SB_URL, SB_SERVICE_KEY, LOJA_UNIDADE } = process.env;
  if (!SB_URL || !SB_SERVICE_KEY) return { ok: false, erro: 'SB_URL ou SB_SERVICE_KEY ausente.' };

  const url = String(SB_URL).trim().replace(/\/+$/, '');
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)) {
    return { ok: false, erro: 'SB_URL fora do formato esperado: "' + url + '". '
      + 'Deve ser https://xxmrdadnchxdsfinvzsp.supabase.co (sem barra no fim, sem /rest/v1).' };
  }

  const chave = String(SB_SERVICE_KEY).trim();
  const partes = chave.split('.').length;
  if (partes !== 3) {
    return { ok: false, erro: 'SB_SERVICE_KEY nao parece uma chave valida (' + partes
      + ' partes, esperado 3). Copie a service_role em Supabase > Settings > API.' };
  }

  try {
    const un = (LOJA_UNIDADE || 'saovicente').trim();
    const r = await fetch(url + '/rest/v1/os_cards?unidade=eq.' + encodeURIComponent(un) + '&select=id&limit=1',
      { headers: { apikey: chave, Authorization: 'Bearer ' + chave } });
    const corpo = await r.text();
    if (!r.ok) {
      return { ok: false, erro: 'Supabase respondeu ' + r.status, detalhe: corpo.slice(0, 300),
        dica: r.status === 401 ? 'Chave errada — confira se copiou a service_role, nao a anon.'
            : r.status === 404 ? 'Tabela os_cards nao encontrada nesse projeto.'
            : 'Confira a URL do projeto.' };
    }
    const linhas = JSON.parse(corpo || '[]');
    return { ok: true, unidade_testada: un, encontrou_os: linhas.length > 0,
      aviso: linhas.length ? null
        : 'Nenhuma OS com unidade "' + un + '". Confira LOJA_UNIDADE (deve ser saovicente, minusculo).' };
  } catch (e) {
    return { ok: false, erro: 'Nao consegui falar com o Supabase.', detalhe: String(e.message || e) };
  }
}

async function testarZapi() {
  const { ZAPI_INSTANCE, ZAPI_TOKEN, ZAPI_CLIENT_TOKEN } = process.env;
  if (!ZAPI_INSTANCE || !ZAPI_TOKEN) return { ok: false, erro: 'ZAPI_INSTANCE ou ZAPI_TOKEN ausente.' };
  try {
    const r = await fetch(
      'https://api.z-api.io/instances/' + String(ZAPI_INSTANCE).trim()
      + '/token/' + String(ZAPI_TOKEN).trim() + '/status',
      { headers: ZAPI_CLIENT_TOKEN ? { 'Client-Token': String(ZAPI_CLIENT_TOKEN).trim() } : {} }
    );
    const corpo = await r.text();
    let dados = {};
    try { dados = JSON.parse(corpo); } catch (_) { /* resposta nao-JSON */ }
    if (!r.ok) {
      return { ok: false, erro: 'Z-API respondeu ' + r.status, detalhe: corpo.slice(0, 300),
        dica: (r.status === 401 || r.status === 403)
          ? 'Instancia, token ou Client-Token errados.'
          : 'Confira os dados da instancia no painel do Z-API.' };
    }
    return {
      ok: dados.connected === true,
      celular_conectado: dados.connected === true,
      resposta: dados,
      dica: dados.connected === true ? null
        : 'A instancia existe, mas o celular nao esta conectado. Leia o QR Code no painel do Z-API.',
    };
  } catch (e) {
    return { ok: false, erro: 'Nao consegui falar com o Z-API.', detalhe: String(e.message || e) };
  }
}

module.exports = async (req, res) => {
  const variaveis = {};
  for (const nome of ESPERADAS) {
    const v = process.env[nome];
    if (!v) variaveis[nome] = 'FALTANDO';
    else if (v !== v.trim()) variaveis[nome] = 'PRESENTE (' + v.length + ') — ATENCAO: espaco sobrando';
    else variaveis[nome] = 'ok (' + v.length + ')';
  }

  const [supabase, zapi] = await Promise.all([testarSupabase(), testarZapi()]);

  let veredito;
  if (!supabase.ok && !zapi.ok) veredito = 'Supabase E Z-API com problema. Comece pelo Supabase.';
  else if (!supabase.ok) veredito = 'Problema no SUPABASE. Veja o bloco "supabase" acima.';
  else if (!zapi.ok) veredito = 'Problema no Z-API. Veja o bloco "zapi" acima.';
  else veredito = 'Tudo certo. Pode testar o envio pelo botao verde.';

  res.status(200).json({
    projeto: {
      repositorio: process.env.VERCEL_GIT_REPO_SLUG || '(desconhecido)',
      branch: process.env.VERCEL_GIT_COMMIT_REF || '(desconhecido)',
      commit: (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7) || '(desconhecido)',
      ambiente: process.env.VERCEL_ENV || '(fora da Vercel)',
      url_deploy: process.env.VERCEL_URL || '(desconhecida)',
    },
    dominio_chamado: req.headers.host || '(desconhecido)',
    variaveis, supabase, zapi, veredito,
  });
};
