const db = require('../connection');

function createDemand({ clientId, type, description = null, status = 'pending' }) {
  const stmt = db.prepare(`
    INSERT INTO demands (client_id, type, description, status)
    VALUES (?, ?, ?, ?)
  `);

  const result = stmt.run(clientId, type, description, status);

  return db
    .prepare(`
      SELECT * FROM demands
      WHERE id = ?
    `)
    .get(result.lastInsertRowid);
}

function updateDemandStatus(demandId, status) {
  db.prepare(`
    UPDATE demands
    SET status = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(status, demandId);

  return db
    .prepare(`
      SELECT * FROM demands
      WHERE id = ?
    `)
    .get(demandId);
}

function listDemands({ search = '', type, status, sortBy = 'created_at', order = 'desc' } = {}) {
  const allowedSortFields = ['created_at', 'name'];
  const allowedOrder = ['asc', 'desc'];

  const finalSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'created_at';
  const finalOrder = allowedOrder.includes(String(order).toLowerCase())
    ? String(order).toUpperCase()
    : 'DESC';

  const filters = [];
  const params = [];

  if (search) {
    filters.push(`(c.name LIKE ? OR c.phone LIKE ?)`);
    params.push(`%${search}%`, `%${search}%`);
  }

  if (type) {
    filters.push(`d.type = ?`);
    params.push(type);
  }

  if (status) {
    filters.push(`d.status = ?`);
    params.push(status);
  }

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  const orderClause =
    finalSortBy === 'name'
      ? `ORDER BY c.name ${finalOrder}, d.created_at DESC`
      : `ORDER BY d.created_at ${finalOrder}`;

  return db.prepare(`
    SELECT
      d.id,
      d.type,
      d.description,
      d.status,
      d.created_at,
      d.updated_at,
      c.id AS client_id,
      c.name,
      c.phone,
      c.whatsapp_id
    FROM demands d
    INNER JOIN clients c ON c.id = d.client_id
    ${whereClause}
    ${orderClause}
  `).all(...params);
}

function deleteDemand(demandId) {
  const existing = db
    .prepare(`
      SELECT * FROM demands
      WHERE id = ?
    `)
    .get(demandId);

  if (!existing) return null;

  db.prepare(`
    DELETE FROM demands
    WHERE id = ?
  `).run(demandId);

  return existing;
}

module.exports = {
  createDemand,
  updateDemandStatus,
  listDemands,
  deleteDemand,
};