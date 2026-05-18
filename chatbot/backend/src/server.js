'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');

const { getBotStatus } = require('./store');
const { listDemands, updateDemandStatus, deleteDemand } = require('./db/repositories/demands.repository');
const { startBot, stopBot, getBotQr } = require('./bot');
const { clearWwebjsCache } = require('./bot/cache');
const { getMessages, saveMessages, validateMessages } = require('./messages');
const { createTables } = require('./db/schema');
const { csvManager, aiReplyService, DATA_DIR } = require('./shared');

const app = express();
const PORT = 3001;

createTables();
validateMessages(getMessages());

// --- File upload ---

const upload = multer({
  storage: multer.diskStorage({
    destination(req, file, cb) {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      cb(null, DATA_DIR);
    },
    filename(req, file, cb) {
      cb(null, 'uploaded.CSV');
    },
  }),
  fileFilter(req, file, cb) {
    if (file.mimetype === 'text/csv' || file.originalname.toLowerCase().endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Apenas arquivos .CSV são aceitos'));
    }
  },
});

app.use(cors());
app.use(express.json());

// --- Helpers ---

function csvReadyOrError(res) {
  const { loaded, error } = csvManager.getStatus();
  if (!loaded) {
    if (error) return res.status(500).json({ error: 'Erro ao carregar dados CSV', details: error });
    return res.status(503).json({ error: 'CSV ainda não carregado, tente novamente em alguns segundos' });
  }
  return null;
}

// --- Routes ---

app.get('/api/health', (req, res) => {
  res.json({ ok: true, message: 'Backend funcionando' });
});

app.get('/api/search-client', (req, res) => {
  const query = String(req.query.q || req.query.query || '').trim();
  if (!query) return res.status(400).json({ error: 'query (q) é obrigatório' });

  const notReady = csvReadyOrError(res);
  if (notReady) return;

  const limit = parseInt(req.query.limit, 10) || 10;
  const { rawCount, clients } = csvManager.search(query, { limit });

  if (clients.length === 0) {
    return res.json({ query, matchedRows: 0, count: 0, requireAllTokens: true, results: [], duplicatas: [] });
  }

  const top = clients[0];
  res.json({
    query,
    matchedRows: rawCount,
    count: top.duplicatas.length,
    requireAllTokens: true,
    selectedClient: top.name,
    duplicatas: top.duplicatas,
  });
});

app.post('/api/ai-response', async (req, res) => {
  const query = String(req.body.q || req.body.query || '').trim();
  const userRequest = String(req.body.request || req.body.userRequest || '').trim();

  if (!query) return res.status(400).json({ error: 'query (q) é obrigatório' });

  const notReady = csvReadyOrError(res);
  if (notReady) return;

  const { clients } = csvManager.search(query, { limit: 1 });

  if (clients.length === 0) {
    return res.status(404).json({ error: 'Cliente não encontrado' });
  }

  if (!aiReplyService) {
    return res.status(500).json({ error: 'GROQ_API_KEY não configurada' });
  }

  try {
    const answer = await aiReplyService.getReply({ client: clients[0], userRequest });
    return res.json({ answer });
  } catch (error) {
    if (error.debug) {
      return res.status(502).json({ error: error.message, debug: error.debug });
    }
    console.error('AI request error:', error);
    return res.status(500).json({ error: 'Falha na chamada ao Groq', details: error?.message || 'Erro desconhecido' });
  }
});

// --- Bot ---

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

// --- Demands ---

app.get('/api/demands', (req, res) => {
  const { search, type, status, sortBy, order } = req.query;
  res.json(listDemands({ search, type, status, sortBy, order }));
});

app.patch('/api/demands/:id/status', (req, res) => {
  const demandId = Number(req.params.id);
  const { status } = req.body;

  if (!['pending', 'in_progress', 'done'].includes(status)) {
    return res.status(400).json({ error: 'Status inválido' });
  }

  const updated = updateDemandStatus(demandId, status);
  if (!updated) return res.status(404).json({ error: 'Demanda não encontrada' });

  res.json(updated);
});

app.delete('/api/demands/:id', (req, res) => {
  const demandId = Number(req.params.id);
  if (!Number.isInteger(demandId) || demandId <= 0) {
    return res.status(400).json({ error: 'ID inválido' });
  }

  const deleted = deleteDemand(demandId);
  if (!deleted) return res.status(404).json({ error: 'Demanda não encontrada' });

  res.json({ success: true, deleted });
});

// --- CSV ---

app.get('/api/csv/files', (req, res) => {
  try {
    const { loaded, error, filePath } = csvManager.getStatus();
    res.json({ files: csvManager.getFiles(), current: filePath, loaded, error });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao listar arquivos CSV', details: err.message });
  }
});

app.post('/api/csv/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });

    const uploadedPath = path.join(DATA_DIR, 'uploaded.CSV');
    const result = await csvManager.load(uploadedPath);

    if (result.ok) {
      res.json({ ok: true, message: 'CSV carregado com sucesso', rowCount: result.rowCount, file: uploadedPath });
    } else {
      res.status(500).json({ ok: false, error: result.error });
    }
  } catch (err) {
    res.status(500).json({ error: 'Erro ao processar upload', details: err.message });
  }
});

app.post('/api/csv/reload', async (req, res) => {
  const { filePath } = req.body || {};
  const targetPath = filePath || csvManager.getStatus().filePath;

  if (!targetPath) return res.status(400).json({ error: 'Nenhum arquivo CSV disponível para recarregar' });

  const result = await csvManager.load(targetPath);
  if (result.ok) {
    res.json({ ok: true, message: 'CSV recarregado', rowCount: result.rowCount, file: targetPath });
  } else {
    res.status(500).json({ ok: false, error: result.error });
  }
});

app.delete('/api/csv/files/:filename', async (req, res) => {
  try {
    await csvManager.deleteFile(req.params.filename);
    res.json({ ok: true, message: 'Arquivo removido' });
  } catch (err) {
    const status = err.code === 'NOT_FOUND' ? 404 : 500;
    res.status(status).json({ error: err.message });
  }
});

// --- Bot Messages ---

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

// --- Start ---

app.listen(PORT, async () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  try {
    await startBot();
    console.log('Bot iniciado com sucesso');
  } catch (error) {
    console.error('Erro ao iniciar o bot:', error);
  }
});
