// Serviço intermediário do Contraprova (Cloudflare Workers).
// Guarda a chave da API da Anthropic e só aceita um tipo de pedido: comparar uma frase com fichas já verificadas.
// A chave NÃO fica neste arquivo. Cadastre-a no painel do Cloudflare como segredo ANTHROPIC_API_KEY.

// 1) Endereços autorizados a usar o serviço (sem barra no final).
const ORIGENS_PERMITIDAS = ['https://jamesgorgen.github.io'];

// 2) Modelo pequeno e barato, suficiente para comparar a frase com as fichas.
const MODELO = 'claude-haiku-5-5';

// 3) Limites de proteção.
const MAX_FRASE = 400;           // caracteres da frase digitada
const MAX_FICHAS = 6;            // fichas enviadas por consulta
const MAX_FICHA = 1600;          // caracteres por ficha
const MAX_TOKENS_RESPOSTA = 450;
const PEDIDOS_POR_MINUTO = 6;    // por visitante (controle aproximado)
const CACHE_MAX = 3000;          // respostas guardadas na memória do serviço

const visitas = new Map();
const cache = new Map();

const INSTRUCOES = `Você é um verificador de fatos de um debate eleitoral brasileiro.
Recebe uma FRASE dita ou ouvida no debate e algumas FICHAS já verificadas, com dados oficiais e checagens de agências.
Regras:
- Use apenas as informações das FICHAS. Não use conhecimento próprio nem invente números.
- Se nenhuma ficha trata do assunto da frase, responda com veredito "SEM_BASE".
- Seja neutro e preciso, sem adjetivos e sem opinião. Em 2 a 4 frases curtas, diga o que os dados mostram.
- Vereditos possíveis: VERDADEIRO, FALSO, ENGANOSO, EXAGERADO, SUBESTIMADO, FALTA_CONTEXTO, INSUSTENTAVEL, SEM_BASE.
Responda SOMENTE com JSON válido, neste formato:
{"veredito":"...","explicacao":"...","fichas":["id1","id2"]}`;

function cors(origem) {
  return {
    'Access-Control-Allow-Origin': origem,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Vary': 'Origin',
  };
}
function resposta(obj, status, origem) {
  return new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...cors(origem) } });
}
function normalizar(t) {
  return String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

export default {
  async fetch(request, env) {
    const origem = request.headers.get('Origin') || '';
    if (!ORIGENS_PERMITIDAS.includes(origem)) return new Response('Origem não permitida', { status: 403 });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origem) });
    if (request.method !== 'POST') return resposta({ error: 'metodo' }, 405, origem);
    if (!env.ANTHROPIC_API_KEY) return resposta({ error: 'sem_chave' }, 500, origem);

    let corpo;
    try { corpo = await request.json(); } catch (e) { return resposta({ error: 'pedido_invalido' }, 400, origem); }
    const frase = typeof corpo.frase === 'string' ? corpo.frase.trim() : '';
    const fichas = Array.isArray(corpo.fichas) ? corpo.fichas.slice(0, MAX_FICHAS) : [];
    if (!frase || frase.length > MAX_FRASE || fichas.length === 0) return resposta({ error: 'pedido_invalido' }, 400, origem);

    // Resposta já pronta para a mesma frase e as mesmas fichas: devolve sem gastar IA.
    const chave = normalizar(frase) + '|' + fichas.map(f => String(f.id || '')).join(',');
    if (cache.has(chave)) return resposta({ ...cache.get(chave), cache: true }, 200, origem);

    const ip = request.headers.get('CF-Connecting-IP') || 'desconhecido';
    const agora = Date.now();
    const recentes = (visitas.get(ip) || []).filter(t => agora - t < 60000);
    if (recentes.length >= PEDIDOS_POR_MINUTO) return resposta({ error: 'limite' }, 429, origem);
    recentes.push(agora); visitas.set(ip, recentes);
    if (visitas.size > 5000) visitas.clear();

    const textoFichas = fichas.map(f => {
      const t = `[${String(f.id || '').slice(0, 40)}] ${String(f.texto || '')}`;
      return t.slice(0, MAX_FICHA);
    }).join('\n\n');

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: MAX_TOKENS_RESPOSTA,
        system: INSTRUCOES,
        messages: [{ role: 'user', content: `FRASE: "${frase}"\n\nFICHAS:\n${textoFichas}` }],
      }),
    });
    if (!r.ok) {
      const codigo = r.status === 429 ? 'limite' : (r.status === 401 || r.status === 403) ? 'chave_recusada' : 'falha_api';
      return resposta({ error: codigo, status: r.status }, 502, origem);
    }
    const dados = await r.json();
    const texto = (dados.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
    let saida;
    try {
      const inicio = texto.indexOf('{'), fim = texto.lastIndexOf('}');
      saida = JSON.parse(texto.slice(inicio, fim + 1));
    } catch (e) {
      return resposta({ error: 'resposta_invalida' }, 502, origem);
    }
    const limpa = {
      veredito: String(saida.veredito || 'SEM_BASE').toUpperCase(),
      explicacao: String(saida.explicacao || '').slice(0, 900),
      fichas: Array.isArray(saida.fichas) ? saida.fichas.map(String).slice(0, MAX_FICHAS) : [],
    };
    if (cache.size > CACHE_MAX) cache.clear();
    cache.set(chave, limpa);
    return resposta(limpa, 200, origem);
  },
};
