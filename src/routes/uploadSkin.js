const fs = require("fs").promises;
const path = require("path");
const crypto = require("crypto");
const busboy = require("busboy");
const sharp = require("sharp");
const { sendJson, getBearerToken } = require("../utils/http");
const { verifyAppJwt } = require("../services/jwt");
const { insertSkin } = require("../services/db");

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const THUMB_MAX = 320;

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

function getPathname(url) {
  if (!url) return "";
  const q = url.indexOf("?");
  return q === -1 ? url : url.slice(0, q);
}

function isPlaceholderPublicBaseUrl(b) {
  if (!b || typeof b !== "string" || !b.trim()) return true;
  const t = b.trim();
  try {
    const u = new URL(t);
    return u.hostname.toLowerCase() === "your-domain.com";
  } catch {
    return /your-domain\.com/i.test(t);
  }
}

/**
 * 生成写入数据库的对外图片基地址。
 * - 若配置了有效 PUBLIC_BASE_URL（且不是示例 your-domain.com），优先使用。
 * - 否则用当前请求的 Host / X-Forwarded-Proto（适合反代）；无 Host 时回退 127.0.0.1:PORT。
 */
function publicBaseUrl(req) {
  const b = process.env.PUBLIC_BASE_URL;
  if (b && typeof b === "string" && b.trim() && !isPlaceholderPublicBaseUrl(b)) {
    return b.trim().replace(/\/$/, "");
  }

  const xfProto = req.headers["x-forwarded-proto"];
  let proto = "http";
  if (xfProto && typeof xfProto === "string") {
    const p = xfProto.split(",")[0].trim().toLowerCase();
    if (p === "https" || p === "http") proto = p;
  } else if (req.socket && req.socket.encrypted) {
    proto = "https";
  }

  const host = (req.headers.host || "").trim();
  if (!host) {
    const port = Number(process.env.PORT || 3000);
    return `http://127.0.0.1:${port}`;
  }
  return `${proto}://${host}`;
}

function parseBool(v) {
  if (v === undefined || v === null) return false;
  const s = String(v).trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

/** @returns {{ ok: true, value: number | null } | { ok: false, error: string }} */
function parseOptionalCreatorUserId(raw) {
  if (raw === undefined || raw === null) {
    return { ok: true, value: null };
  }
  const s = String(raw).trim();
  if (s === "" || s.toLowerCase() === "null") {
    return { ok: true, value: null };
  }
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) {
    return { ok: false, error: "Invalid creatorUserId (positive integer, or leave empty)" };
  }
  return { ok: true, value: n };
}

function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const fields = {};
    let fileBuffer = null;
    let fileMime = "";
    let fileExt = ".jpg";
    let gotFile = false;

    const bb = busboy({
      headers: req.headers,
      limits: { fileSize: MAX_FILE_BYTES },
    });

    bb.on("file", (name, file, info) => {
      if (name !== "image" && name !== "file") {
        file.resume();
        return;
      }
      if (gotFile) {
        file.resume();
        return;
      }
      gotFile = true;
      const chunks = [];
      file.on("data", (d) => chunks.push(d));
      file.on("limit", () => {
        file.resume();
        reject(Object.assign(new Error("FILE_TOO_LARGE"), { code: "FILE_TOO_LARGE" }));
      });
      file.on("end", () => {
        fileBuffer = Buffer.concat(chunks);
        fileMime = (info && info.mimeType) || "";
        const base = path.basename((info && info.filename) || "image");
        const ext = path.extname(base).toLowerCase();
        if ([".jpg", ".jpeg", ".png", ".gif", ".webp"].includes(ext)) {
          fileExt = ext === ".jpeg" ? ".jpg" : ext;
        }
      });
    });

    bb.on("field", (name, val) => {
      fields[name] = val;
    });

    bb.on("error", reject);
    bb.on("close", () => {
      resolve({ fields, fileBuffer, fileMime, fileExt });
    });

    req.pipe(bb);
  });
}

