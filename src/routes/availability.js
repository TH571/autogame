const express = require('express');
const router = express.Router();
const Availability = require('../models/Availability');
const { authMiddleware } = require('../middleware/auth');

// 获取用户的可用时间
router.get('/', authMiddleware, (req, res) => {
  try {
    const availabilities = Availability.getByUser(req.user.id);

    // 格式化返回数据，包含锁定状态
    const formattedData = availabilities.map(a => {
      const modifyStatus = Availability.canModify(req.user.id, a.date, a.time_slot);
      return {
        id: a.id,
        date: a.date,
        timeSlot: a.time_slot,
        timeSlotText: getTimeSlotText(a.time_slot),
        createdAt: a.created_at,
        lastModified: a.last_modified,
        isLocked: !modifyStatus.canModify,
        lockReason: modifyStatus.reason,
        hoursRemaining: modifyStatus.hoursRemaining || 0
      };
    });

    res.json({ availabilities: formattedData });
  } catch (error) {
    console.error('获取可用时间错误:', error);
    res.status(500).json({ error: '获取可用时间失败' });
  }
});

// 提交可用时间（单个）
router.post('/', authMiddleware, (req, res) => {
  try {
    const { date, timeSlot, activityCode } = req.body;

    if (!date || !timeSlot) {
      return res.status(400).json({ error: '日期和时间段不能为空' });
    }

    if (!activityCode) {
      return res.status(400).json({ error: '活动代码为必填项' });
    }

    // 验证日期格式
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      return res.status(400).json({ error: '日期格式不正确，应为 YYYY-MM-DD' });
    }

    // 验证时间段
    if (![1, 2, 3].includes(timeSlot)) {
      return res.status(400).json({ error: '时间段必须是 1(下午)、2(晚上) 或 3(下午连晚上)' });
    }

    // 检查用户是否在该活动代码中
    const ActivityCode = require('../models/ActivityCode');
    const activityCodeRecord = ActivityCode.getByCode(activityCode);
    if (!activityCodeRecord) {
      return res.status(400).json({ error: '活动代码不存在' });
    }

    const isInCode = ActivityCode.isUserInCode(activityCodeRecord.id, req.user.id);
    if (!isInCode && req.user.role !== 'super_admin' && req.user.role !== 'activity_admin') {
      return res.status(403).json({ error: '您未被分配到该活动代码，无法申报' });
    }

    // 检查是否可以修改（24 小时后悔期逻辑）
    const modifyStatus = Availability.canModify(req.user.id, date, timeSlot);
    if (!modifyStatus.canModify) {
      let errorMsg = '该时间段已锁定，无法修改';
      if (modifyStatus.reason === 'locked' && modifyStatus.hoursRemaining > 0) {
        errorMsg = `申报已锁定，${modifyStatus.hoursRemaining}小时后可修改`;
      }
      return res.status(400).json({ error: errorMsg });
    }

    Availability.add(req.user.id, date, timeSlot, activityCode);

    res.json({
      message: '申报成功',
      availability: {
        date,
        timeSlot,
        timeSlotText: getTimeSlotText(timeSlot),
        activityCode,
        regretPeriod: modifyStatus.reason === 'regret_period'
      }
    });
  } catch (error) {
    console.error('提交可用时间错误:', error);
    res.status(500).json({ error: '提交失败，请稍后重试' });
  }
});

