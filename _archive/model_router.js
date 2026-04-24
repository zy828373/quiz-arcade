const http = require('http');
const fs = require('fs');
const path = require('path');

// 加载配置
const configPath = path.join(__dirname, 'router_config.json');
let config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// 热重载配置
fs.watchFile(configPath, () => {
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    log('配置已热重载');
  } catch (e) { log('配置重载失败: ' + e.message); }
});

function log(msg) {
  const ts = new Date().toLocaleString('zh-CN', { hour12: false });
  console.log(`[${ts}] ${msg}`);
}

// 转发请求
function proxyRequest(poolName, req, body, res) {
  const pool = config.pools[poolName];
  const url = new URL(req.url, pool.baseUrl);

  const headers = { ...req.headers };
  headers['host'] = url.host;
  headers['authorization'] = `Bearer ${pool.apiKey}`;
  delete headers['content-length'];

  const proxyReq = http.request({
    hostname: url.hostname,
    port: url.port,
    path: url.pathname + url.search,
    method: req.method,
    headers: headers,
    timeout: config.requestTimeout || 120000
  }, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    log(`  [${poolName}] 连接失败: ${err.message}`);
    res.writeHead(502);
    res.end(JSON.stringify({ error: { message: `Pool ${poolName} unavailable` } }));
  });

  proxyReq.on('timeout', () => {
    log(`  [${poolName}] 超时`);
    proxyReq.destroy();
    res.writeHead(504);
    res.end(JSON.stringify({ error: { message: 'Gateway Timeout' } }));
  });

  if (body) proxyReq.write(body);
  proxyReq.end();
}

// 获取模型列表
async function getModels(req, res) {
  const pool = config.pools.team;
  const url = new URL('/v1/models', pool.baseUrl);

  const r = http.get({
    hostname: url.hostname, port: url.port, path: url.pathname,
    headers: { 'Authorization': `Bearer ${pool.apiKey}` },
    timeout: 10000
  }, (resp) => {
    res.writeHead(resp.statusCode, resp.headers);
    resp.pipe(res);
  });
  r.on('error', () => {
    res.writeHead(502);
    res.end(JSON.stringify({ error: { message: 'Team pool unavailable' } }));
  });
  r.on('timeout', () => { r.destroy(); res.writeHead(504); res.end('Timeout'); });
}

// 主服务器
const server = http.createServer((req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // 健康检查
  if (req.url === '/health') {
    res.writeHead(200); res.end('OK'); return;
  }

  // 模型列表
  if (req.url === '/v1/models' && req.method === 'GET') {
    getModels(req, res); return;
  }

  // 所有请求转发到 Team 号池
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    let model = null;
    try { model = JSON.parse(body).model; } catch {}

    log(`→ ${req.method} ${req.url} | model=${model || 'N/A'} | 路由=team`);
    proxyRequest('team', req, body, res);
  });
});

server.listen(config.port, '0.0.0.0', () => {
  log('='.repeat(50));
  log(`统一路由代理已启动 → http://0.0.0.0:${config.port}`);
  log(`Team 号池: ${config.pools.team.baseUrl}`);
  log('='.repeat(50));
});
