const fs = require("fs");
const path = require("path");

function getPathname(url) {
  if (!url) return "";
  const q = url.indexOf("?");
  return q === -1 ? url : url.slice(0, q);
}

async function handleSupportPage(req, res) {
  if (req.method !== "GET") return false;
  if (getPathname(req.url) !== "/support") return false;

  const htmlPath = path.join(__dirname, "..", "..", "public", "support.html");

  try {
    const data = await fs.promises.readFile(htmlPath, "utf8");
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    });
    res.end(data);
  } catch (err) {
    console.error(err);
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Failed to load support page");
  }

  return true;
}

module.exports = {
  handleSupportPage,
};
