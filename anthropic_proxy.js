const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ========== 配置（从 proxy_config.json 读取） ==========
const CONFIG_PATH = path.join(__dirname, 'proxy_config.json');
const LOG_PATH = path.join(__dirname, 'anthropic_proxy.log');
let config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

// 热重载配置
fs.watchFile(CONFIG_PATH, { interval: 5000 }, () => {
  try {
    config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    log('配置已热重载');
  } catch (e) { log('配置重载失败: ' + e.message); }
});

const PROXY_PORT = config.proxyPort || 8320;
const TEAM_POOL_HOST = config.teamPoolHost || 'localhost';
const TEAM_POOL_PORT = config.teamPoolPort || 8317;
const TEAM_POOL_API_KEY = config.teamPoolApiKey || 'team-api-key-1';
const ACCEPTED_API_KEYS = config.acceptedApiKeys || ['team-api-key-1'];
const REQUEST_TIMEOUT = config.requestTimeout || 300000;

// ========== 模型动态映射表 ==========
const DEFAULT_MODEL_MAP = {
  'best':                       'gpt-5.5',
  'opus':                       'gpt-5.5',
  'sonnet':                     'gpt-5.5',
  'haiku':                      'gpt-5.5',
  'claude-opus-4-7':            'gpt-5.5',
  'claude-opus-4-6':             'gpt-5.5',
  'claude-opus-4-6-20260320':    'gpt-5.5',
  'claude-opus-4-5':             'gpt-5.5',
  'claude-opus-4-5-20250514':    'gpt-5.5',
  'claude-sonnet-4-6':           'gpt-5.5',
  'claude-sonnet-4-6-20260320':  'gpt-5.5',
  'claude-sonnet-4-5':           'gpt-5.5',
  'claude-sonnet-4-5-20250514':  'gpt-5.5',
  'claude-haiku-4-5':            'gpt-5.5',
  'claude-haiku-4-5-20251001':   'gpt-5.5',
};

const MODEL_PREFIX_MAP = [
  { prefix: 'claude-opus',   target: 'gpt-5.5' },
  { prefix: 'claude-sonnet', target: 'gpt-5.5' },
  { prefix: 'claude-haiku',  target: 'gpt-5.5' },
];

const DEFAULT_REASONING_EFFORT_MAP = {
  'best':                       'xhigh',
  'opus':                       'xhigh',
  'sonnet':                     'high',
  'haiku':                      'low',
  'claude-opus-4-7':            'xhigh',
  'claude-opus-4-6':             'xhigh',
  'claude-opus-4-6-20260320':    'xhigh',
  'claude-opus-4-5':             'xhigh',
  'claude-opus-4-5-20250514':    'xhigh',
  'claude-sonnet-4-6':           'high',
  'claude-sonnet-4-6-20260320':  'high',
  'claude-sonnet-4-5':           'high',
  'claude-sonnet-4-5-20250514':  'high',
  'claude-haiku-4-5':            'low',
  'claude-haiku-4-5-20251001':   'low',
};

const REASONING_EFFORT_PREFIX_MAP = [
  { prefix: 'claude-opus',   effort: 'xhigh' },
  { prefix: 'claude-sonnet', effort: 'high' },
  { prefix: 'claude-haiku',  effort: 'low' },
];

function resolveTargetModel(claudeModel) {
  const modelMap = config.modelMap || DEFAULT_MODEL_MAP;
  if (modelMap[claudeModel]) return modelMap[claudeModel];
  for (const rule of MODEL_PREFIX_MAP) {
    if (claudeModel.startsWith(rule.prefix)) return rule.target;
  }
  return config.targetModel || 'gpt-5.5';
}

function resolveReasoningEffort(claudeModel) {
  if (config.enableReasoningEffort === false) return undefined;

  const effortMap = config.reasoningEffortMap || DEFAULT_REASONING_EFFORT_MAP;
  if (effortMap[claudeModel]) return effortMap[claudeModel];

  for (const rule of REASONING_EFFORT_PREFIX_MAP) {
    if (claudeModel.startsWith(rule.prefix)) return rule.effort;
  }

  return config.defaultReasoningEffort;
}

