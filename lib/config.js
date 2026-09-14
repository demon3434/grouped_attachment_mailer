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

let rawConfig = null;        // 从磁盘读取的原始配置（只要 JSON 合法即存在，含默认值）
let validatedConfig = null;  // 校验完全通过的配置（可供发信使用）
let configError = null;      // 校验错误或文件解析错误提示

/** 获取 exe 同级目录路径（多模块共用） */
function getExeDir() {
  return process.env.EXE_DIR || path.resolve(__dirname, '..');
}

/** 获取 conf.json 完整物理路径 */
function getConfPath() {
  return path.join(getExeDir(), 'conf.json');
}

/** 为配置对象填充默认值（原地修改） */
function applyDefaults(cfg) {
  if (!cfg) return;
  for (var key in DEFAULTS) {
    var v = cfg[key];
    // 仅当字段缺失或为 undefined/null/空字符串时才补默认值。
    // 不能用 !cfg[key] 判断：布尔 false、数字 0 都是合法配置，会被误判为缺省。
    if (v === undefined || v === null || v === '') {
      cfg[key] = DEFAULTS[key];
    }
  }
}

/** 校验发件必填字段并规范化端口类型，返回错误信息或 null */
function validateAndNormalize(cfg) {
  for (var i = 0; i < REQUIRED_FIELDS.length; i++) {
    var field = REQUIRED_FIELDS[i];
    var val = cfg[field];
    if (val === undefined || val === null || (typeof val === 'string' && val.trim() === '')) {
      return '缺少必填字段: ' + field;
    }
    if (typeof val === 'string') {
      cfg[field] = val.trim();
    }
  }

  // 端口类型转换与范围校验（1 ~ 65535）
  var smtpPort = parseInt(cfg.smtp_port, 10);
  if (isNaN(smtpPort) || smtpPort <= 0 || smtpPort > 65535) {
    return 'smtp_port 必须为 1~65535 之间的整数';
  }
  cfg.smtp_port = smtpPort;

  if (cfg.port !== undefined && cfg.port !== null && cfg.port !== '') {
    var webPort = parseInt(cfg.port, 10);
    if (isNaN(webPort) || webPort <= 0 || webPort > 65535) {
      return 'port 必须为 1~65535 之间的整数';
    }
    cfg.port = webPort;
  }

  return null;
}

/** 从磁盘读取并解析配置 */
function loadConfig() {
  const confPath = getConfPath();

  try {
    const raw = fs.readFileSync(confPath, 'utf-8');
    rawConfig = JSON.parse(raw);
  } catch (e) {
    rawConfig = null;
    validatedConfig = null;
    configError = '未找到或解析 conf.json 失败: ' + e.message;
    return;
  }

  applyDefaults(rawConfig);

  // 复制一份进行发信必填项校验，避免校验逻辑影响 rawConfig 基础展示
  const candidate = Object.assign({}, rawConfig);
  var err = validateAndNormalize(candidate);
  if (err) {
    configError = 'conf.json ' + err;
    validatedConfig = null;
    return;
  }

  applyDefaults(candidate);
  validatedConfig = candidate;
  configError = null;
}

/** 获取磁盘基础配置（未校验通过也可获取已配项），确保配置展示与基础属性可访问 */
function getRawConfig() {
  if (rawConfig === null && !configError) loadConfig();
  return rawConfig;
}

/** 获取已完成发信必填项校验的有效配置，用于实际发信 */
function getConfig() {
  if (validatedConfig === null && rawConfig === null && !configError) {
    loadConfig();
  }
  return validatedConfig;
}

/** 获取配置状态概要，供前端首页展示 */
function getConfigStatus() {
  if (validatedConfig === null && !configError) loadConfig();
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
  if (!validatedConfig) return { status: 'error', error: '配置未加载' };
  return {
    status: 'ok',
    username: validatedConfig.username,
    smtp_server: validatedConfig.smtp_server,
    recipient_file: validatedConfig.recipient_file,
    sheet_recipients: validatedConfig.sheet_recipients,
    sheet_depts: validatedConfig.sheet_depts,
    sheet_groups: validatedConfig.sheet_groups,
  };
}

/** 获取收件人名单文件的绝对路径 */
function getRecipientFilePath() {
  const raw = getRawConfig();
  const file = (raw && raw.recipient_file) || DEFAULTS.recipient_file;
  const filePath = path.isAbsolute(file) ? file : path.join(getExeDir(), file);
  if (!fs.existsSync(filePath)) return null;
  return filePath;
}

/** 返回 conf.json 的完整内容（脱敏：密码不返回） */
function getConfigForClient() {
  const raw = getRawConfig();
  const safe = Object.assign({}, DEFAULTS, raw || {});
  safe.hasPassword = !!(raw && raw.password);
  if (safe.password) safe.password = '******';
  return safe;
}

/** 返回真实密码（仅限本地调用，不脱敏） */
function getRealPassword() {
  const raw = getRawConfig();
  return (raw && raw.password) || '';
}

/** 获取收件人名单文件中的各 sheet 名称配置 */
function getSheetNames() {
  const raw = getRawConfig();
  return {
    recipients: (raw && raw.sheet_recipients) || DEFAULTS.sheet_recipients,
    depts: (raw && raw.sheet_depts) || DEFAULTS.sheet_depts,
    groups: (raw && raw.sheet_groups) || DEFAULTS.sheet_groups,
  };
}

/** 保存配置到 conf.json */
function saveConfig(newConfig) {
  const confPath = getConfPath();

  // 如果新配置未填密码或为占位符，保留原有真实密码
  if (newConfig.password === '******' || !newConfig.password || (typeof newConfig.password === 'string' && newConfig.password.trim() === '')) {
    const realPwd = getRealPassword();
    if (realPwd) {
      newConfig.password = realPwd;
    }
  }

  var err = validateAndNormalize(newConfig);
  if (err) {
    return { ok: false, error: err };
  }

  applyDefaults(newConfig);

  try {
    fs.writeFileSync(confPath, JSON.stringify(newConfig, null, 2), 'utf-8');
    rawConfig = Object.assign({}, newConfig);
    validatedConfig = newConfig;
    configError = null;
    return { ok: true };
  } catch (e) {
    return { ok: false, error: '写入 conf.json 失败: ' + e.message };
  }
}

module.exports = {
  loadConfig,
  getConfig,
  getConfigStatus,
  getRecipientFilePath,
  getConfigForClient,
  saveConfig,
  getSheetNames,
  getRealPassword,
  getExeDir,
  getConfPath,
};
