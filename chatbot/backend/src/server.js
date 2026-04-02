require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Groq = require('groq-sdk');
const {
    getBotStatus,
    toggleBotEnabled,
} = require('./store');

const { listDemands, updateDemandStatus } = require('./db/repositories/demands.repository');

const { searchClientsByName, loadCsv, getDefaultCsvPath, aggregateByName, formatCurrencyBR } = require('./nameSearch');
const { startBot } = require('./bot');

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL_PREFERENCE = (process.env.GROQ_MODEL || 'openai/gpt-oss-120b').trim();

const groq = new Groq({ apiKey: GROQ_API_KEY });

const app = express();
const PORT = 3001;

const { createTables } = require('./db/schema');
createTables();

let csvRows = [];
let csvLoaded = false;
let csvLoadError = null;

const CSV_FILE_PATH = process.env.CSV_PATH || getDefaultCsvPath();

app.use(cors());
app.use(express.json());



loadCsv(CSV_FILE_PATH)
    .then((rows) => {
        csvRows = rows;
        csvLoaded = true;
        console.log(`CSV carregado com ${rows.length} linhas de ${CSV_FILE_PATH}`);
    })
    .catch((error) => {
        csvLoadError = error;
        console.error(`Falha ao carregar CSV em ${CSV_FILE_PATH}:`, error);
    });

app.get('/api/health', (req, res) => {
    res.json({ ok: true, message: 'Backend funcionando' });
});

app.get('/api/search-client', (req, res) => {
    const query = String(req.query.q || req.query.query || '').trim();

    if (!query) {
        return res.status(400).json({ error: 'query (q) é obrigatório' });
    }

    if (!csvLoaded) {
        if (csvLoadError) {
            return res.status(500).json({ error: 'Erro ao carregar dados CSV', details: csvLoadError.message });
        }

        return res.status(503).json({ error: 'CSV ainda não carregado, tente novamente em alguns segundos' });
    }

    console.log('search-client route entered', { query });
    const rawResults = searchClientsByName(query, csvRows, 'Nome', 1000, true);
    console.log('search-client', { query, rawResultsCount: rawResults.length });
    const aggregated = aggregateByName(rawResults, 'Nome', 'Total');

    const max = Number.isInteger(parseInt(req.query.limit, 10)) ? parseInt(req.query.limit, 10) : 10;
    const paged = aggregated.slice(0, max);

    if (paged.length === 0) {
        return res.json({
            query,
            matchedRows: 0,
            count: 0,
            requireAllTokens: true,
            results: [],
            duplicatas: [],
        });
    }

    const selectedClientName = paged[0].name;
    const selectedDuplicatas = rawResults
        .filter((item) => {
            const rowName = String(item.row.Nome || item.row.NomeLoja || '').trim().toUpperCase();
            return rowName === String(selectedClientName || '').trim().toUpperCase();
        })
        .map((item) => ({
            nome: String(item.row.Nome || item.row.NomeLoja || '').trim(),
            duplic: String(item.row.Duplic || '').trim(),
            vencto: String(item.row.Vencto || '').trim(),
            total: String(item.row.Total || '').trim(),
        }));

    res.json({
        query,
        matchedRows: rawResults.length,
        count: selectedDuplicatas.length,
        requireAllTokens: true,
        selectedClient: selectedClientName,
        duplicatas: selectedDuplicatas,
    });
});

