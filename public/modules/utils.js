/**
 * modules/utils.js -- 前端公共工具函数
 */

/**
 * 将选中的收件人按部门分组，每个部门内按 groupType 分离 to/cc
 * （向后兼容适配器，核心纯函数委托给 task-builder.js 的 buildMailTasks）
 */
function groupByDept() {
  var selected = (typeof getSelectedRecipients === 'function')
    ? getSelectedRecipients().map(function(item) { return item.r; })
    : [];
  var selfEmail = (state.config && state.config.username) || '';
  return buildMailTasks(selected, state.deptOrder, state.groupTypes, state.attachmentsMap, state.ccSelf, selfEmail);
}


/**
 * 转义 HTML 特殊字符，防止 XSS 和布局错乱
 */
function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 严格校验邮箱地址格式
 * @param {string} email
 * @returns {string|null} 错误原因，合规则返回 null
 */
function validateEmailAddress(email) {
  if (!email || !String(email).trim()) {
    return '邮箱地址为空';
  }
  var trimmed = String(email).trim();

  // 排查全角字符及常见中文全角标点
  if (/[\uff01-\uff5e\u3000-\u303f]/.test(trimmed)) {
    return '包含全角字符或中文符号（如全角＠或中文逗号句号）';
  }

  // 排查内部空格
  if (/\s/.test(trimmed)) {
    return '邮箱中间包含多余空格';
  }

  // 基础结构排查
  var atIdx = trimmed.indexOf('@');
  if (atIdx === -1) {
    return '缺少 @ 符号';
  }
  if (atIdx === 0) {
    return '缺少用户名（@ 前为空）';
  }
  if (trimmed.indexOf('@', atIdx + 1) !== -1) {
    return '包含多个 @ 符号';
  }

  var localPart = trimmed.slice(0, atIdx);
  var domain = trimmed.slice(atIdx + 1);

  if (!domain) {
    return '缺少域名（@ 后为空）';
  }
  if (domain.indexOf('.') === -1) {
    return '域名缺少顶级后缀（如 .com / .cn）';
  }
  if (domain.startsWith('.') || domain.endsWith('.')) {
    return '域名格式异常（点号位置不正确）';
  }
  if (/\.\./.test(domain) || /\.\./.test(localPart)) {
    return '包含连续的点号(..)';
  }

  var domainParts = domain.split('.');
  var tld = domainParts[domainParts.length - 1];
  if (!tld || tld.length < 2 || !/^[a-zA-Z]+$/.test(tld)) {
    return '顶级域名不合法（需至少2位纯英文字母后缀，如 .com 或 .cn）';
  }

  // 规范正则匹配 (支持标准邮箱格式)
  var emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  if (!emailRegex.test(trimmed)) {
    return '不符合标准邮箱格式规范';
  }

  return null;
}
