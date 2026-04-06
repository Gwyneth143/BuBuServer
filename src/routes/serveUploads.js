const fs = require("fs");
const path = require("path");

const MIME = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

function getPathname(url) {
  if (!url) return "";
  const q = url.indexOf("?");
  return q === -1 ? url : url.slice(0, q);
}

function handleServeUploads(req, res) {
  if (req.method !== "GET") return false;

  const pathname = getPathname(req.url);
  if (!pathname.startsWith("/uploads/")) return false;

  const root = path.resolve(process.cwd(), process.env.UPLOAD_ROOT || "uploads");
  const rel = pathname.replace(/^\/uploads\/?/, "");
  if (!rel || rel.includes("..")) {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Bad Request");
    return true;
  }

  const candidate = path.resolve(root, rel);
  if (candidate !== root && !candidate.startsWith(root + path.sep)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return true;
  }

  fs.stat(candidate, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not Found");
      return;
    }
    const ext = path.extname(candidate).toLowerCase();
    const ct = MIME[ext] || "application/octet-stream";
    res.writeHead(200, {
      "Content-Type": ct,
      "Cache-Control": "public, max-age=86400",
    });
    fs.createReadStream(candidate).pipe(res);
  });

  return true;
}

module.exports = {
  handleServeUploads,
};
