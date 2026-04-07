const path = require('path');
const fs = require('fs');

const BACKEND_DIR = path.resolve(__dirname, '../..');
const AUTH_DIR = path.resolve(BACKEND_DIR, '.wwebjs_auth');
const CACHE_DIR = path.resolve(BACKEND_DIR, '.wwebjs_cache');

function clearWwebjsCache() {
  const dirs = [];
  if (fs.existsSync(AUTH_DIR)) dirs.push(AUTH_DIR);
  if (fs.existsSync(CACHE_DIR)) dirs.push(CACHE_DIR);

  for (const dir of dirs) {
    fs.rmSync(dir, { recursive: true, force: true });
    console.log(`Pasta removida: ${dir}`);
  }

  return { cleared: dirs.length > 0, dirs };
}

module.exports = { clearWwebjsCache };
