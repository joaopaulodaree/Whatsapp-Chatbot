function normalizeText(text) {
  return String(text || "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

function extractClientInfo(rawName) {
  let text = normalizeText(rawName);

  const flags = [];
  let recordNumber = null;

  // Detecta flags conhecidas
  if (/\bSPC\b/.test(text)) {
    flags.push("SPC");
  }

  // Detecta número no final
  const numberMatch = text.match(/\b(\d+)\s*$/);
  if (numberMatch) {
    recordNumber = numberMatch[1];
  }

  // Remove asteriscos
  text = text.replace(/\*/g, " ");

  // Remove parenteses
  text = text.replace(/[()]/g, " ");

  // Remove flags conhecidas
  text = text.replace(/\bSPC\b/g, " ");

  // Remove número final
  text = text.replace(/\b\d+\s*$/g, " ");

  // Normaliza espaços
  text = text.replace(/\s+/g, " ").trim();

  return {
    rawName: normalizeText(rawName),
    cleanName: text,
    flags,
    recordNumber,
    tokens: text.split(" ").filter(Boolean),
  };
}

function scoreCandidate(query, candidate) {
  const normalizedQuery = normalizeText(query);
  const queryTokens = normalizedQuery.split(" ").filter(Boolean);

  let score = 0;

  if (!normalizedQuery) return 0;

  // match exato
  if (candidate.cleanName === normalizedQuery) {
    score += 100;
  }

  // começa com
  if (candidate.cleanName.startsWith(normalizedQuery)) {
    score += 40;
  }

  // contém a frase inteira
  if (candidate.cleanName.includes(normalizedQuery)) {
    score += 30;
  }

  // tokens
  const matchedTokens = queryTokens.filter((token) =>
    candidate.tokens.includes(token)
  );

  score += matchedTokens.length * 20;

  // bônus se todos os tokens baterem
  if (queryTokens.length > 0 && matchedTokens.length === queryTokens.length) {
    score += 30;
  }

  // penaliza busca muito vaga
  if (queryTokens.length === 1 && queryTokens[0].length <= 3) {
    score -= 15;
  }

  return score;
}

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

function getFieldValue(row, nameField) {
  if (!row || typeof row !== 'object') return '';

  if (row[nameField] !== undefined && row[nameField] !== null) {
    return row[nameField];
  }

  const target = String(nameField || '').trim().toUpperCase();
  const keys = Object.keys(row);

  const exactKey = keys.find((key) => String(key).trim().toUpperCase() === target);
  if (exactKey) return row[exactKey];

  const startsWithKey = keys.find((key) => String(key).trim().toUpperCase().startsWith(target));
  if (startsWithKey) return row[startsWithKey];

  const includesKey = keys.find((key) => String(key).trim().toUpperCase().includes(target));
  if (includesKey) return row[includesKey];

  return '';
}

function extractDuplicata(row) {
  if (!row || typeof row !== 'object') {
    return {
      nome: '',
      duplic: '',
      vencto: '',
      total: '',
    };
  }

  return {
    nome: String(getFieldValue(row, 'Nome') || '').trim(),
    duplic: String(getFieldValue(row, 'Duplic') || getFieldValue(row, 'Duplicata') || '').trim(),
    vencto: String(getFieldValue(row, 'Vencto') || getFieldValue(row, 'Vencimento') || '').trim(),
    total: String(getFieldValue(row, 'Total') || '').trim(),
  };
}

function searchClientsByName(query, rows, nameField = "Nome", limit = 5, requireAllTokens = false) {
  const normalizedQuery = normalizeText(query);
  const queryTokens = normalizedQuery.split(" ").filter(Boolean);

  console.log('searchClientsByName called', { query, nameField, limit, requireAllTokens, rows: rows.length });

  const candidates = rows.map((row) => {
    const rawName = getFieldValue(row, nameField);
    const parsed = extractClientInfo(rawName);
    const duplicata = extractDuplicata(row);

    return {
      row,
      ...parsed,
      duplicata,
      score: scoreCandidate(query, parsed),
      queryTokens,
    };
  });

  return candidates
    .filter((candidate) => {
      if (candidate.score <= 0) return false;
      if (requireAllTokens && queryTokens.length > 0) {
        const matchedTokens = queryTokens.filter((token) => candidate.tokens.includes(token));
        return matchedTokens.length === queryTokens.length;
      }
      return true;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function parseCurrency(value) {
  if (value === undefined || value === null) return 0;

  const clean = String(value)
    .trim()
    .replace(/\./g, '')
    .replace(/,/g, '.');

  const parsed = parseFloat(clean);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function aggregateByName(candidates, nameField = 'Nome', totalField = 'Total') {
  const totals = {};

  candidates.forEach((candidate) => {
    const row = candidate.row || {};
    const name = String(getFieldValue(row, nameField) || '').trim();
    if (!name) return;

    const total = parseCurrency(getFieldValue(row, totalField));

    if (!totals[name]) {
      totals[name] = { name, total: 0, count: 0, maxScore: 0 };
    }

    totals[name].total += total;
    totals[name].count += 1;
    totals[name].maxScore = Math.max(totals[name].maxScore, candidate.score || 0);
  });

  return Object.values(totals).sort((a, b) => {
    if (b.maxScore !== a.maxScore) return b.maxScore - a.maxScore;
    return b.total - a.total;
  });
}

function loadCsv(filePath, separator = ';') {
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, 'utf8', (err, content) => {
      if (err) return reject(err);

      const isCleaned = filePath.includes('cleaned');

      let lines;
      if (isCleaned) {
        // Para CSV limpo, cada linha é um registro
        lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
      } else {
        // Lógica original para CSV não limpo
        lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
        const merged = [];
        let current = '';

        for (const line of lines) {
          if (line.startsWith('02;')) {
            if (current) merged.push(current);
            current = line;
          } else {
            // Linha de continuação de registro
            current += line.trimStart();
          }
        }

        if (current) merged.push(current);
        lines = merged;
      }

      const rows = [];
      const { Readable } = require('stream');
      const stream = Readable.from(lines.join('\n'));

      let nomeCounter = 0;

      stream
        .pipe(csv({
          separator,
          skipLines: 0,
          mapHeaders: ({ header }) => {
            const normalized = String(header || '').trim();
            if (normalized.toUpperCase() === 'NOME') {
              nomeCounter += 1;
              if (nomeCounter === 1) return 'NomeLoja';
              if (nomeCounter === 2) return 'Nome';
              return `NomeVendedor${nomeCounter}`;
            }
            return normalized;
          },
        }))
        .on('data', (data) => {
          const normalizedRow = {};
          for (const key of Object.keys(data)) {
            normalizedRow[String(key || '').trim()] = data[key];
          }
          rows.push(normalizedRow);
        })
        .on('end', () => resolve(rows))
        .on('error', (error) => reject(error));
    });
  });
}

function getDefaultCsvPath() {
  return path.resolve(__dirname, '../../..', 'Souarte_cleaned.CSV');
}

module.exports = {
  extractClientInfo,
  scoreCandidate,
  searchClientsByName,
  loadCsv,
  getDefaultCsvPath,
  aggregateByName,
  parseCurrency,
};