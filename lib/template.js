/**
 * template.js -- 收件人名单模板生成
 * 独立模块，生成含样例数据的 xlsx 模板供用户下载
 */

const XLSX = require('xlsx');

/**
 * 生成收件人名单模板的 xlsx Buffer
 * @param {Object} sheetNames - { recipients, depts, groups }
 * @returns {Buffer} xlsx 文件内容
 */
function generateTemplate(sheetNames) {
  var names = sheetNames || {};
  var snRecip = names.recipients || '收件人名单';
  var snDepts = names.depts || '部门';
  var snGroups = names.groups || '分组';

  var wb = XLSX.utils.book_new();

  // -- 部门列表（部门1~部门5） --
  var depts = [];
  for (var i = 1; i <= 5; i++) depts.push('部门' + i);

  // -- 分组列表（岗位类型A~岗位类型C） --
  var groups = ['岗位类型A', '岗位类型B', '岗位类型C'];

  // 1. 收件人名单 sheet（分组/部门/姓名/邮箱）
  var recipData = [['分组', '部门', '姓名', '邮箱']];
  var namesPool = ['张伟', '李娜', '王强', '刘洋', '陈静', '赵磊', '孙丽', '周杰',
    '吴敏', '郑鹏', '冯娟', '蒋涛', '韩雪', '杨帆', '朱琳', '秦浩',
    '徐颖', '胡军', '林芳', '何鑫', '郭威', '马超', '罗婷', '梁宇',
    '宋佳', '谢明', '唐悦', '许峰', '邓超', '冯刚', '曹颖', '彭博'];
  var nameIdx = 0;
  // 每个分组 × 每个部门，生成一行样例数据
  groups.forEach(function(g) {
    depts.forEach(function(d) {
      var name = namesPool[nameIdx % namesPool.length];
      var email = 'user' + (100 + nameIdx) + '@example.com';
      nameIdx++;
      recipData.push([g, d, name, email]);
    });
  });
  var wsRecip = XLSX.utils.aoa_to_sheet(recipData);
  wsRecip['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 24 }];
  XLSX.utils.book_append_sheet(wb, wsRecip, snRecip);

  // 2. 部门排序 sheet（展示排序/部门）
  var deptData = [['展示排序', '部门']];
  depts.forEach(function(d, i) {
    deptData.push([i + 1, d]);
  });
  var wsDept = XLSX.utils.aoa_to_sheet(deptData);
  wsDept['!cols'] = [{ wch: 10 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, wsDept, snDepts);

  // 3. 分组排序 sheet（展示排序/分组）
  var groupData = [['展示排序', '分组']];
  groups.forEach(function(g, i) {
    groupData.push([i + 1, g]);
  });
  var wsGroup = XLSX.utils.aoa_to_sheet(groupData);
  wsGroup['!cols'] = [{ wch: 10 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, wsGroup, snGroups);

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = { generateTemplate };
