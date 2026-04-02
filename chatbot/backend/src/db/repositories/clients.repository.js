const db = require('../connection');

function findClientByPhone(phone) {
  if (!phone) return null;

  return db
    .prepare(`
      SELECT * FROM clients
      WHERE phone = ?
      LIMIT 1
    `)
    .get(phone);
}

function findClientByWhatsappId(whatsappId) {
  if (!whatsappId) return null;

  return db
    .prepare(`
      SELECT * FROM clients
      WHERE whatsapp_id = ?
      LIMIT 1
    `)
    .get(whatsappId);
}

function createClient({ name = null, phone = null, whatsappId = null }) {
  const stmt = db.prepare(`
    INSERT INTO clients (name, phone, whatsapp_id)
    VALUES (?, ?, ?)
  `);

  const result = stmt.run(name, phone, whatsappId);

  return db
    .prepare(`
      SELECT * FROM clients
      WHERE id = ?
    `)
    .get(result.lastInsertRowid);
}

function updateClient(clientId, { name, phone, whatsappId }) {
  const current = db
    .prepare(`
      SELECT * FROM clients
      WHERE id = ?
    `)
    .get(clientId);

  if (!current) return null;

  const nextName = name ?? current.name;
  const nextPhone = phone ?? current.phone;
  const nextWhatsappId = whatsappId ?? current.whatsapp_id;

  db.prepare(`
    UPDATE clients
    SET
      name = ?,
      phone = ?,
      whatsapp_id = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(nextName, nextPhone, nextWhatsappId, clientId);

  return db
    .prepare(`
      SELECT * FROM clients
      WHERE id = ?
    `)
    .get(clientId);
}

function upsertClient({ name = null, phone = null, whatsappId = null }) {
  let existing = null;

  if (phone) {
    existing = findClientByPhone(phone);
  }

  if (!existing && whatsappId) {
    existing = findClientByWhatsappId(whatsappId);
  }

  if (!existing) {
    return createClient({ name, phone, whatsappId });
  }

  return updateClient(existing.id, {
    name: name || existing.name,
    phone: phone || existing.phone,
    whatsappId: whatsappId || existing.whatsapp_id,
  });
}

module.exports = {
  findClientByPhone,
  findClientByWhatsappId,
  createClient,
  updateClient,
  upsertClient,
};