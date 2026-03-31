require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const Groq = require('groq-sdk');
const {
    getClients,
    upsertClient,
    getBotStatus,
    toggleBotStatus,
} = require('./store');

const { searchClientsByName, loadCsv, getDefaultCsvPath, aggregateByName } = require('./nameSearch');
const { env } = require('process');

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL_PREFERENCE = (process.env.GROQ_MODEL || 'openai/gpt-oss-20b').trim();

const groq = new Groq({ apiKey: GROQ_API_KEY });

const app = express();
const PORT = 3001;

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

app.get('/api/clients', (req, res) => {
    const clients = getClients();
    res.json(clients);
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

    const userPrompt = `
    Cliente: ${selected.name}

    Duplicatas:
    ${duplicatas.map((d) => `- Duplicata ${d.duplic} | Vencimento ${d.vencto} | Total ${d.total}`).join('\n')}

    Pedido do usuário:
    ${userRequest || 'Faça a melhor resposta para o cliente.'}
    `.trim();

    try {
        const response = await groq.chat.completions.create({
            model: process.env.GROQ_MODEL_PREFERENCE || 'openai/gpt-oss-120b',
            messages: [
                {
                    role: 'system',
                    content: systemPrompt,
                },
                {
                    role: 'user',
                    content: userPrompt,
                },
            ],
            max_tokens: 700,
            temperature: 0.2,
        });

        const answer = String(response?.choices?.[0]?.message?.content || '').trim();

        if (!answer) {
            return res.status(502).json({
                error: 'A IA não retornou conteúdo na resposta',
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

app.post('/api/test-client', (req, res) => {
    const client = upsertClient({
        id: 'test-client',
        phone: '123456789',
        name: 'Cliente Teste',
        summary: 'Checar crediário - João Paulo Souza',
        lastMessage: 'Mensagem de teste',
    });
    res.status(201).json(client);
});

app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});