const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir =
  process.env.APP_DATA_DIR
    ? path.join(process.env.APP_DATA_DIR, 'data')
    : path.resolve(__dirname, '../../../data');

const dbPath = path.join(dataDir, 'souarte.db');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbPath);

module.exports = db;