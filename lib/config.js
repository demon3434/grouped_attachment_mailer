/**
 * config.js -- 配置加载与校验
 * 从启动器 exe 同级目录读取 conf.json
 */

const fs = require('fs');
const path = require('path');

// 必填字段
const REQUIRED_FIELDS = ['smtp_server', 'smtp_port', 'username', 'password'];

// 默认值
const DEFAULTS = {
  use_ssl: true,
  port: 8460,
  recipient_file: '收件人名单.xlsx',
  sheet_recipients: '收件人名单',
  sheet_depts: '部门',
  sheet_groups: '分组',
  random_delay: true,
};

let config = null;
let configError = null;

/** 获取 exe 同级目录路径（多模块共用） */
function getExeDir() {
  return process.env.EXE_DIR || path.resolve(__dirname, '..');
}

/** 为配置对象填充默认值（原地修改） */
function applyDefaults(cfg) {
  for (var key in DEFAULTS) {
    var v = cfg[key];
    // 仅当字段缺失或为 undefined/null/空字符串时才补默认值。
    // 不能用 !cfg[key] 判断：布尔 false、数字 0 都是合法配置，会被误判为缺省。
    if (v === undefined || v === null || v === '') {
      cfg[key] = DEFAULTS[key];
    }
  }
}

/** 校验必填字段，返回错误信息或 null */
function validateRequired(cfg) {
  for (var i = 0; i < REQUIRED_FIELDS.length; i++) {
    var field = REQUIRED_FIELDS[i];
    if (!cfg[field]) {
      return '缺少必填字段: ' + field;
    }
  }
  if (typeof cfg.smtp_port !== 'number') {
    return 'smtp_port 必须为整数';
  }
  return null;
}

function loadConfig() {
  const confPath = path.join(getExeDir(), 'conf.json');

  try {
    const raw = fs.readFileSync(confPath, 'utf-8');
    config = JSON.parse(raw);
  } catch (e) {
    config = null;
    configError = '未找到或解析 conf.json 失败: ' + e.message;
    return;
  }

  var err = validateRequired(config);
  if (err) {
    configError = 'conf.json ' + err;
    config = null;
    return;
  }

  applyDefaults(config);
  configError = null;
}

function getConfig() {
  if (config === null && !configError) loadConfig();
  return config;
}

function getConfigStatus() {
  if (config === null && !configError) loadConfig();
  if (configError) {
    // 区分"缺少密码"和"缺少账号"的情况，给前端更友好的提示
    if (configError.indexOf('password') >= 0) {
      return { status: 'error', error: '缺少密码配置，请在设置中填写发件邮箱密码' };
    }
    if (configError.indexOf('username') >= 0) {
      return { status: 'error', error: '缺少账号配置，请在设置中填写发件邮箱地址' };
    }
    return { status: 'error', error: configError };
  }
  if (!config) return { status: 'error', error: '配置未加载' };
  return {
    status: 'ok',
    username: config.username,
    smtp_server: config.smtp_server,
  };
}

function getRecipientFilePath() {
  const cfg = getConfig();
  if (!cfg) return null;
  const file = cfg.recipient_file || DEFAULTS.recipient_file;
  const filePath = path.isAbsolute(file) ? file : path.join(getExeDir(), file);
  if (!fs.existsSync(filePath)) return null;
  return filePath;
}

/** 返回 conf.json 的完整内容（脱敏：密码不返回） */
function getConfigForClient() {
  const cfg = getConfig();
  if (!cfg) return null;
  const safe = Object.assign({}, cfg);
  if (safe.password) safe.password = '******';
  return safe;
}

/** 保存配置到 conf.json */
function saveConfig(newConfig) {
  const confPath = path.join(getExeDir(), 'conf.json');

  // 如果新配置的密码是占位符，保留原密码
  const oldCfg = getConfig();
  if (newConfig.password === '******' && oldCfg && oldCfg.password) {
    newConfig.password = oldCfg.password;
  }

  var err = validateRequired(newConfig);
  if (err) {
    return { ok: false, error: err };
  }

  applyDefaults(newConfig);

  try {
    fs.writeFileSync(confPath, JSON.stringify(newConfig, null, 2), 'utf-8');
    config = newConfig;
    configError = null;
    return { ok: true };
  } catch (e) {
    return { ok: false, error: '写入 conf.json 失败: ' + e.message };
  }
}

/** 返回真实密码（仅限本地调用，不脱敏） */
function getRealPassword() {
  const cfg = getConfig();
  return (cfg && cfg.password) || '';
}

/** 获取收件人名单文件路径中的 sheet 名 */
function getSheetNames() {
  const cfg = getConfig();
  if (!cfg) return null;
  return {
    recipients: cfg.sheet_recipients || DEFAULTS.sheet_recipients,
    depts: cfg.sheet_depts || DEFAULTS.sheet_depts,
    groups: cfg.sheet_groups || DEFAULTS.sheet_groups,
  };
}

module.exports = { loadConfig, getConfig, getConfigStatus, getRecipientFilePath, getConfigForClient, saveConfig, getSheetNames, getRealPassword };
