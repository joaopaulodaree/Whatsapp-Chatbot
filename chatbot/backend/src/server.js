const express = require('express');
const cors = require('cors');
const path = require('path');
const {
    getClients,
    upsertClient,
    getBotStatus,
    toggleBotStatus,
} = require('./store');

const { searchClientsByName, loadCsv, getDefaultCsvPath, aggregateByName } = require('./nameSearch');

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

    res.json({
        query,
        matchedRows: rawResults.length,
        count: paged.length,
        requireAllTokens: true,
        results: paged.map((item) => ({
            nome: item.name,
            totalDuplicatas: item.total,
            registros: item.count,
        })),
    });
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