async function handleUploadSkin(req, res) {
  if (!(req.method === "POST" && getPathname(req.url) === "/skins")) return false;

  const token = getBearerToken(req);
  if (!token) {
    sendJson(res, 401, { error: "Missing Authorization: Bearer <token>" });
    return true;
  }

  let payload;
  try {
    payload = verifyAppJwt(token);
  } catch (err) {
    const detail = err && err.message ? err.message : String(err);
    sendJson(res, 401, { error: "Invalid or expired token", detail });
    return true;
  }

  const sub = Number(payload.sub);
  if (!Number.isFinite(sub) || sub <= 0) {
    sendJson(res, 401, { error: "Invalid token subject" });
    return true;
  }

  const ct = req.headers["content-type"] || "";
  if (!ct.toLowerCase().includes("multipart/form-data")) {
    sendJson(res, 400, { error: "Content-Type must be multipart/form-data" });
    return true;
  }

  let parsed;
  try {
    parsed = await parseMultipart(req);
  } catch (err) {
    if (err && err.code === "FILE_TOO_LARGE") {
      sendJson(res, 413, { error: "Image file too large", maxBytes: MAX_FILE_BYTES });
      return true;
    }
    sendJson(res, 400, {
      error: "Failed to parse multipart body",
      detail: err && err.message ? err.message : String(err),
    });
    return true;
  }

  const { fields, fileBuffer, fileMime, fileExt } = parsed;

  if (!fileBuffer || fileBuffer.length === 0) {
    sendJson(res, 400, { error: "Missing image file (field name: image or file)" });
    return true;
  }

  const mime = (fileMime || "").toLowerCase().split(";")[0].trim();
  if (!ALLOWED_MIME.has(mime)) {
    sendJson(res, 400, { error: "Unsupported image type", mime: fileMime || null });
    return true;
  }

  const name = fields.name != null ? String(fields.name).trim() : "";
  const typeStr = fields.type != null ? String(fields.type).trim() : "";
  if (!name) {
    sendJson(res, 400, { error: "Missing or empty field: name" });
    return true;
  }

  let type;
  if (!typeStr) {
    type = 0;
  } else {
    const typeNum = Number.parseInt(typeStr, 10);
    if (
      !Number.isInteger(typeNum) ||
      typeNum < -32768 ||
      typeNum > 32767
    ) {
      sendJson(res, 400, {
        error: "Invalid field: type (SMALLINT integer, range -32768 .. 32767)",
      });
      return true;
    }
    type = typeNum;
  }

  const priceRaw = fields.price;
  let price;
  if (priceRaw === undefined || priceRaw === null || priceRaw === "") {
    price = 0;
  } else {
    price = Number.parseFloat(String(priceRaw).trim());
    if (!Number.isFinite(price) || price < 0) {
      sendJson(res, 400, { error: "Invalid field: price (non-negative number required)" });
      return true;
    }
  }

  const isMemberExclusive = parseBool(fields.is_member_exclusive);

  const creatorRaw =
    fields.creatorUserId !== undefined
      ? fields.creatorUserId
      : fields.creator_user_id !== undefined
        ? fields.creator_user_id
        : undefined;
  const parsedCreator = parseOptionalCreatorUserId(creatorRaw);
  if (!parsedCreator.ok) {
    sendJson(res, 400, { error: parsedCreator.error });
    return true;
  }
  const creatorUserId = parsedCreator.value;

  const id = crypto.randomUUID();
  const uploadRoot = path.join(process.cwd(), process.env.UPLOAD_ROOT || "uploads");
  const origDir = path.join(uploadRoot, "skins", "orig");
  const thumbDir = path.join(uploadRoot, "skins", "thumb");
  await fs.mkdir(origDir, { recursive: true });
  await fs.mkdir(thumbDir, { recursive: true });

  const origName = `${id}${fileExt}`;
  const thumbName = `${id}.jpg`;
  const origPath = path.join(origDir, origName);
  const thumbPath = path.join(thumbDir, thumbName);

  const base = publicBaseUrl(req);
  const imageUrl = `${base}/uploads/skins/orig/${origName}`;
  const thumbUrl = `${base}/uploads/skins/thumb/${thumbName}`;

  await fs.writeFile(origPath, fileBuffer);

  try {
    await sharp(fileBuffer)
      .rotate()
      .resize(THUMB_MAX, THUMB_MAX, { fit: "inside" })
      .jpeg({ quality: 82 })
      .toFile(thumbPath);
  } catch (err) {
    await fs.unlink(origPath).catch(() => {});
    sendJson(res, 400, {
      error: "Could not process image",
      detail: err && err.message ? err.message : String(err),
    });
    return true;
  }

  try {
    const row = await insertSkin({
      name,
      type,
      price,
      isMemberExclusive,
      imageUrl,
      thumbUrl,
      creatorUserId,
    });
    if (!row) {
      await fs.unlink(origPath).catch(() => {});
      await fs.unlink(thumbPath).catch(() => {});
      sendJson(res, 500, { error: "Failed to save skin" });
      return true;
    }
    sendJson(res, 200, { skin: row });
  } catch (err) {
    await fs.unlink(origPath).catch(() => {});
    await fs.unlink(thumbPath).catch(() => {});
    sendJson(res, 500, {
      error: "Failed to save skin",
      detail: err && err.message ? err.message : String(err),
    });
  }

  return true;
}

module.exports = {
  handleUploadSkin,
};
