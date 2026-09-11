/**
 * modules/task-builder.js -- 发送任务构建核心业务逻辑（纯函数）
 * 根据选中的收件人、部门展示顺序、分组角色类型、附件映射及发件人配置构建邮件任务
 */

/**
 * 构建邮件发送任务列表（纯函数，无副作用，不依赖全局变量）
 * @param {Array<{ dept: string, group: string, name: string, email: string }>} selectedPeople - 选中的收件人员列表
 * @param {string[]} deptOrder - 部门展示排序
 * @param {Object.<string, string>} [groupTypes={}] - 各分组类型映射，如 { '领导班子': '抄送' }
 * @param {Object.<string, Array<{ name: string, fullPath: string }>>} [attachmentsMap={}] - 部门附件映射
 * @param {boolean} [ccSelf=false] - 是否抄送自己
 * @param {string} [selfEmail=''] - 发件人邮箱地址
 * @returns {Array<{ dept: string, toPeople: Array, ccPeople: Array, toAddrs: string[], ccAddrs: string[], attachments: Array<{ filename: string, path: string }>, attachNames: string[], attachCount: number }>}
 */
function buildMailTasks(selectedPeople, deptOrder, groupTypes, attachmentsMap, ccSelf, selfEmail) {
  var peopleList = selectedPeople || [];
  if (!peopleList.length) return [];

  var types = groupTypes || {};
  var attachMap = attachmentsMap || {};
  var order = deptOrder || [];

  // 按部门分组
  var deptGroups = {};
  peopleList.forEach(function(p) {
    if (!p || !p.dept) return;
    if (!deptGroups[p.dept]) deptGroups[p.dept] = [];
    deptGroups[p.dept].push(p);
  });

  // 按指定部门顺序排列，未在 order 中的部门排在最后
  var orderedDepts = [];
  order.forEach(function(d) {
    if (d in deptGroups && orderedDepts.indexOf(d) === -1) {
      orderedDepts.push(d);
    }
  });
  Object.keys(deptGroups).forEach(function(d) {
    if (orderedDepts.indexOf(d) === -1) {
      orderedDepts.push(d);
    }
  });

  var result = [];
  orderedDepts.forEach(function(dept) {
    var people = deptGroups[dept] || [];
    var toPeople = [];
    var ccPeople = [];

    people.forEach(function(p) {
      var groupType = types[p.group] || '收件人';
      if (groupType === '抄送') ccPeople.push(p);
      else toPeople.push(p);
    });

    // 仅有 Cc 无 To 时，自动将 Cc 转为 To
    if (!toPeople.length && ccPeople.length) {
      toPeople = ccPeople;
      ccPeople = [];
    }

    var toAddrs = [...new Set(toPeople.map(function(p) { return p.email; }).filter(Boolean))];
    var ccAddrs = [...new Set(ccPeople.map(function(p) { return p.email; }).filter(Boolean))];

    // 抄送自己：开启且发件人邮箱有效时，加入 cc 列表（去重）
    var cleanSelfEmail = String(selfEmail || '').trim();
    if (ccSelf && cleanSelfEmail) {
      if (ccAddrs.indexOf(cleanSelfEmail) === -1 && toAddrs.indexOf(cleanSelfEmail) === -1) {
        ccAddrs.push(cleanSelfEmail);
      }
    }

    // 抄送人员列表（用于预览展示）：若追加了发件人自己，亦体现在 ccPeople 中
    var ccPeopleForPreview = ccPeople.slice();
    if (ccSelf && cleanSelfEmail) {
      var alreadyInCc = ccPeople.some(function(p) { return p.email === cleanSelfEmail; });
      var alreadyInTo = toPeople.some(function(p) { return p.email === cleanSelfEmail; });
      if (!alreadyInCc && !alreadyInTo) {
        ccPeopleForPreview.push({ name: '（自己）', group: '', email: cleanSelfEmail });
      }
    }

    var attachments = attachMap[dept] || [];
    var attachNames = attachments.map(function(f) { return f.name; });
    var attachFiles = attachments.map(function(f) {
      return { filename: f.name, path: f.fullPath };
    });

    result.push({
      dept: dept,
      toPeople: toPeople,
      ccPeople: ccPeopleForPreview,
      toAddrs: toAddrs,
      ccAddrs: ccAddrs,
      attachments: attachFiles,
      attachNames: attachNames,
      attachCount: attachments.length,
    });
  });

  return result;
}

// 兼容浏览器环境与 Node.js 模块导出（便于无 DOM 单元测试）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { buildMailTasks };
} else {
  window.buildMailTasks = buildMailTasks;
}