app.post('/api/ai-response', async (req, res) => {
    const query = String(req.body.q || req.body.query || '').trim();
    const userRequest = String(req.body.request || req.body.userRequest || '').trim();

    if (!query) {
        return res.status(400).json({ error: 'query (q) é obrigatório' });
    }

    if (!csvLoaded) {
        if (csvLoadError) {
            return res.status(500).json({
                error: 'Erro ao carregar dados CSV',
                details: csvLoadError.message,
            });
        }
        return res.status(503).json({ error: 'CSV ainda não carregado' });
    }

    const rawResults = searchClientsByName(query, csvRows, 'Nome', 1000, true);

    if (!rawResults.length) {
        return res.status(404).json({ error: 'Cliente não encontrado' });
    }

    const aggregated = aggregateByName(rawResults, 'Nome', 'Total');

    if (!aggregated.length) {
        return res.status(404).json({ error: 'Nenhum cliente agregado encontrado' });
    }

    const selected = aggregated[0];
    const selectedClientName = String(selected.name || '').trim().toUpperCase();

    const duplicatas = rawResults
        .filter((item) => {
            const nome = String(item.row.Nome || item.row.NomeLoja || '')
                .trim()
                .toUpperCase();

            return nome === selectedClientName;
        })
        .map((item) => ({
            nome: String(item.row.Nome || item.row.NomeLoja || '').trim(),
            duplic: String(item.row.Duplic || '').trim(),
            vencto: String(item.row.Vencto || '').trim(),
            total: String(item.row.Total || '').trim(),
        }));

    if (!process.env.GROQ_API_KEY) {
        return res.status(500).json({
            error: 'GROQ_API_KEY não configurada',
        });
    }

    const systemPrompt = `
    Você é um assistente de consulta de dados financeiros de clientes.

    Regras:
    - Responda apenas o que foi perguntado.
    - Não cumprimente.
    - Não se apresente.
    - Não finalize com frases de cortesia.
    - Não invente informações.
    - Use formato brasileiro para moeda (R$) e datas (DD/MM/AAAA).
    - Seja o mais curto e objetivo possível.
    - Os usuários podem escrever informalmente, com erros de digitação ou gírias.
    `.trim();

    const totalClient = formatCurrencyBR(selected.total);
    const userPrompt = `
    Cliente: ${selected.name} | Total da soma de todas as duplicatas: ${totalClient}

    Duplicatas:
    ${duplicatas.map((d) => `- Duplicata ${d.duplic} | Vencimento ${d.vencto} | Total ${d.total}`).join('\n')}

    Pedido do usuário:
    ${userRequest || 'Faça a melhor resposta para o cliente.'}

    Importante:
    - O total geral já foi calculado no sistema.
    - Não recalcule os valores se a pergunta for sobre total.
    - Use o total geral informado acima.
    `.trim();

    try {
        const response = await groq.chat.completions.create({
            model: GROQ_MODEL_PREFERENCE || 'openai/gpt-oss-120b',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ],
            max_tokens: 1000,
            temperature: 0.2,
            reasoning_effort: 'medium',
        });

        const choice = response?.choices?.[0];
        const answer = String(choice?.message?.content || '').trim();

        // logs no backend (IMPORTANTE)
        console.log('--- GROQ DEBUG ---');
        console.log('finish_reason:', choice?.finish_reason);
        console.log('content length:', answer.length);
        console.log('usage:', response?.usage);
        console.log('model:', response?.model);
        console.log('------------------');

        if (!answer) {
            return res.status(502).json({
                error: 'Resposta vazia da IA',

                debug: {
                    finish_reason: choice?.finish_reason,
                    model: response?.model,
                    usage: response?.usage,

                    // ajuda MUITO pra saber se o prompt está gigante
                    prompt_chars: userPrompt.length,
                    system_prompt_chars: systemPrompt.length,

                    // preview (evita estourar payload)
                    prompt_preview: userPrompt.slice(0, 300),

                    // se existir reasoning (caso do seu erro atual)
                    has_reasoning: !!choice?.message?.reasoning,
                    reasoning_preview: choice?.message?.reasoning?.slice?.(0, 200),
                }
            });
        }

        return res.json({ answer });

    } catch (error) {
        console.error('AI request error:', error);

        return res.status(500).json({
            error: 'Falha na chamada ao Groq',
            details: error?.message || 'Erro desconhecido',
        });
    }
});

app.get('/api/bot-status', (req, res) => {
    res.json(getBotStatus());
});

app.post('/api/toggle-bot', (req, res) => {
    const enabled = toggleBotEnabled();
    res.json({ enabled, connected: getBotStatus().botConnected, message: enabled ? 'Bot ativado' : 'Bot desativado' });
});

app.get('/api/demands', (req, res) => {
  const { search, type, status, sortBy, order } = req.query;

  const demands = listDemands({
    search,
    type,
    status,
    sortBy,
    order,
  });

  res.json(demands);
});

app.patch('/api/demands/:id/status', (req, res) => {
  const demandId = Number(req.params.id);
  const { status } = req.body;

  if (!['pending', 'in_progress', 'done'].includes(status)) {
    return res.status(400).json({ error: 'Status inválido' });
  }

  const updated = updateDemandStatus(demandId, status);

  if (!updated) {
    return res.status(404).json({ error: 'Demanda não encontrada' });
  }

  res.json(updated);
});

app.listen(PORT, async () => {
    console.log(`Servidor rodando na porta ${PORT}`);

    try {
        await startBot();
        console.log('Bot iniciado com sucesso');
    } catch (error) {
        console.error('Erro ao iniciar o bot:', error);
    }
});