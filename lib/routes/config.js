/**
 * routes/config.js -- 配置相关路由
 * 配置状态、读写设置、密码获取、SMTP 测试
 */

const express = require('express');
const router = express.Router();
const { getConfigStatus, getConfigForClient, saveConfig, getRealPassword, getRecipientFilePath, getSheetNames } = require('../config');
const { createTransport } = require('../mailer');

// 健康检查
router.get('/health', (req, res) => {
  res.json({ ok: true });
});

// 配置状态
router.get('/config', (req, res) => {
  res.json(getConfigStatus());
});

// 获取配置（设置页用）
router.get('/settings', (req, res) => {
  const cfg = getConfigForClient();
  if (!cfg) {
    return res.status(500).json({ error: '配置未加载' });
  }
  res.json(cfg);
});

// 保存配置
router.post('/settings', (req, res) => {
  const result = saveConfig(req.body);
  if (!result.ok) {
    return res.status(400).json({ error: result.error });
  }
  res.json({ ok: true });
});

// 获取真实密码（按住眼睛按钮时临时请求）
router.get('/password', (req, res) => {
  res.json({ password: getRealPassword() });
});

/**
 * 从请求体构建可用于测试的 SMTP 配置。
 * 密码为占位符或空时，自动填入已保存的真实密码。
 * 返回 { ok, cfg?, error? }
 */
function buildTestConfig(body) {
  var cfg = body || {};
  if (cfg.password === '******' || !cfg.password) {
    var realPwd = getRealPassword();
    if (!realPwd) {
      return { ok: false, error: '未配置密码，请先在设置中填写发件邮箱密码' };
    }
    cfg.password = realPwd;
  }
  if (!cfg.smtp_server || !cfg.smtp_port || !cfg.username) {
    return { ok: false, error: '请填写 SMTP 服务器、端口和发件邮箱' };
  }
  return { ok: true, cfg };
}

// 测试 SMTP 连接
router.post('/test-connection', async (req, res) => {
  var result = buildTestConfig(req.body);
  if (!result.ok) return res.json({ ok: false, error: result.error });
  try {
    var transporter = createTransport(result.cfg);
    await transporter.verify();
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// 发送测试邮件（发给自己）
router.post('/test-mail', async (req, res) => {
  var result = buildTestConfig(req.body);
  if (!result.ok) return res.json({ ok: false, error: result.error });
  try {
    var transporter = createTransport(result.cfg);
    await transporter.sendMail({
      from: result.cfg.username,
      to: result.cfg.username,
      subject: '批量分组发送邮件 - 测试邮件',
      html: '<p>这是一封测试邮件，说明您的 SMTP 配置正确。</p><p>发件邮箱：' + result.cfg.username + '</p><p>SMTP 服务器：' + result.cfg.smtp_server + ':' + result.cfg.smtp_port + '</p>',
    });
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

module.exports = router;
