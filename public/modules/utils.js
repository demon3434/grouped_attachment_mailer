/**
 * modules/utils.js -- 前端公共工具函数
 * groupByDept: 按部门分组收件人，分离收件人/抄送
 */

/**
 * 将选中的收件人按部门分组，每个部门内按 groupType 分离 to/cc
 * 返回: [{ dept, toPeople, ccPeople, toAddrs, ccAddrs, attachments, attachNames, attachCount }]
 */
function groupByDept() {
  var selected = getSelectedRecipients();
  if (!selected.length) return [];

  // 按部门分组
  var deptGroups = {};
  selected.forEach(function(item) {
    if (!deptGroups[item.r.dept]) deptGroups[item.r.dept] = [];
    deptGroups[item.r.dept].push(item.r);
  });

  // 按 Excel 出现顺序排列部门
  var orderedDepts = state.deptOrder.filter(function(d) { return d in deptGroups; });

  var result = [];
  orderedDepts.forEach(function(dept) {
    var people = deptGroups[dept];
    var toPeople = [];
    var ccPeople = [];

    people.forEach(function(p) {
      var groupType = state.groupTypes[p.group] || '收件人';
      if (groupType === '抄送') ccPeople.push(p);
      else toPeople.push(p);
    });

    // 仅有 Cc 无 To 时 Cc 转 To
    if (!toPeople.length && ccPeople.length) {
      toPeople = ccPeople;
      ccPeople = [];
    }

    var toAddrs = [...new Set(toPeople.map(function(p) { return p.email; }))];
    var ccAddrs = [...new Set(ccPeople.map(function(p) { return p.email; }))];

    var attachments = state.attachmentsMap[dept] || [];
    var attachNames = attachments.map(function(f) { return f.name; });
    var attachFiles = attachments.map(function(f) {
      return { filename: f.name, path: f.fullPath };
    });

    result.push({
      dept: dept,
      toPeople: toPeople,
      ccPeople: ccPeople,
      toAddrs: toAddrs,
      ccAddrs: ccAddrs,
      attachments: attachFiles,
      attachNames: attachNames,
      attachCount: attachments.length,
    });
  });

  return result;
}
