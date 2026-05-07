const fs = require("fs").promises;
const path = require("path");
const { sendJson, getBearerToken } = require("../utils/http");
const { verifyAppJwt } = require("../services/jwt");
const { deleteUserWithRelations } = require("../services/db");

function getPathname(url) {
  if (!url) return "";
  const q = url.indexOf("?");
  return q === -1 ? url : url.slice(0, q);
}

function diskPathFromPublicUrl(fullUrl) {
  if (!fullUrl || typeof fullUrl !== "string") return null;
  const marker = "/uploads/";
  const i = fullUrl.indexOf(marker);
  if (i === -1) return null;
  const rel = fullUrl.slice(i + marker.length).replace(/^\/+/, "");
  return path.join(process.cwd(), process.env.UPLOAD_ROOT || "uploads", rel);
}

async function safeUnlink(filePath) {
  if (!filePath) return;
  try {
    await fs.unlink(filePath);
  } catch (err) {
    if (err && err.code !== "ENOENT") throw err;
  }
}

async function handleDeleteUser(req, res) {
  if (!(req.method === "POST" && getPathname(req.url) === "/users/delete")) return false;

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

  const userId = Number(payload.sub);
  if (!Number.isFinite(userId) || userId <= 0) {
    sendJson(res, 401, { error: "Invalid token subject" });
    return true;
  }

  try {
    const result = await deleteUserWithRelations({ userId });
    if (result.notFound) {
      sendJson(res, 404, { error: "User not found" });
      return true;
    }

    const files = Array.isArray(result.files) ? result.files : [];
    for (const f of files) {
      await safeUnlink(diskPathFromPublicUrl(f && f.imageUrl));
      await safeUnlink(diskPathFromPublicUrl(f && f.thumbUrl));
    }

    sendJson(res, 200, {
      ok: true,
      removed: result.removed || {},
    });
  } catch (err) {
    sendJson(res, 500, {
      error: "Failed to delete user",
      detail: err && err.message ? err.message : String(err),
    });
  }

  return true;
}

module.exports = {
  handleDeleteUser,
};
