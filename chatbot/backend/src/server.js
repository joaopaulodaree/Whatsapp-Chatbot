require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Groq = require('groq-sdk');
const {
    getBotStatus,
    toggleBotEnabled,
} = require('./store');

const { listDemands, updateDemandStatus, deleteDemand } = require('./db/repositories/demands.repository');

const { searchClientsByName, loadCsv, getDefaultCsvPath, aggregateByName, formatCurrencyBR } = require('./nameSearch');
const { startBot, stopBot, getBotQr } = require('./bot');
const { clearWwebjsCache } = require('./bot/cache');
const cleanCsv = require('./cleanCsv');
const { getMessages, saveMessages } = require('./messages');

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL_PREFERENCE = (process.env.GROQ_MODEL || 'openai/gpt-oss-120b').trim();

const groq = new Groq({ apiKey: GROQ_API_KEY });

const app = express();
const PORT = 3001;

const { createTables } = require('./db/schema');
createTables();

const DATA_DIR = path.resolve(__dirname, '../../data');
const STORAGE = multer.diskStorage({
    destination: function (req, file, cb) {
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        cb(null, DATA_DIR);
    },
    filename: function (req, file, cb) {
        cb(null, 'uploaded.CSV');
    },
});
const upload = multer({
    storage: STORAGE,
    fileFilter: function (req, file, cb) {
        if (file.mimetype === 'text/csv' || file.originalname.endsWith('.CSV') || file.originalname.endsWith('.csv')) {
            cb(null, true);
        } else {
            cb(new Error('Apenas arquivos .CSV são aceitos'));
        }
    },
});

let csvRows = [];
let csvLoaded = false;
let csvLoadError = null;

let CSV_FILE_PATH = process.env.CSV_PATH || getDefaultCsvPath();

const COLUMNS_TO_REMOVE = [0, 1, 5, 6, 7, 12, 13, 14, 15, 16, 17, 18, 24, 25, 26, 27, 28, 29, 30, 31, 32];

function cleanUploadedCsv() {
    const inputPath = path.resolve(DATA_DIR, 'uploaded.CSV');
    const outputPath = path.resolve(DATA_DIR, 'uploaded_cleaned.CSV');
    cleanCsv(inputPath, outputPath, COLUMNS_TO_REMOVE);
    fs.rmSync(inputPath);
    console.log(`CSV limpo gerado em: ${outputPath} (original removido)`);
    return outputPath;
}

async function loadCSVAtPath(filePath) {
    try {
        const rows = await loadCsv(filePath);
        csvRows = rows;
        csvLoaded = true;
        csvLoadError = null;
        console.log(`CSV carregado com ${rows.length} linhas de ${filePath}`);
        return { ok: true, rowCount: rows.length };
    } catch (error) {
        csvLoaded = false;
        csvLoadError = error;
        console.error(`Falha ao carregar CSV em ${filePath}:`, error);
        return { ok: false, error: error.message };
    }
}

app.use(cors());
app.use(express.json());

loadCSVAtPath(CSV_FILE_PATH);

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

app.post('/api/bot/start', async (req, res) => {
    try {
        await startBot();
        res.json({ ok: true, message: 'Bot ativado' });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao ativar bot', details: err.message });
    }
});

app.post('/api/bot/stop', async (req, res) => {
    try {
        await stopBot();
        res.json({ ok: true, message: 'Bot desativado' });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao desativar bot', details: err.message });
    }
});

app.post('/api/bot/clear-cache', (req, res) => {
    try {
        const result = clearWwebjsCache();
        res.json({ ok: true, message: 'Cache limpo com sucesso', ...result });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao limpar cache', details: err.message });
    }
});

app.get('/api/bot/qr', (req, res) => {
    res.json({ qr: getBotQr() || null });
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

app.delete('/api/demands/:id', (req, res) => {
  const demandId = Number(req.params.id);

  if (!Number.isInteger(demandId) || demandId <= 0) {
    return res.status(400).json({ error: 'ID inválido' });
  }

  const deleted = deleteDemand(demandId);

  if (!deleted) {
    return res.status(404).json({ error: 'Demanda não encontrada' });
  }

  res.json({
    success: true,
    deleted,
  });
});

// --- CSV Management Endpoints ---

app.get('/api/csv/files', (req, res) => {
    try {
        if (!fs.existsSync(DATA_DIR)) {
            return res.json({ files: [], current: CSV_FILE_PATH, loaded: csvLoaded });
        }
        const files = fs.readdirSync(DATA_DIR)
            .filter((f) => f.toLowerCase().endsWith('.csv'))
            .map((f) => ({
                name: f,
                path: path.resolve(DATA_DIR, f),
                size: fs.statSync(path.resolve(DATA_DIR, f)).size,
                mtime: fs.statSync(path.resolve(DATA_DIR, f)).mtime,
            }));
        res.json({ files, current: CSV_FILE_PATH, loaded: csvLoaded, error: csvLoadError?.message });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao listar arquivos CSV', details: err.message });
    }
});

app.post('/api/csv/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Nenhum arquivo enviado' });
        }
        const uploadedPath = path.resolve(DATA_DIR, 'uploaded.CSV');
        console.log(`CSV original salvo em: ${uploadedPath}`);
        const cleanedPath = cleanUploadedCsv();
        CSV_FILE_PATH = cleanedPath;
        const result = await loadCSVAtPath(cleanedPath);
        if (result.ok) {
            res.json({ ok: true, message: 'CSV processado e carregado com sucesso', rowCount: result.rowCount, file: cleanedPath });
        } else {
            res.status(500).json({ ok: false, error: result.error });
        }
    } catch (err) {
        res.status(500).json({ error: 'Erro ao processar upload', details: err.message });
    }
});

app.post('/api/csv/reload', async (req, res) => {
    const { filePath } = req.body || {};
    const targetPath = filePath || CSV_FILE_PATH;
    CSV_FILE_PATH = targetPath;
    const result = await loadCSVAtPath(targetPath);
    if (result.ok) {
        res.json({ ok: true, message: 'CSV recarregado', rowCount: result.rowCount, file: targetPath });
    } else {
        res.status(500).json({ ok: false, error: result.error });
    }
});

app.delete('/api/csv/files/:filename', async (req, res) => {
    const filename = req.params.filename;
    const filePath = path.resolve(DATA_DIR, filename);
    try {
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'Arquivo não encontrado' });
        }
        fs.rmSync(filePath);
        if (filePath === CSV_FILE_PATH) {
            const fallback = getDefaultCsvPath();
            if (fs.existsSync(fallback)) {
                CSV_FILE_PATH = fallback;
                await loadCSVAtPath(fallback);
            } else {
                csvRows = [];
                csvLoaded = false;
            }
        }
        res.json({ ok: true, message: 'Arquivo removido' });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao remover arquivo', details: err.message });
    }
});

// --- Bot Messages Endpoints ---

app.get('/api/bot/messages', (req, res) => {
    try {
        res.json(getMessages());
    } catch (err) {
        res.status(500).json({ error: 'Erro ao ler mensagens do bot', details: err.message });
    }
});

app.put('/api/bot/messages', (req, res) => {
    try {
        saveMessages(req.body);
        res.json({ ok: true, message: 'Mensagens atualizadas com sucesso' });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao salvar mensagens do bot', details: err.message });
    }
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