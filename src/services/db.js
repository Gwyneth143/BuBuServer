const mysql = require("mysql2/promise");

let mysqlPool = null;
let usersTableReady = false;
let categoriesTableReady = false;
let skinsTableReady = false;
let userSkinsTableReady = false;
let booksTableReady = false;

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

function resetUserSkinsTableCache() {
  userSkinsTableReady = false;
}

function resetBooksTableCache() {
  booksTableReady = false;
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

async function ensureUserSkinsTable() {
  if (userSkinsTableReady) return;

  const pool = getMysqlPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_skins (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NOT NULL,
      skin_id BIGINT UNSIGNED NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_user_skin (user_id, skin_id),
      KEY idx_user_created (user_id, created_at),
      KEY idx_skin (skin_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  userSkinsTableReady = true;
}

async function migrateBooksTableIfNeeded(pool) {
  const table = "books";
  if (!(await columnExists(pool, table, "cover_thumb_url"))) {
    await pool.query(
      `ALTER TABLE \`${table}\` ADD COLUMN cover_thumb_url VARCHAR(2048) NULL AFTER cover_url`
    );
  }
  if (!(await columnExists(pool, table, "skin_id"))) {
    await pool.query(
      `ALTER TABLE \`${table}\` ADD COLUMN skin_id BIGINT UNSIGNED NULL AFTER category_name`
    );
  }
  if (!(await indexExists(pool, table, "idx_books_skin"))) {
    try {
      await pool.query(`ALTER TABLE \`${table}\` ADD KEY idx_books_skin (skin_id)`);
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      // eslint-disable-next-line no-console
      console.error("Could not add idx_books_skin:", msg);
    }
  }
}

async function ensureBooksTable() {
  if (booksTableReady) return;

  const pool = getMysqlPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS books (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      creator_user_id BIGINT UNSIGNED NOT NULL,
      title VARCHAR(255) NOT NULL,
      category_name VARCHAR(255) NOT NULL,
      skin_id BIGINT UNSIGNED NOT NULL,
      cover_url VARCHAR(2048) NOT NULL,
      cover_thumb_url VARCHAR(2048) NULL,
      is_delete TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      deleted_at DATETIME NULL,
      KEY idx_creator (creator_user_id),
      KEY idx_category (category_name),
      KEY idx_books_skin (skin_id),
      KEY idx_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await migrateBooksTableIfNeeded(pool);

  booksTableReady = true;
}

async function insertBook({ creatorUserId, title, categoryName, skinId }) {
  const runOnce = async () => {
    await ensureSkinsTable();
    await ensureBooksTable();
    const pool = getMysqlPool();

    const [skinRows] = await pool.query(
      `
      SELECT image_url AS imageUrl, thumb_url AS thumbUrl
      FROM skins
      WHERE id = ?
      LIMIT 1
    `,
      [skinId]
    );
    const skin = Array.isArray(skinRows) ? skinRows[0] : null;
    if (!skin || !skin.imageUrl) {
      return { notFound: true };
    }
    const coverThumbUrl = skin.thumbUrl || skin.imageUrl || null;

    const [result] = await pool.query(
      `
      INSERT INTO books (creator_user_id, title, category_name, skin_id, cover_url, cover_thumb_url, is_delete)
      VALUES (?, ?, ?, ?, ?, ?, 0)
    `,
      [creatorUserId, title, categoryName, skinId, skin.imageUrl, coverThumbUrl]
    );

    const insertedId = result && result.insertId ? Number(result.insertId) : 0;
    const [rows] = await pool.query(
      `
      SELECT
        id,
        creator_user_id AS creatorUserId,
        title,
        category_name AS categoryName,
        skin_id AS skinId,
        cover_url AS coverUrl,
        cover_thumb_url AS coverThumbUrl,
        is_delete AS isDelete,
        created_at AS createdAt,
        updated_at AS updatedAt,
        deleted_at AS deletedAt
      FROM books
      WHERE id = ?
      LIMIT 1
    `,
      [insertedId]
    );

    const row = Array.isArray(rows) ? rows[0] : null;
    if (row && Object.prototype.hasOwnProperty.call(row, "isDelete")) {
      row.isDelete = Boolean(Number(row.isDelete));
    }
    if (row && row.skinId != null) {
      row.skinId = Number(row.skinId);
    }
    return { book: row };
  };

  try {
    return await runOnce();
  } catch (err) {
    const noTable =
      (err && err.code === "ER_NO_SUCH_TABLE") || (err && Number(err.errno) === 1146);
    if (noTable) {
      resetSkinsTableCache();
      resetBooksTableCache();
      return runOnce();
    }
    throw err;
  }
}

async function softDeleteBookByOwner({ userId, bookId }) {
  const runOnce = async () => {
    await ensureBooksTable();
    const pool = getMysqlPool();

    const [bookRows] = await pool.query(
      `
      SELECT
        id,
        creator_user_id AS creatorUserId,
        is_delete AS isDelete
      FROM books
      WHERE id = ?
      LIMIT 1
    `,
      [bookId]
    );
    const book = Array.isArray(bookRows) ? bookRows[0] : null;
    if (!book) {
      return { notFound: true };
    }
    const creator = Number(book.creatorUserId);
    const uid = Number(userId);
    if (!Number.isFinite(creator) || creator !== uid) {
      return { forbidden: true };
    }
    if (Boolean(Number(book.isDelete))) {
      return { alreadyDeleted: true };
    }

    await pool.query(
      `
      UPDATE books
      SET is_delete = 1, deleted_at = NOW()
      WHERE id = ? AND creator_user_id = ? AND is_delete = 0
    `,
      [bookId, uid]
    );

    const [rows] = await pool.query(
      `
      SELECT
        id,
        creator_user_id AS creatorUserId,
        title,
        category_name AS categoryName,
        skin_id AS skinId,
        cover_url AS coverUrl,
        cover_thumb_url AS coverThumbUrl,
        is_delete AS isDelete,
        created_at AS createdAt,
        updated_at AS updatedAt,
        deleted_at AS deletedAt
      FROM books
      WHERE id = ?
      LIMIT 1
    `,
      [bookId]
    );
    const row = Array.isArray(rows) ? rows[0] : null;
    if (row && Object.prototype.hasOwnProperty.call(row, "isDelete")) {
      row.isDelete = Boolean(Number(row.isDelete));
    }
    if (row && row.skinId != null) {
      row.skinId = Number(row.skinId);
    }
    return { ok: true, book: row };
  };

  try {
    return await runOnce();
  } catch (err) {
    const noTable =
      (err && err.code === "ER_NO_SUCH_TABLE") || (err && Number(err.errno) === 1146);
    if (noTable) {
      resetBooksTableCache();
      return runOnce();
    }
    throw err;
  }
}

async function touchBookUpdatedAtByOwner({ userId, bookId }) {
  const runOnce = async () => {
    await ensureBooksTable();
    const pool = getMysqlPool();

    const [bookRows] = await pool.query(
      `
      SELECT
        id,
        creator_user_id AS creatorUserId,
        is_delete AS isDelete
      FROM books
      WHERE id = ?
      LIMIT 1
    `,
      [bookId]
    );
    const book = Array.isArray(bookRows) ? bookRows[0] : null;
    if (!book) {
      return { notFound: true };
    }
    const creator = Number(book.creatorUserId);
    const uid = Number(userId);
    if (!Number.isFinite(creator) || creator !== uid) {
      return { forbidden: true };
    }
    if (Boolean(Number(book.isDelete))) {
      return { alreadyDeleted: true };
    }

    await pool.query(
      `
      UPDATE books
      SET updated_at = NOW()
      WHERE id = ? AND creator_user_id = ? AND is_delete = 0
    `,
      [bookId, uid]
    );

    const [rows] = await pool.query(
      `
      SELECT
        id,
        creator_user_id AS creatorUserId,
        title,
        category_name AS categoryName,
        skin_id AS skinId,
        cover_url AS coverUrl,
        cover_thumb_url AS coverThumbUrl,
        is_delete AS isDelete,
        created_at AS createdAt,
        updated_at AS updatedAt,
        deleted_at AS deletedAt
      FROM books
      WHERE id = ?
      LIMIT 1
    `,
      [bookId]
    );
    const row = Array.isArray(rows) ? rows[0] : null;
    if (row && Object.prototype.hasOwnProperty.call(row, "isDelete")) {
      row.isDelete = Boolean(Number(row.isDelete));
    }
    if (row && row.skinId != null) {
      row.skinId = Number(row.skinId);
    }
    return { ok: true, book: row };
  };

  try {
    return await runOnce();
  } catch (err) {
    const noTable =
      (err && err.code === "ER_NO_SUCH_TABLE") || (err && Number(err.errno) === 1146);
    if (noTable) {
      resetBooksTableCache();
      return runOnce();
    }
    throw err;
  }
}

async function listBooks(filters) {
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

  const creatorFilter =
    filters &&
    typeof filters.creatorUserId === "number" &&
    Number.isInteger(filters.creatorUserId) &&
    filters.creatorUserId >= 1
      ? filters.creatorUserId
      : null;

  if (creatorFilter === null) {
    return {
      books: [],
      total: 0,
      page,
      pageSize,
      totalPages: 0,
    };
  }

  const categoryTrim =
    filters &&
    filters.categoryName != null &&
    String(filters.categoryName).trim() !== ""
      ? String(filters.categoryName).trim()
      : null;

  const runOnce = async () => {
    await ensureBooksTable();
    const pool = getMysqlPool();

    const where = ["b.is_delete = 0", "b.creator_user_id = ?"];
    const params = [creatorFilter];

    if (categoryTrim !== null) {
      where.push("b.category_name = ?");
      params.push(categoryTrim);
    }

    const whereSql = `WHERE ${where.join(" AND ")}`;

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS cnt FROM books b ${whereSql}`,
      params
    );
    const total =
      Array.isArray(countRows) && countRows[0] && countRows[0].cnt != null
        ? Number(countRows[0].cnt)
        : 0;

    const offset = (page - 1) * pageSize;
    const [rows] = await pool.query(
      `
      SELECT
        b.id,
        b.creator_user_id AS creatorUserId,
        b.title,
        b.category_name AS categoryName,
        b.skin_id AS skinId,
        b.cover_url AS coverUrl,
        b.cover_thumb_url AS coverThumbUrl,
        b.is_delete AS isDelete,
        b.created_at AS createdAt,
        b.updated_at AS updatedAt,
        b.deleted_at AS deletedAt
      FROM books b
      ${whereSql}
      ORDER BY b.updated_at DESC, b.id DESC
      LIMIT ? OFFSET ?
    `,
      [...params, pageSize, offset]
    );

    const list = Array.isArray(rows) ? rows : [];
    for (const row of list) {
      if (row && Object.prototype.hasOwnProperty.call(row, "isDelete")) {
        row.isDelete = Boolean(Number(row.isDelete));
      }
      if (row && row.skinId != null) {
        row.skinId = Number(row.skinId);
      }
    }

    const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);

    return {
      books: list,
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
      resetBooksTableCache();
      return runOnce();
    }
    throw err;
  }
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
  const viewerUserId =
    filters && typeof filters.viewerUserId === "number" && Number.isInteger(filters.viewerUserId)
      ? filters.viewerUserId
      : null;

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
    if (viewerUserId !== null && viewerUserId > 0) {
      await ensureUserSkinsTable();
    }
    const pool = getMysqlPool();

    const where = [];
    const params = [];

    if (typeFilter !== null) {
      where.push("s.type = ?");
      params.push(typeFilter);
    }

    if (creator && creator.kind === "eq") {
      where.push("s.creator_user_id = ?");
      params.push(creator.value);
    } else if (creator && creator.kind === "null") {
      where.push("s.creator_user_id IS NULL");
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS cnt FROM skins s ${whereSql}`,
      params
    );
    const total =
      Array.isArray(countRows) && countRows[0] && countRows[0].cnt != null
        ? Number(countRows[0].cnt)
        : 0;

    const offset = (page - 1) * pageSize;
    const collectedSelect =
      viewerUserId !== null && viewerUserId > 0
        ? `
        EXISTS(
          SELECT 1
          FROM user_skins us
          WHERE us.user_id = ? AND us.skin_id = s.id
          LIMIT 1
        ) AS isCollected
      `
        : "0 AS isCollected";

    const dataSql = `
      SELECT
        s.id,
        s.name,
        s.type,
        s.price,
        s.is_member_exclusive AS isMemberExclusive,
        s.image_url AS imageUrl,
        s.thumb_url AS thumbUrl,
        s.creator_user_id AS creatorUserId,
        s.created_at AS createdAt,
        ${collectedSelect}
      FROM skins s
      ${whereSql}
      ORDER BY s.id DESC
      LIMIT ? OFFSET ?
    `;

    const dataParams =
      viewerUserId !== null && viewerUserId > 0
        ? [viewerUserId, ...params, pageSize, offset]
        : [...params, pageSize, offset];
    const [rows] = await pool.query(dataSql, dataParams);
    const list = Array.isArray(rows) ? rows : [];
    for (const row of list) {
      if (row && Object.prototype.hasOwnProperty.call(row, "isMemberExclusive")) {
        row.isMemberExclusive = Boolean(Number(row.isMemberExclusive));
      }
      if (row && Object.prototype.hasOwnProperty.call(row, "type")) {
        row.type = Number(row.type);
      }
      if (row && Object.prototype.hasOwnProperty.call(row, "isCollected")) {
        row.isCollected = Boolean(Number(row.isCollected));
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

async function listSystemSkins(filters) {
  return listSkins({
    ...(filters || {}),
    creatorUserIdFilter: { kind: "null" },
  });
}

async function addSkinToUserGallery({ userId, skinId }) {
  const runOnce = async () => {
    await ensureSkinsTable();
    await ensureUserSkinsTable();
    const pool = getMysqlPool();

    const [skinRows] = await pool.query(
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
      [skinId]
    );
    const skin = Array.isArray(skinRows) ? skinRows[0] : null;
    if (!skin) return { notFound: true };

    if (Object.prototype.hasOwnProperty.call(skin, "isMemberExclusive")) {
      skin.isMemberExclusive = Boolean(Number(skin.isMemberExclusive));
    }
    if (Object.prototype.hasOwnProperty.call(skin, "type")) {
      skin.type = Number(skin.type);
    }

    const [result] = await pool.query(
      `
      INSERT INTO user_skins (user_id, skin_id)
      VALUES (?, ?)
    `,
      [userId, skinId]
    );
    const insertedId = result && result.insertId ? Number(result.insertId) : 0;

    const [rows] = await pool.query(
      `
      SELECT
        us.id,
        us.user_id AS userId,
        us.skin_id AS skinId,
        us.created_at AS createdAt
      FROM user_skins us
      WHERE us.id = ?
      LIMIT 1
    `,
      [insertedId]
    );
    const row = Array.isArray(rows) ? rows[0] : null;
    return { row, skin };
  };

  try {
    return await runOnce();
  } catch (err) {
    const noTable =
      (err && err.code === "ER_NO_SUCH_TABLE") || (err && Number(err.errno) === 1146);
    if (noTable) {
      resetSkinsTableCache();
      resetUserSkinsTableCache();
      return runOnce();
    }
    throw err;
  }
}

async function listUserGallerySkins({ userId, type, page, pageSize }) {
  const typeFilter = typeof type === "number" && Number.isInteger(type) ? type : null;
  const p = Number.isInteger(page) && page >= 1 ? page : 1;
  const ps = Number.isInteger(pageSize) && pageSize >= 1 && pageSize <= 100 ? pageSize : 20;

  const runOnce = async () => {
    await ensureSkinsTable();
    await ensureUserSkinsTable();
    const pool = getMysqlPool();

    const where = ["us.user_id = ?"];
    const params = [userId];
    if (typeFilter !== null) {
      where.push("s.type = ?");
      params.push(typeFilter);
    }
    const whereSql = `WHERE ${where.join(" AND ")}`;

    const [countRows] = await pool.query(
      `
      SELECT COUNT(*) AS cnt
      FROM user_skins us
      INNER JOIN skins s ON s.id = us.skin_id
      ${whereSql}
    `,
      params
    );
    const total =
      Array.isArray(countRows) && countRows[0] && countRows[0].cnt != null
        ? Number(countRows[0].cnt)
        : 0;

    const offset = (p - 1) * ps;
    const [rows] = await pool.query(
      `
      SELECT
        us.id AS userSkinId,
        us.created_at AS addedAt,
        s.id,
        s.name,
        s.type,
        s.price,
        s.is_member_exclusive AS isMemberExclusive,
        s.image_url AS imageUrl,
        s.thumb_url AS thumbUrl,
        s.creator_user_id AS creatorUserId,
        s.created_at AS createdAt
      FROM user_skins us
      INNER JOIN skins s ON s.id = us.skin_id
      ${whereSql}
      ORDER BY us.id DESC
      LIMIT ? OFFSET ?
    `,
      [...params, ps, offset]
    );

    const skins = Array.isArray(rows) ? rows : [];
    for (const row of skins) {
      if (row && Object.prototype.hasOwnProperty.call(row, "isMemberExclusive")) {
        row.isMemberExclusive = Boolean(Number(row.isMemberExclusive));
      }
      if (row && Object.prototype.hasOwnProperty.call(row, "type")) {
        row.type = Number(row.type);
      }
    }

    return {
      skins,
      total,
      page: p,
      pageSize: ps,
      totalPages: total === 0 ? 0 : Math.ceil(total / ps),
    };
  };

  try {
    return await runOnce();
  } catch (err) {
    const noTable =
      (err && err.code === "ER_NO_SUCH_TABLE") || (err && Number(err.errno) === 1146);
    if (noTable) {
      resetSkinsTableCache();
      resetUserSkinsTableCache();
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
  await ensureUserSkinsTable();
  await ensureBooksTable();
}

async function deleteSkinByOwner({ skinId, ownerUserId }) {
  const runOnce = async () => {
    await ensureSkinsTable();
    await ensureUserSkinsTable();
    const pool = getMysqlPool();

    const [skinRows] = await pool.query(
      `
      SELECT
        id,
        image_url AS imageUrl,
        thumb_url AS thumbUrl,
        creator_user_id AS creatorUserId
      FROM skins
      WHERE id = ?
      LIMIT 1
    `,
      [skinId]
    );
    const skin = Array.isArray(skinRows) ? skinRows[0] : null;
    if (!skin) {
      return { notFound: true };
    }

    const creatorId =
      skin.creatorUserId === null || skin.creatorUserId === undefined
        ? null
        : Number(skin.creatorUserId);
    const owner = Number(ownerUserId);
    if (creatorId === null || !Number.isFinite(owner) || creatorId !== owner) {
      return { forbidden: true };
    }

    await pool.query(`DELETE FROM user_skins WHERE skin_id = ?`, [skinId]);
    const [delResult] = await pool.query(
      `DELETE FROM skins WHERE id = ? AND creator_user_id = ?`,
      [skinId, owner]
    );
    const affected =
      delResult && delResult.affectedRows != null ? Number(delResult.affectedRows) : 0;
    return {
      removed: affected > 0,
      imageUrl: skin.imageUrl,
      thumbUrl: skin.thumbUrl,
    };
  };

  try {
    return await runOnce();
  } catch (err) {
    const noTable =
      (err && err.code === "ER_NO_SUCH_TABLE") || (err && Number(err.errno) === 1146);
    if (noTable) {
      resetSkinsTableCache();
      resetUserSkinsTableCache();
      return runOnce();
    }
    throw err;
  }
}

async function removeUserGallerySkin({ userId, userSkinId }) {
  const runOnce = async () => {
    await ensureUserSkinsTable();
    const pool = getMysqlPool();
    const [result] = await pool.query(
      `
      DELETE FROM user_skins
      WHERE id = ? AND user_id = ?
    `,
      [userSkinId, userId]
    );
    const affected =
      result && result.affectedRows != null ? Number(result.affectedRows) : 0;
    return { removed: affected > 0 };
  };

  try {
    return await runOnce();
  } catch (err) {
    const noTable =
      (err && err.code === "ER_NO_SUCH_TABLE") || (err && Number(err.errno) === 1146);
    if (noTable) {
      resetUserSkinsTableCache();
      return runOnce();
    }
    throw err;
  }
}

module.exports = {
  getMysqlPool,
  ensureUsersTable,
  ensureCategoriesTable,
  ensureSkinsTable,
  ensureUserSkinsTable,
  ensureBooksTable,
  insertCategory,
  insertBook,
  softDeleteBookByOwner,
  touchBookUpdatedAtByOwner,
  listBooks,
  listCategoriesByCreatorUserId,
  insertSkin,
  listSkins,
  listSystemSkins,
  addSkinToUserGallery,
  listUserGallerySkins,
  removeUserGallerySkin,
  deleteSkinByOwner,
  upsertAppleUser,
  initDatabaseIfConfigured,
};
