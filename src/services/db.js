const mysql = require("mysql2/promise");

let mysqlPool = null;
let usersTableReady = false;
let categoriesTableReady = false;
let skinsTableReady = false;

function getMysqlPool() {
  if (mysqlPool) return mysqlPool;

  const host = process.env.MYSQL_HOST;
  const user = process.env.MYSQL_USER;
  const password = process.env.MYSQL_PASSWORD;
  const database = process.env.MYSQL_DATABASE;
  const port = Number(process.env.MYSQL_PORT || 3306);

  if (!host || !user || !database) {
    throw new Error("Missing MySQL env: MYSQL_HOST / MYSQL_USER / MYSQL_DATABASE");
  }

  mysqlPool = mysql.createPool({
    host,
    port,
    user,
    password,
    database,
    waitForConnections: true,
    connectionLimit: Number(process.env.MYSQL_CONNECTION_LIMIT || 10),
    queueLimit: 0,
    charset: "utf8mb4",
  });

  return mysqlPool;
}

async function columnExists(pool, tableName, columnName) {
  const [rows] = await pool.query(
    `
      SELECT COUNT(*) AS cnt
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?
    `,
    [tableName, columnName]
  );
  return Array.isArray(rows) && rows[0] && Number(rows[0].cnt) > 0;
}

async function getColumnDataType(pool, tableName, columnName) {
  const [rows] = await pool.query(
    `
      SELECT DATA_TYPE AS dt
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?
      LIMIT 1
    `,
    [tableName, columnName]
  );
  return Array.isArray(rows) && rows[0] && rows[0].dt ? String(rows[0].dt).toLowerCase() : null;
}

async function indexExists(pool, tableName, indexName) {
  const [rows] = await pool.query(
    `
      SELECT COUNT(*) AS cnt
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND INDEX_NAME = ?
    `,
    [tableName, indexName]
  );
  return Array.isArray(rows) && rows[0] && Number(rows[0].cnt) > 0;
}

async function migrateUsersTableIfNeeded(pool) {
  const table = "users";

  if (!(await columnExists(pool, table, "provider"))) {
    await pool.query(
      `ALTER TABLE \`${table}\` ADD COLUMN provider VARCHAR(32) NOT NULL DEFAULT 'apple' AFTER id`
    );
  }
  if (!(await columnExists(pool, table, "apple_user_id"))) {
    await pool.query(
      `ALTER TABLE \`${table}\` ADD COLUMN apple_user_id VARCHAR(128) NOT NULL DEFAULT '' AFTER provider`
    );
  }
  if (!(await columnExists(pool, table, "email"))) {
    await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN email VARCHAR(255) NULL`);
  }
  if (!(await columnExists(pool, table, "email_verified"))) {
    await pool.query(
      `ALTER TABLE \`${table}\` ADD COLUMN email_verified TINYINT(1) NOT NULL DEFAULT 0`
    );
  }
  if (!(await columnExists(pool, table, "is_private_email"))) {
    await pool.query(
      `ALTER TABLE \`${table}\` ADD COLUMN is_private_email TINYINT(1) NOT NULL DEFAULT 0`
    );
  }
  if (!(await columnExists(pool, table, "last_login_at"))) {
    await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN last_login_at DATETIME NULL`);
  }
  if (!(await columnExists(pool, table, "created_at"))) {
    await pool.query(
      `ALTER TABLE \`${table}\` ADD COLUMN created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP`
    );
  }
  if (!(await columnExists(pool, table, "updated_at"))) {
    await pool.query(
      `ALTER TABLE \`${table}\` ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`
    );
  }

  if (!(await indexExists(pool, table, "uniq_provider_apple_user_id"))) {
    try {
      await pool.query(
        `ALTER TABLE \`${table}\` ADD UNIQUE KEY uniq_provider_apple_user_id (provider, apple_user_id)`
      );
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      // eslint-disable-next-line no-console
      console.error(
        "Could not add uniq_provider_apple_user_id (duplicate rows or conflicting data). Fix users table manually:",
        msg
      );
    }
  }
  if (!(await indexExists(pool, table, "idx_email"))) {
    try {
      await pool.query(`ALTER TABLE \`${table}\` ADD KEY idx_email (email)`);
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      // eslint-disable-next-line no-console
      console.error("Could not add idx_email:", msg);
    }
  }
}

