'use strict';

const fs = require('fs');
const path = require('path');
const { searchClientsByName, aggregateByName, loadCsv, formatCurrencyBR } = require('../nameSearch');

// Only the fields the search, scoring, and display actually use.
// Every other column in the supplier CSV is discarded after parsing.
const KEEP_FIELDS = new Set(['Nome', 'NomeLoja', 'Duplic', 'Duplicata', 'Vencto', 'Vencimento', 'Total']);

class CsvDataManager {
  constructor({ dataDir }) {
    this._dataDir = dataDir;
    this._rows = [];
    this._loaded = false;
    this._error = null;
    this._filePath = null;
  }

  async load(filePath) {
    try {
      const allRows = await loadCsv(filePath);
      this._rows = allRows.map((row) => {
        const filtered = {};
        for (const key of Object.keys(row)) {
          const trimmed = String(key).trim();
          if (KEEP_FIELDS.has(trimmed)) filtered[trimmed] = row[key];
        }
        return filtered;
      });
      this._loaded = true;
      this._error = null;
      this._filePath = filePath;
      console.log(`CSV carregado com ${this._rows.length} linhas de ${filePath}`);
      return { ok: true, rowCount: this._rows.length };
    } catch (error) {
      this._loaded = false;
      this._error = error;
      console.error(`Falha ao carregar CSV em ${filePath}:`, error);
      return { ok: false, error: error.message };
    }
  }

  /**
   * Search clients by name. Returns aggregated clients with their duplicatas,
   * ready for both the search endpoint and the AI prompt.
   *
   * @param {string} name
   * @param {{ limit?: number }} opts
   * @returns {{ rawCount: number, clients: Array<{ name, total, totalFormatted, duplicatas }> }}
   */
  search(name, { limit = 10 } = {}) {
    const raw = searchClientsByName(name, this._rows, 'Nome', 1000, true);
    const aggregated = aggregateByName(raw, 'Nome', 'Total');

    const clients = aggregated.slice(0, limit).map((agg) => {
      const clientNameUpper = String(agg.name || '').trim().toUpperCase();
      const duplicatas = raw
        .filter((r) => {
          const n = String(r.row.Nome || r.row.NomeLoja || '').trim().toUpperCase();
          return n === clientNameUpper;
        })
        .map((r) => ({
          nome: String(r.row.Nome || '').trim(),
          duplic: String(r.row.Duplic || r.row.Duplicata || '').trim(),
          vencto: String(r.row.Vencto || r.row.Vencimento || '').trim(),
          total: String(r.row.Total || '').trim(),
        }));

      return {
        name: agg.name,
        total: agg.total,
        totalFormatted: formatCurrencyBR(agg.total),
        duplicatas,
      };
    });

    return { rawCount: raw.length, clients };
  }

  getStatus() {
    return {
      loaded: this._loaded,
      error: this._error?.message || null,
      filePath: this._filePath,
      rowCount: this._rows.length,
    };
  }

  getFiles() {
    if (!fs.existsSync(this._dataDir)) return [];
    return fs
      .readdirSync(this._dataDir)
      .filter((f) => f.toLowerCase().endsWith('.csv'))
      .map((f) => {
        const fp = path.join(this._dataDir, f);
        const stat = fs.statSync(fp);
        return { name: f, path: fp, size: stat.size, mtime: stat.mtime };
      });
  }

  async deleteFile(filename) {
    const filePath = path.join(this._dataDir, filename);
    if (!fs.existsSync(filePath)) {
      throw Object.assign(new Error('Arquivo não encontrado'), { code: 'NOT_FOUND' });
    }

    fs.rmSync(filePath);

    if (filePath === this._filePath) {
      const remaining = this.getFiles();
      if (remaining.length > 0) {
        await this.load(remaining[0].path);
      } else {
        this._rows = [];
        this._loaded = false;
        this._filePath = null;
      }
    }
  }
}

module.exports = { CsvDataManager };