// 批量提交可用时间
router.post('/batch', authMiddleware, (req, res) => {
  try {
    const { availabilities, activityCode } = req.body;

    if (!activityCode) {
      return res.status(400).json({ error: '活动代码为必填项' });
    }

    if (!Array.isArray(availabilities) || availabilities.length === 0) {
      return res.status(400).json({ error: '可用时间列表不能为空' });
    }

    // 检查用户是否在该活动代码中
    const ActivityCode = require('../models/ActivityCode');
    const activityCodeRecord = ActivityCode.getByCode(activityCode);
    if (!activityCodeRecord) {
      return res.status(400).json({ error: '活动代码不存在' });
    }

    const isInCode = ActivityCode.isUserInCode(activityCodeRecord.id, req.user.id);
    if (!isInCode && req.user.role !== 'super_admin' && req.user.role !== 'activity_admin') {
      return res.status(403).json({ error: '您未被分配到该活动代码，无法申报' });
    }

    const validAvailabilities = [];
    const errors = [];
    const regretPeriodCount = { count: 0, total: availabilities.length };

    for (const av of availabilities) {
      // 验证日期格式
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(av.date)) {
        errors.push(`日期 ${av.date} 格式不正确`);
        continue;
      }

      // 验证时间段
      if (![1, 2, 3].includes(av.timeSlot)) {
        errors.push(`时间段 ${av.timeSlot} 无效`);
        continue;
      }

      // 检查是否可以修改（24 小时后悔期逻辑）
      const modifyStatus = Availability.canModify(req.user.id, av.date, av.timeSlot);
      if (!modifyStatus.canModify) {
        if (modifyStatus.reason === 'locked' && modifyStatus.hoursRemaining > 0) {
          errors.push(`${av.date} ${getTimeSlotText(av.timeSlot)}: 已锁定 (${modifyStatus.hoursRemaining}小时后可修改)`);
        } else {
          errors.push(`${av.date} ${getTimeSlotText(av.timeSlot)}: 不可修改`);
        }
        continue;
      }

      // 统计后悔期内的申报
      if (modifyStatus.reason === 'regret_period') {
        regretPeriodCount.count++;
      }

      validAvailabilities.push({
        date: av.date,
        timeSlot: av.timeSlot,
        activityCode
      });
    }

    if (validAvailabilities.length > 0) {
      Availability.addBatch(req.user.id, validAvailabilities);
    }

    let message = `成功提交 ${validAvailabilities.length} 条申报`;
    if (regretPeriodCount.count > 0) {
      message += `（其中 ${regretPeriodCount.count} 条在 24 小时后悔期内，可随时修改）`;
    }

    res.json({
      message,
      successCount: validAvailabilities.length,
      regretPeriodCount: regretPeriodCount.count > 0 ? regretPeriodCount.count : undefined,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('批量提交可用时间错误:', error);
    res.status(500).json({ error: '批量提交失败，请稍后重试' });
  }
});

// 删除可用时间
router.delete('/:date/:timeSlot', authMiddleware, (req, res) => {
  try {
    const { date, timeSlot } = req.params;
    const timeSlotNum = parseInt(timeSlot, 10);

    // 检查是否可以删除（24 小时后悔期逻辑）
    const modifyStatus = Availability.canModify(req.user.id, date, timeSlotNum);
    if (!modifyStatus.canModify) {
      let errorMsg = '该时间段已锁定，无法删除';
      if (modifyStatus.reason === 'locked' && modifyStatus.hoursRemaining > 0) {
        errorMsg = `申报已锁定，${modifyStatus.hoursRemaining}小时后可删除`;
      }
      return res.status(400).json({ error: errorMsg });
    }

    Availability.remove(req.user.id, date, timeSlotNum);

    res.json({ message: '删除成功' });
  } catch (error) {
    console.error('删除可用时间错误:', error);
    res.status(500).json({ error: '删除失败，请稍后重试' });
  }
});

// 获取未来 14 天的日期列表（带锁定状态）
router.get('/dates/next14', authMiddleware, async (req, res) => {
  try {
    const activityCode = req.query.activityCode;
    const dates = [];
    const today = new Date();

    console.log('[Availability] 获取日期列表，activityCode:', activityCode, 'userId:', req.user.id);

    // 获取用户已有的申报（根据活动代码过滤）
    let userAvailabilities;
    if (activityCode) {
      userAvailabilities = await Availability.getByUserAndCode(req.user.id, activityCode);
    } else {
      userAvailabilities = await Availability.getByUser(req.user.id);
    }

    console.log('[Availability] 用户申报数据:', userAvailabilities);

    const availMap = {};
    userAvailabilities.forEach(a => {
      const key = `${a.date}-${a.time_slot}`;
      availMap[key] = a;
    });

    for (let i = 0; i < 14; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      const dateStr = formatDate(date);

      // 检查这一天的申报状态
      const dayStatus = {
        date: dateStr,
        dayOfWeek: getDayOfWeek(date),
        slots: {}
      };

      // 检查每个时间段
      [1, 2, 3].forEach(async (slot) => {
        const key = `${dateStr}-${slot}`;
        const existing = availMap[key];

        if (existing) {
          const modifyStatus = await Availability.canModify(req.user.id, dateStr, slot);
          dayStatus.slots[slot] = {
            exists: true,
            isLocked: !modifyStatus.canModify,
            hoursRemaining: modifyStatus.hoursRemaining || 0,
            reason: modifyStatus.reason
          };
        } else {
          dayStatus.slots[slot] = {
            exists: false,
            isLocked: false
          };
        }
      });

      dates.push(dayStatus);
    }

    console.log('[Availability] 返回日期列表:', dates.length);
    res.json({ dates });
  } catch (error) {
    console.error('[Availability] 获取日期列表错误:', error.message, error.stack);
    console.error('获取日期列表错误:', error);
    res.status(500).json({ error: '获取日期列表失败' });
  }
});

// 辅助函数：时间段文本
function getTimeSlotText(slot) {
  const map = {
    1: '下午',
    2: '晚上',
    3: '下午连晚上'
  };
  return map[slot] || '未知';
}

// 辅助函数：格式化日期
function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// 辅助函数：获取星期
function getDayOfWeek(date) {
  const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return days[date.getDay()];
}

module.exports = router;
