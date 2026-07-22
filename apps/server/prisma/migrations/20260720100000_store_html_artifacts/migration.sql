ALTER TABLE "Asset" RENAME COLUMN "content" TO "html";
ALTER TABLE "Wireframe" RENAME COLUMN "content" TO "html";
ALTER TABLE "Design" RENAME COLUMN "content" TO "html";

-- Legacy mock rows were plain text. Preserve their meaning inside standalone HTML
-- so every row follows the same contract as new MCP writes.
UPDATE "Asset"
SET "html" =
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' ||
  replace(replace(replace("title", '&', '&amp;'), '<', '&lt;'), '>', '&gt;') ||
  '</title><style>:root{color-scheme:light;--canvas:#f7f7f3;--ink:#171b2a;--brand:#3559c7}*{box-sizing:border-box}body{margin:0;padding:32px;background:var(--canvas);color:var(--ink);font:14px/1.6 system-ui,sans-serif}main{max-width:760px;margin:auto}header{border-bottom:1px solid #d9d9d4;padding-bottom:16px}small{color:var(--brand);font-weight:700;letter-spacing:.12em}pre{padding:20px;border:1px solid #d9d9d4;border-radius:10px;background:#fff;white-space:pre-wrap;overflow-wrap:anywhere}</style></head><body><main data-harness-artifact="asset"><header><small>ASSET</small><h1>' ||
  replace(replace(replace("title", '&', '&amp;'), '<', '&lt;'), '>', '&gt;') ||
  '</h1></header><section aria-label="Design resources"><pre>' ||
  replace(replace(replace(replace("html", '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '\n', char(10)) ||
  '</pre></section></main></body></html>'
WHERE lower(ltrim("html")) NOT LIKE '<!doctype html>%';

UPDATE "Wireframe"
SET "html" =
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' ||
  replace(replace(replace("title", '&', '&amp;'), '<', '&lt;'), '>', '&gt;') ||
  '</title><style>*{box-sizing:border-box}body{margin:0;padding:24px;background:#f4f4f0;color:#1c1c1c;font:14px/1.5 system-ui,sans-serif}main{max-width:760px;margin:auto}nav{display:flex;gap:8px;margin:20px 0}a,summary{cursor:pointer;border:1px solid #aaa;border-radius:6px;padding:8px 12px;background:#fff;color:inherit;text-decoration:none}pre{padding:18px;border:1px dashed #999;background:#fff;white-space:pre-wrap;overflow-wrap:anywhere}</style></head><body><main data-harness-artifact="wireframe"><h1>' ||
  replace(replace(replace("title", '&', '&amp;'), '<', '&lt;'), '>', '&gt;') ||
  '</h1><nav aria-label="User journey"><a href="#step-1">Start</a><a href="#step-2">Next step</a></nav><section id="step-1" data-journey-step="1"><h2>Journey structure</h2><pre>' ||
  replace(replace(replace(replace("html", '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '\n', char(10)) ||
  '</pre></section><details id="step-2" data-journey-step="2"><summary>Continue journey</summary><p>Validate the next user action from this state.</p></details></main></body></html>'
WHERE lower(ltrim("html")) NOT LIKE '<!doctype html>%';

UPDATE "Design"
SET "html" =
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' ||
  replace(replace(replace("title", '&', '&amp;'), '<', '&lt;'), '>', '&gt;') ||
  '</title><style>:root{color-scheme:light;--canvas:#f7f7f3;--surface:#fff;--ink:#171b2a;--brand:#3559c7}*{box-sizing:border-box}body{margin:0;background:var(--canvas);color:var(--ink);font:14px/1.6 system-ui,sans-serif}.shell{max-width:920px;margin:40px auto;padding:28px;border:1px solid #d9d9d4;border-radius:14px;background:var(--surface);box-shadow:0 10px 30px #1111}.eyebrow{color:var(--brand);font-size:11px;font-weight:700;letter-spacing:.14em}.content{margin-top:24px;white-space:pre-wrap}</style></head><body><main class="shell" data-harness-artifact="design" data-wireframe-id="' ||
  "wireframeId" || '" data-asset-id="' || "assetId" || '"><p class="eyebrow">DESIGN</p><h1>' ||
  replace(replace(replace("title", '&', '&amp;'), '<', '&lt;'), '>', '&gt;') ||
  '</h1><section class="content" aria-label="Applied design">' ||
  replace(replace(replace(replace("html", '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '\n', '<br>') ||
  '</section></main></body></html>'
WHERE lower(ltrim("html")) NOT LIKE '<!doctype html>%';