function log(msg) {
  const ts = new Date().toLocaleString('zh-CN', { hour12: false });
  const line = `[${ts}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG_PATH, line + '\n'); } catch {}
}

// ========== Anthropic → OpenAI 请求转换（含tool_use完整支持） ==========
function convertAnthropicToOpenAI(body) {
  const messages = [];

  // 提取system消息
  if (body.system) {
    if (typeof body.system === 'string') {
      messages.push({ role: 'system', content: body.system });
    } else if (Array.isArray(body.system)) {
      const text = body.system.map(b => b.text || '').join('\n');
      messages.push({ role: 'system', content: text });
    }
  }

  // 转换messages（含tool_use和tool_result的完整处理）
  if (body.messages) {
    for (const msg of body.messages) {
      const content = msg.content;

      if (typeof content === 'string') {
        // 简单字符串消息
        messages.push({ role: msg.role, content: content });
        continue;
      }

      if (!Array.isArray(content)) {
        messages.push({ role: msg.role, content: content || '' });
        continue;
      }

      // content是数组 — 可能包含text、tool_use、tool_result等块
      if (msg.role === 'assistant') {
        // === Assistant消息：提取text + tool_use ===
        const textParts = [];
        const toolCalls = [];

        for (const block of content) {
          if (block.type === 'text' && block.text) {
            textParts.push(block.text);
          } else if (block.type === 'tool_use') {
            // Anthropic tool_use → OpenAI tool_calls
            toolCalls.push({
              id: block.id,
              type: 'function',
              function: {
                name: block.name,
                arguments: typeof block.input === 'string'
                  ? block.input
                  : JSON.stringify(block.input || {}),
              },
            });
          }
        }

        const assistantMsg = { role: 'assistant', content: textParts.join('\n') || null };
        if (toolCalls.length > 0) {
          assistantMsg.tool_calls = toolCalls;
        }
        messages.push(assistantMsg);

      } else if (msg.role === 'user') {
        // === User消息：可能包含tool_result ===
        const textParts = [];
        const toolResults = [];

        for (const block of content) {
          if (block.type === 'text' && block.text) {
            textParts.push(block.text);
          } else if (block.type === 'tool_result') {
            toolResults.push(block);
          }
        }

        // 先插入tool result消息（OpenAI格式用role: "tool"）
        for (const tr of toolResults) {
          let resultContent = '';
          if (typeof tr.content === 'string') {
            resultContent = tr.content;
          } else if (Array.isArray(tr.content)) {
            resultContent = tr.content
              .map(b => {
                if (b.type === 'text') return b.text;
                if (typeof b === 'string') return b;
                try { return JSON.stringify(b); } catch { return String(b); }
              })
              .join('\n');
          } else if (tr.content && typeof tr.content === 'object') {
            try { resultContent = JSON.stringify(tr.content); } catch { resultContent = String(tr.content); }
          }

          messages.push({
            role: 'tool',
            tool_call_id: tr.tool_use_id,
            content: resultContent || '',
          });
        }

        // 再插入普通文本部分（如果有的话）
        if (textParts.length > 0) {
          messages.push({ role: 'user', content: textParts.join('\n') });
        }

      } else {
        // 其他角色：提取text
        const text = content
          .filter(b => b.type === 'text')
          .map(b => b.text)
          .join('\n');
        messages.push({ role: msg.role, content: text || '' });
      }
    }
  }

  // 动态模型映射
  const requestedModel = body.model || 'unknown';
  const resolvedModel = resolveTargetModel(requestedModel);
  const reasoningEffort = resolveReasoningEffort(requestedModel);

  const openaiReq = {
    model: resolvedModel,
    messages: messages,
    stream: body.stream || false,
  };

  if (reasoningEffort) openaiReq.reasoning_effort = reasoningEffort;

  if (body.max_tokens) openaiReq.max_tokens = body.max_tokens;
  if (body.temperature !== undefined) openaiReq.temperature = body.temperature;
  if (body.top_p !== undefined) openaiReq.top_p = body.top_p;
  if (body.stop) openaiReq.stop = body.stop;

  // === Anthropic tools → OpenAI functions ===
  if (body.tools && Array.isArray(body.tools) && body.tools.length > 0) {
    openaiReq.tools = body.tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description || '',
        parameters: tool.input_schema || {},
      },
    }));
  }

  // === Anthropic tool_choice → OpenAI tool_choice ===
  if (body.tool_choice) {
    const tc = body.tool_choice;
    if (tc.type === 'auto') {
      openaiReq.tool_choice = 'auto';
    } else if (tc.type === 'any') {
      openaiReq.tool_choice = 'required';
    } else if (tc.type === 'tool' && tc.name) {
      openaiReq.tool_choice = {
        type: 'function',
        function: { name: tc.name },
      };
    } else {
      openaiReq.tool_choice = 'auto';
    }
  }

  return openaiReq;
}

// ========== OpenAI → Anthropic 非流式响应转换（含tool_calls） ==========
function convertOpenAIToAnthropic(openaiResp, model) {
  const choice = openaiResp.choices && openaiResp.choices[0];
  const message = choice?.message || {};
  const contentText = message.content || '';
  const toolCalls = message.tool_calls || null;
  const finishReason = choice?.finish_reason;

  // 构建Anthropic content块
  const content = [];

  // 添加text块
  if (contentText) {
    content.push({ type: 'text', text: contentText });
  }

  // 添加tool_use块（从OpenAI的tool_calls转换）
  if (toolCalls && Array.isArray(toolCalls)) {
    for (const tc of toolCalls) {
      const func = tc.function || {};
      let input = {};
      try {
        input = typeof func.arguments === 'string'
          ? JSON.parse(func.arguments)
          : (func.arguments || {});
      } catch {
        input = { raw: func.arguments || '' };
      }

      content.push({
        type: 'tool_use',
        id: tc.id || ('toolu_' + crypto.randomBytes(12).toString('hex')),
        name: func.name || '',
        input: input,
      });
    }
  }

  // 如果content为空，至少添加一个空text块
  if (content.length === 0) {
    content.push({ type: 'text', text: '' });
  }

  // 映射stop_reason
  let stopReason = 'end_turn';
  if (finishReason === 'length') stopReason = 'max_tokens';
  else if (finishReason === 'tool_calls') stopReason = 'tool_use';
  else if (finishReason === 'stop') stopReason = 'end_turn';

  return {
    id: 'msg_' + crypto.randomBytes(12).toString('hex'),
    type: 'message',
    role: 'assistant',
    content: content,
    model: model || openaiResp.model || 'unknown',
    stop_reason: stopReason,
    stop_sequence: null,
    usage: {
      input_tokens: openaiResp.usage?.prompt_tokens || 0,
      output_tokens: openaiResp.usage?.completion_tokens || 0,
    },
  };
}

// ========== OpenAI SSE → Anthropic SSE 流式转换（含tool_calls delta） ==========
function handleStreamingResponse(proxyRes, res, model) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const msgId = 'msg_' + crypto.randomBytes(12).toString('hex');
  let inputTokens = 0;
  let outputTokens = 0;
  let sentStart = false;
  let currentBlockIndex = 0;
  let sentTextBlockStart = false;

  // 追踪tool_call的状态
  const toolCallState = {}; // { index: { id, name, arguments } }
  let toolBlockStartIndex = 1; // text块占0号，tool从1号开始

  function sendSSE(event, data) {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  function ensureMessageStart() {
    if (!sentStart) {
      sendSSE('message_start', {
        type: 'message_start',
        message: {
          id: msgId,
          type: 'message',
          role: 'assistant',
          content: [],
          model: model || 'unknown',
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: inputTokens, output_tokens: 0 },
        },
      });
      sentStart = true;
    }
  }

  let buffer = '';

  proxyRes.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop(); // 保留未完成的行

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;

      const dataStr = trimmed.slice(6);
      if (dataStr === '[DONE]') {
        // 关闭所有打开的tool块
        for (const idx in toolCallState) {
          sendSSE('content_block_stop', {
            type: 'content_block_stop',
            index: parseInt(idx) + toolBlockStartIndex,
          });
        }

        // 关闭text块
        if (sentTextBlockStart) {
          sendSSE('content_block_stop', { type: 'content_block_stop', index: 0 });
        }

        const hasToolCalls = Object.keys(toolCallState).length > 0;
        sendSSE('message_delta', {
          type: 'message_delta',
          delta: {
            stop_reason: hasToolCalls ? 'tool_use' : 'end_turn',
            stop_sequence: null,
          },
          usage: { output_tokens: outputTokens },
        });
        sendSSE('message_stop', { type: 'message_stop' });
        res.end();
        return;
      }

      let parsed;
      try {
        parsed = JSON.parse(dataStr);
      } catch {
        continue;
      }

      const choice = parsed.choices && parsed.choices[0];
      if (!choice) continue;

      ensureMessageStart();

      const delta = choice.delta || {};

      // === 处理文本内容 ===
      if (delta.content) {
        if (!sentTextBlockStart) {
          sendSSE('content_block_start', {
            type: 'content_block_start',
            index: 0,
            content_block: { type: 'text', text: '' },
          });
          sentTextBlockStart = true;
        }
        outputTokens++;
        sendSSE('content_block_delta', {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: delta.content },
        });
      }

      // === 处理tool_calls delta ===
      if (delta.tool_calls && Array.isArray(delta.tool_calls)) {
        for (const tc of delta.tool_calls) {
          const tcIdx = tc.index !== undefined ? tc.index : 0;

          if (!toolCallState[tcIdx]) {
            // 新的tool call开始
            toolCallState[tcIdx] = {
              id: tc.id || ('toolu_' + crypto.randomBytes(12).toString('hex')),
              name: tc.function?.name || '',
              arguments: '',
            };

            // 先关闭text块（如果有）
            if (sentTextBlockStart) {
              sendSSE('content_block_stop', { type: 'content_block_stop', index: 0 });
              sentTextBlockStart = false;
            }

            // 发送tool_use content_block_start
            const blockIdx = tcIdx + toolBlockStartIndex;
            sendSSE('content_block_start', {
              type: 'content_block_start',
              index: blockIdx,
              content_block: {
                type: 'tool_use',
                id: toolCallState[tcIdx].id,
                name: toolCallState[tcIdx].name,
                input: {},
              },
            });
          }

          // 追加name（某些provider分块发送name）
          if (tc.function?.name) {
            toolCallState[tcIdx].name += tc.function.name;
          }

          // 追加arguments
          if (tc.function?.arguments) {
            toolCallState[tcIdx].arguments += tc.function.arguments;
            const blockIdx = tcIdx + toolBlockStartIndex;
            sendSSE('content_block_delta', {
              type: 'content_block_delta',
              index: blockIdx,
              delta: {
                type: 'input_json_delta',
                partial_json: tc.function.arguments,
              },
            });
          }
        }
      }

      // === 处理finish_reason ===
      if (choice.finish_reason && choice.finish_reason !== null) {
        // 关闭所有打开的tool块
        for (const idx in toolCallState) {
          sendSSE('content_block_stop', {
            type: 'content_block_stop',
            index: parseInt(idx) + toolBlockStartIndex,
          });
        }

        if (sentTextBlockStart) {
          sendSSE('content_block_stop', { type: 'content_block_stop', index: 0 });
          sentTextBlockStart = false;
        }

        let stopReason = 'end_turn';
        if (choice.finish_reason === 'length') stopReason = 'max_tokens';
        if (choice.finish_reason === 'tool_calls') stopReason = 'tool_use';

        sendSSE('message_delta', {
          type: 'message_delta',
          delta: { stop_reason: stopReason, stop_sequence: null },
          usage: { output_tokens: outputTokens },
        });
        sendSSE('message_stop', { type: 'message_stop' });
        res.end();
        return;
      }
    }
  });

  proxyRes.on('end', () => {
    if (!res.writableEnded) {
      for (const idx in toolCallState) {
        sendSSE('content_block_stop', {
          type: 'content_block_stop',
          index: parseInt(idx) + toolBlockStartIndex,
        });
      }
      if (sentTextBlockStart) {
        sendSSE('content_block_stop', { type: 'content_block_stop', index: 0 });
      }
      if (sentStart) {
        const hasToolCalls = Object.keys(toolCallState).length > 0;
        sendSSE('message_delta', {
          type: 'message_delta',
          delta: {
            stop_reason: hasToolCalls ? 'tool_use' : 'end_turn',
            stop_sequence: null,
          },
          usage: { output_tokens: outputTokens },
        });
        sendSSE('message_stop', { type: 'message_stop' });
      }
      res.end();
    }
  });

  proxyRes.on('error', (err) => {
    log(`流式响应错误: ${err.message}`);
    if (!res.writableEnded) res.end();
  });
}

// ========== 认证检查 ==========
function authenticate(req) {
  const xApiKey = req.headers['x-api-key'];
  if (xApiKey && ACCEPTED_API_KEYS.includes(xApiKey)) return true;

  const auth = req.headers['authorization'];
  if (auth && auth.startsWith('Bearer ')) {
    const token = auth.slice(7);
    if (ACCEPTED_API_KEYS.includes(token)) return true;
  }

  return false;
}

function estimateTokenCount(value) {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'string') return Math.max(1, Math.ceil(value.length / 4));
  if (typeof value === 'number' || typeof value === 'boolean') return 1;
  if (Array.isArray(value)) return value.reduce((sum, item) => sum + estimateTokenCount(item), 0);
  if (typeof value === 'object') {
    return Object.values(value).reduce((sum, item) => sum + estimateTokenCount(item), 0);
  }
  return 1;
}

function handleCountTokens(req, res) {
  if (!authenticate(req)) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      type: 'error',
      error: { type: 'authentication_error', message: 'Invalid API key' },
    }));
    return;
  }

  let body = '';
  req.on('data', (chunk) => (body += chunk));
  req.on('end', () => {
    try {
      const parsed = body ? JSON.parse(body) : {};
      const inputTokens = estimateTokenCount(parsed.system)
        + estimateTokenCount(parsed.messages)
        + estimateTokenCount(parsed.tools);
      log(`[count_tokens] model=${parsed.model || 'unknown'} | input_tokens=${inputTokens}`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ input_tokens: inputTokens }));
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        type: 'error',
        error: { type: 'invalid_request_error', message: 'Invalid JSON body' },
      }));
    }
  });
}

// ========== 主服务器 ==========
const server = http.createServer((req, res) => {
  const requestUrl = new URL(req.url, 'http://localhost');
  const pathname = requestUrl.pathname;
  log(`[http] ${req.method} ${req.url}`);

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', '*');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // 健康检查
  if (pathname === '/health' || pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'anthropic-to-openai-proxy', port: PROXY_PORT, toolUseSupport: true }));
    return;
  }

  // 模型列表（Claude Code启动时会验证模型是否存在）
  if (pathname === '/v1/models' && req.method === 'GET') {
    const models = [
      'best', 'opus', 'sonnet', 'haiku',
      'claude-opus-4-7',
      'claude-sonnet-4-5-20250514', 'claude-sonnet-4-6-20260320',
      'claude-haiku-4-5-20251001', 'claude-opus-4-5-20250514',
      'claude-sonnet-4-5', 'claude-sonnet-4-6',
      'claude-haiku-4-5', 'claude-opus-4-5',
      'claude-opus-4-6', 'claude-opus-4-6-20260320',
    ].map(id => ({ id, object: 'model', created: Date.now(), owned_by: 'anthropic' }));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ object: 'list', data: models }));
    return;
  }

  // 只处理 POST /v1/messages
  if (req.method === 'POST' && pathname === '/v1/messages/count_tokens') {
    handleCountTokens(req, res);
    return;
  }

  if (req.method === 'POST' && pathname === '/v1/messages') {
    // 认证
    if (!authenticate(req)) {
      log(`认证失败: ${req.headers['x-api-key'] || req.headers['authorization'] || 'no key'}`);
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        type: 'error',
        error: { type: 'authentication_error', message: 'Invalid API key' },
      }));
      return;
    }

    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      let anthropicReq;
      try {
        anthropicReq = JSON.parse(body);
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          type: 'error',
          error: { type: 'invalid_request_error', message: 'Invalid JSON body' },
        }));
        return;
      }

      const isStream = anthropicReq.stream || false;
      const requestModel = anthropicReq.model || 'unknown';
      const resolvedModel = resolveTargetModel(requestModel);
      const reasoningEffort = resolveReasoningEffort(requestModel);
      const hasTools = !!(anthropicReq.tools && anthropicReq.tools.length > 0);
      log(`[request] claude=${requestModel} -> gpt=${resolvedModel} | effort=${reasoningEffort || 'default'} | stream=${isStream} | tools=${hasTools ? anthropicReq.tools.length : 0}`);

      // 转换为OpenAI格式
      const openaiReq = convertAnthropicToOpenAI(anthropicReq);
      const openaiBody = JSON.stringify(openaiReq);

      // 转发到Team号池
      const proxyReq = http.request(
        {
          hostname: TEAM_POOL_HOST,
          port: TEAM_POOL_PORT,
          path: '/v1/chat/completions',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${TEAM_POOL_API_KEY}`,
            'Content-Length': Buffer.byteLength(openaiBody),
          },
          timeout: REQUEST_TIMEOUT,
        },
        (proxyRes) => {
          if (proxyRes.statusCode !== 200) {
            let errBody = '';
            proxyRes.on('data', (c) => (errBody += c));
            proxyRes.on('end', () => {
              log(`← 上游错误 ${proxyRes.statusCode}: ${errBody.substring(0, 200)}`);
              res.writeHead(proxyRes.statusCode, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                type: 'error',
                error: {
                  type: 'api_error',
                  message: `Upstream error: ${proxyRes.statusCode} - ${errBody}`,
                },
              }));
            });
            return;
          }

          if (isStream) {
            handleStreamingResponse(proxyRes, res, requestModel);
          } else {
            let respBody = '';
            proxyRes.on('data', (c) => (respBody += c));
            proxyRes.on('end', () => {
              try {
                const openaiResp = JSON.parse(respBody);
                const anthropicResp = convertOpenAIToAnthropic(openaiResp, requestModel);
                const hasToolUse = anthropicResp.content.some(b => b.type === 'tool_use');
                log(`← 响应 | tokens=${anthropicResp.usage.output_tokens} | tool_use=${hasToolUse}`);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(anthropicResp));
              } catch (e) {
                log(`响应解析失败: ${e.message}`);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                  type: 'error',
                  error: { type: 'api_error', message: 'Failed to parse upstream response' },
                }));
              }
            });
          }
        }
      );

      proxyReq.on('error', (err) => {
        log(`连接号池失败: ${err.message}`);
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          type: 'error',
          error: { type: 'api_error', message: `Pool unavailable: ${err.message}` },
        }));
      });

      proxyReq.on('timeout', () => {
        log('请求超时');
        proxyReq.destroy();
        res.writeHead(504, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          type: 'error',
          error: { type: 'api_error', message: 'Gateway Timeout' },
        }));
      });

      proxyReq.write(openaiBody);
      proxyReq.end();
    });
    return;
  }

  // 其他路径返回404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    type: 'error',
    error: { type: 'not_found_error', message: `Unknown endpoint: ${req.method} ${req.url}` },
  }));
});

server.listen(PROXY_PORT, '0.0.0.0', () => {
  log('='.repeat(55));
  log(`Anthropic→OpenAI 协议转换代理已启动 (tool_use完整支持)`);
  log(`监听: http://0.0.0.0:${PROXY_PORT}`);
  log(`转发: http://${TEAM_POOL_HOST}:${TEAM_POOL_PORT}`);
  log(`端点: POST /v1/messages (Anthropic格式)`);
  log(`功能: text + tool_use + streaming + 动态模型映射`);
  log('='.repeat(55));
});