async function ensureUsersTable() {
  if (usersTableReady) return;

  const pool = getMysqlPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      provider VARCHAR(32) NOT NULL,
      apple_user_id VARCHAR(128) NOT NULL,
      email VARCHAR(255) NULL,
      email_verified TINYINT(1) NOT NULL DEFAULT 0,
      is_private_email TINYINT(1) NOT NULL DEFAULT 0,
      last_login_at DATETIME NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_provider_apple_user_id (provider, apple_user_id),
      KEY idx_email (email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await migrateUsersTableIfNeeded(pool);

  usersTableReady = true;
}

function resetUsersTableCache() {
  usersTableReady = false;
}

function resetCategoriesTableCache() {
  categoriesTableReady = false;
}

function resetSkinsTableCache() {
  skinsTableReady = false;
}

async function migrateSkinsTableIfNeeded(pool) {
  const table = "skins";
  if (!(await columnExists(pool, table, "creator_user_id"))) {
    await pool.query(
      `ALTER TABLE \`${table}\` ADD COLUMN creator_user_id BIGINT UNSIGNED NULL AFTER thumb_url`
    );
  }
  if (!(await indexExists(pool, table, "idx_creator_user"))) {
    try {
      await pool.query(`ALTER TABLE \`${table}\` ADD KEY idx_creator_user (creator_user_id)`);
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      // eslint-disable-next-line no-console
      console.error("Could not add idx_creator_user:", msg);
    }
  }

  const typeDt = await getColumnDataType(pool, table, "type");
  if (typeDt === "varchar" || typeDt === "char" || typeDt === "text") {
    try {
      await pool.query(`ALTER TABLE \`${table}\` MODIFY COLUMN \`type\` SMALLINT NOT NULL`);
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      // eslint-disable-next-line no-console
      console.error(
        "Could not migrate skins.type to SMALLINT (non-numeric values in type column?). Fix manually:",
        msg
      );
    }
  }
}

async function ensureSkinsTable() {
  if (skinsTableReady) return;

  const pool = getMysqlPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS skins (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      type SMALLINT NOT NULL,
      price DECIMAL(10, 2) NOT NULL,
      is_member_exclusive TINYINT(1) NOT NULL DEFAULT 0,
      image_url VARCHAR(2048) NOT NULL,
      thumb_url VARCHAR(2048) NOT NULL,
      creator_user_id BIGINT UNSIGNED NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_type (type),
      KEY idx_created_at (created_at),
      KEY idx_creator_user (creator_user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await migrateSkinsTableIfNeeded(pool);

  skinsTableReady = true;
}

async function insertSkin({
  name,
  type,
  price,
  isMemberExclusive,
  imageUrl,
  thumbUrl,
  creatorUserId,
}) {
  const runOnce = async () => {
    await ensureSkinsTable();
    const pool = getMysqlPool();

    const [result] = await pool.query(
      `
      INSERT INTO skins (name, type, price, is_member_exclusive, image_url, thumb_url, creator_user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
      [
        name,
        type,
        price,
        isMemberExclusive ? 1 : 0,
        imageUrl,
        thumbUrl,
        creatorUserId === undefined || creatorUserId === null ? null : creatorUserId,
      ]
    );

    const insertedId = result && result.insertId ? Number(result.insertId) : 0;
    const [rows] = await pool.query(
      `
      SELECT
        id,
        name,
        type,
        price,
        is_member_exclusive AS isMemberExclusive,
        image_url AS imageUrl,
        thumb_url AS thumbUrl,
        creator_user_id AS creatorUserId,
        created_at AS createdAt
      FROM skins
      WHERE id = ?
      LIMIT 1
    `,
      [insertedId]
    );

    const row = Array.isArray(rows) ? rows[0] : null;
    if (row && Object.prototype.hasOwnProperty.call(row, "isMemberExclusive")) {
      row.isMemberExclusive = Boolean(Number(row.isMemberExclusive));
    }
    if (row && Object.prototype.hasOwnProperty.call(row, "type")) {
      row.type = Number(row.type);
    }
    return row;
  };

  try {
    return await runOnce();
  } catch (err) {
    const noTable =
      (err && err.code === "ER_NO_SUCH_TABLE") || (err && Number(err.errno) === 1146);
    if (noTable) {
      resetSkinsTableCache();
      return runOnce();
    }
    throw err;
  }
}

async function listSkins(filters) {
  const typeFilter =
    filters && typeof filters.type === "number" && Number.isInteger(filters.type)
      ? filters.type
      : null;
  const creator = filters && filters.creatorUserIdFilter;

  const page =
    filters &&
    typeof filters.page === "number" &&
    Number.isInteger(filters.page) &&
    filters.page >= 1
      ? filters.page
      : 1;
  const pageSize =
    filters &&
    typeof filters.pageSize === "number" &&
    Number.isInteger(filters.pageSize) &&
    filters.pageSize >= 1 &&
    filters.pageSize <= 100
      ? filters.pageSize
      : 20;

  const runOnce = async () => {
    await ensureSkinsTable();
    const pool = getMysqlPool();

    const where = [];
    const params = [];

    if (typeFilter !== null) {
      where.push("type = ?");
      params.push(typeFilter);
    }

    if (creator && creator.kind === "eq") {
      where.push("creator_user_id = ?");
      params.push(creator.value);
    } else if (creator && creator.kind === "null") {
      where.push("creator_user_id IS NULL");
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS cnt FROM skins ${whereSql}`,
      params
    );
    const total =
      Array.isArray(countRows) && countRows[0] && countRows[0].cnt != null
        ? Number(countRows[0].cnt)
        : 0;

    const offset = (page - 1) * pageSize;
    const dataSql = `
      SELECT
        id,
        name,
        type,
        price,
        is_member_exclusive AS isMemberExclusive,
        image_url AS imageUrl,
        thumb_url AS thumbUrl,
        creator_user_id AS creatorUserId,
        created_at AS createdAt
      FROM skins
      ${whereSql}
      ORDER BY id DESC
      LIMIT ? OFFSET ?
    `;

    const [rows] = await pool.query(dataSql, [...params, pageSize, offset]);
    const list = Array.isArray(rows) ? rows : [];
    for (const row of list) {
      if (row && Object.prototype.hasOwnProperty.call(row, "isMemberExclusive")) {
        row.isMemberExclusive = Boolean(Number(row.isMemberExclusive));
      }
      if (row && Object.prototype.hasOwnProperty.call(row, "type")) {
        row.type = Number(row.type);
      }
    }

    const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);

    return {
      skins: list,
      total,
      page,
      pageSize,
      totalPages,
    };
  };

  try {
    return await runOnce();
  } catch (err) {
    const noTable =
      (err && err.code === "ER_NO_SUCH_TABLE") || (err && Number(err.errno) === 1146);
    if (noTable) {
      resetSkinsTableCache();
      return runOnce();
    }
    throw err;
  }
}

async function ensureCategoriesTable() {
  if (categoriesTableReady) return;

  const pool = getMysqlPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS categories (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      creator_user_id BIGINT UNSIGNED NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_creator_name (creator_user_id, name),
      KEY idx_creator (creator_user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  categoriesTableReady = true;
}

async function insertCategory({ creatorUserId, name }) {
  const runOnce = async () => {
    await ensureCategoriesTable();
    const pool = getMysqlPool();

    const [result] = await pool.query(
      `
      INSERT INTO categories (name, creator_user_id)
      VALUES (?, ?)
    `,
      [name, creatorUserId]
    );

    const insertedId = result && result.insertId ? Number(result.insertId) : 0;
    const [rows] = await pool.query(
      `
      SELECT
        id,
        name,
        creator_user_id AS creatorUserId,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM categories
      WHERE id = ?
      LIMIT 1
    `,
      [insertedId]
    );

    return Array.isArray(rows) ? rows[0] : null;
  };

  try {
    return await runOnce();
  } catch (err) {
    const noTable =
      (err && err.code === "ER_NO_SUCH_TABLE") || (err && Number(err.errno) === 1146);
    if (noTable) {
      resetCategoriesTableCache();
      return runOnce();
    }
    throw err;
  }
}

async function listCategoriesByCreatorUserId({ creatorUserId }) {
  const runOnce = async () => {
    await ensureCategoriesTable();
    const pool = getMysqlPool();

    const [rows] = await pool.query(
      `
      SELECT
        id,
        name,
        creator_user_id AS creatorUserId,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM categories
      WHERE creator_user_id = ?
      ORDER BY id DESC
    `,
      [creatorUserId]
    );

    return Array.isArray(rows) ? rows : [];
  };

  try {
    return await runOnce();
  } catch (err) {
    const noTable =
      (err && err.code === "ER_NO_SUCH_TABLE") || (err && Number(err.errno) === 1146);
    if (noTable) {
      resetCategoriesTableCache();
      return runOnce();
    }
    throw err;
  }
}

async function upsertAppleUser(payload) {
  const runOnce = async () => {
    await ensureUsersTable();
    const pool = getMysqlPool();

    const provider = "apple";
    const appleUserId = payload.sub;
    const email = payload.email || null;
    const emailVerified = payload.email_verified === true || payload.email_verified === "true" ? 1 : 0;
    const isPrivateEmail = payload.is_private_email === true || payload.is_private_email === "true" ? 1 : 0;

    await pool.query(
      `
      INSERT INTO users (
        provider,
        apple_user_id,
        email,
        email_verified,
        is_private_email,
        last_login_at
      ) VALUES (?, ?, ?, ?, ?, NOW())
      ON DUPLICATE KEY UPDATE
        email = VALUES(email),
        email_verified = VALUES(email_verified),
        is_private_email = VALUES(is_private_email),
        last_login_at = NOW()
    `,
      [provider, appleUserId, email, emailVerified, isPrivateEmail]
    );

    const [rows] = await pool.query(
      `
      SELECT
        id,
        provider,
        apple_user_id AS appleUserId,
        email,
        email_verified AS emailVerified,
        is_private_email AS isPrivateEmail,
        last_login_at AS lastLoginAt,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM users
      WHERE provider = ? AND apple_user_id = ?
      LIMIT 1
    `,
      [provider, appleUserId]
    );

    return Array.isArray(rows) ? rows[0] : null;
  };

  try {
    return await runOnce();
  } catch (err) {
    const noTable =
      (err && err.code === "ER_NO_SUCH_TABLE") || (err && Number(err.errno) === 1146);
    if (noTable) {
      resetUsersTableCache();
      return runOnce();
    }
    throw err;
  }
}

async function initDatabaseIfConfigured() {
  if (!process.env.MYSQL_HOST || !process.env.MYSQL_USER || !process.env.MYSQL_DATABASE) {
    return;
  }

  await ensureUsersTable();
  await ensureCategoriesTable();
  await ensureSkinsTable();
}

module.exports = {
  getMysqlPool,
  ensureUsersTable,
  ensureCategoriesTable,
  ensureSkinsTable,
  insertCategory,
  listCategoriesByCreatorUserId,
  insertSkin,
  listSkins,
  upsertAppleUser,
  initDatabaseIfConfigured,
};
