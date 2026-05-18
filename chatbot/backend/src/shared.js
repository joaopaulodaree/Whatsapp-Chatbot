'use strict';

const path = require('path');
const fs = require('fs');
const Groq = require('groq-sdk');

const { CsvDataManager } = require('./csv/csv-data-manager');
const { AiReplyService } = require('./ai/ai-reply-service');

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = (process.env.GROQ_MODEL || 'openai/gpt-oss-120b').trim();

const DATA_DIR = process.env.APP_DATA_DIR
  ? path.join(process.env.APP_DATA_DIR, 'data')
  : path.resolve(__dirname, '../../data');

const groq = GROQ_API_KEY ? new Groq({ apiKey: GROQ_API_KEY }) : null;
const aiReplyService = groq ? new AiReplyService({ groqClient: groq, model: GROQ_MODEL }) : null;

const csvManager = new CsvDataManager({ dataDir: DATA_DIR });

const initialCsvPath = process.env.CSV_PATH
  || (() => {
    const uploaded = path.join(DATA_DIR, 'uploaded.CSV');
    return fs.existsSync(uploaded) ? uploaded : null;
  })();

if (initialCsvPath) csvManager.load(initialCsvPath);

module.exports = { csvManager, aiReplyService, DATA_DIR };
