const path = require('path');
const Database = require('better-sqlite3');

const dbPath = path.resolve(__dirname, '../../../data/app.db');

const db = new Database(dbPath);

db.pragma('foreign_keys = ON');

db.pragma('journal_mode = WAL');

module.exports = db;