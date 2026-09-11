/**
 * server.js -- Express 服务器入口
 * 启动 HTTP 服务器，注册路由模块，提供静态文件服务
 */

const express = require('express');
const path = require('path');
const { getConfig } = require('./config');

const app = express();

// -- 静态文件（禁用缓存，确保热更即时生效）--
const publicDir = path.resolve(__dirname, '..', 'public');
app.use(express.static(publicDir, {
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
  }
}));
app.use(express.json({ limit: '50mb' }));

// -- 路由注册 --
app.use('/api', require('./routes/config'));
app.use('/api', require('./routes/recipients'));
app.use('/api', require('./routes/files'));
app.use('/api', require('./routes/send'));

// -- 关闭服务（用户用完后关闭端口，避免被内网扫描）--
app.post('/api/shutdown', (req, res) => {
  res.json({ ok: true });
  console.log('收到关闭请求，1 秒后退出进程...');
  setTimeout(() => {
    process.exit(0);
  }, 1000);
});

// -- 延迟关闭（关闭/刷新标签页时触发，可被 /cancel-shutdown 取消）--
//   刷新场景：before-close 启动 3 秒倒计时 → 新页面加载调 cancel-shutdown → 服务继续运行
//   关闭场景：before-close 启动 3 秒倒计时 → 无新页面取消 → 3 秒后服务退出
//   免疫窗口：cancel-shutdown 后 5 秒内忽略 before-close，防止新旧页面竞争时序问题
let _shutdownTimer = null;
let _cancelImmuneUntil = 0;

app.post('/api/before-close', (req, res) => {
  res.json({ ok: true });
  // 免疫窗口内忽略延迟关闭请求
  if (Date.now() < _cancelImmuneUntil) {
    console.log('收到延迟关闭请求，但处于免疫窗口内，忽略');
    return;
  }
  console.log('收到延迟关闭请求，3 秒后退出（可被取消）...');
  if (_shutdownTimer) clearTimeout(_shutdownTimer);
  _shutdownTimer = setTimeout(() => {
    console.log('延迟关闭倒计时结束，退出进程...');
    process.exit(0);
  }, 3000);
});

app.post('/api/cancel-shutdown', (req, res) => {
  res.json({ ok: true });
  if (_shutdownTimer) {
    clearTimeout(_shutdownTimer);
    _shutdownTimer = null;
    console.log('延迟关闭已取消（页面刷新或重新加载）');
  }
  // 设置 5 秒免疫窗口，防止 cancel 先于 before-close 到达导致关闭倒计时无法取消
  _cancelImmuneUntil = Date.now() + 5000;
});

// -- 启动服务器（从 conf.json 读取端口，被占用则自动递增）--
function startServer(port) {
  if (!port) {
    const cfg = getConfig();
    port = (cfg && cfg.port) || 8460;
  }
  const server = app.listen(port, '127.0.0.1');
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log('端口 ' + port + ' 被占用，尝试 ' + (port + 1));
      startServer(port + 1);
    } else {
      throw err;
    }
  });
  server.on('listening', () => {
    console.log('服务器已启动: http://localhost:' + port);
  });
  return server;
}

startServer();
