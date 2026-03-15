const express = require('express');
const router = express.Router();
const Availability = require('../models/Availability');
const { authMiddleware } = require('../middleware/auth');

// 获取用户的可用时间
router.get('/', authMiddleware, (req, res) => {
  try {
    const availabilities = Availability.getByUser(req.user.id);
    
    // 格式化返回数据
    const formattedData = availabilities.map(a => ({
      date: a.date,
      timeSlot: a.time_slot,
      timeSlotText: getTimeSlotText(a.time_slot),
      createdAt: a.created_at
    }));

    res.json({ availabilities: formattedData });
  } catch (error) {
    console.error('获取可用时间错误:', error);
    res.status(500).json({ error: '获取可用时间失败' });
  }
});

// 提交可用时间（单个）
router.post('/', authMiddleware, (req, res) => {
  try {
    const { date, timeSlot } = req.body;

    if (!date || !timeSlot) {
      return res.status(400).json({ error: '日期和时间段不能为空' });
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

    // 检查是否是今天或明天或后天（不允许修改）
    const today = new Date();
    const inputDate = new Date(date);
    const threeDaysLater = new Date(today);
    threeDaysLater.setDate(today.getDate() + 3);
    threeDaysLater.setHours(0, 0, 0, 0);

    // 检查是否已经存在
    const existing = Availability.checkAvailability(req.user.id, date, timeSlot);
    if (existing) {
      // 检查是否可以修改（3 天后）
      if (inputDate < threeDaysLater) {
        return res.status(400).json({ 
          error: '只能修改 3 天后的申报，今天、明天和后天的申报不可修改' 
        });
      }
    }

    Availability.add(req.user.id, date, timeSlot);

    res.json({ 
      message: '申报成功',
      availability: {
        date,
        timeSlot,
        timeSlotText: getTimeSlotText(timeSlot)
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
    const { availabilities } = req.body;

    if (!Array.isArray(availabilities) || availabilities.length === 0) {
      return res.status(400).json({ error: '可用时间列表不能为空' });
    }

    // 验证每个申报项
    const today = new Date();
    const threeDaysLater = new Date(today);
    threeDaysLater.setDate(today.getDate() + 3);
    threeDaysLater.setHours(0, 0, 0, 0);

    const validAvailabilities = [];
    const errors = [];

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

      // 检查是否可以修改（针对已存在的申报）
      const existing = Availability.checkAvailability(req.user.id, av.date, av.timeSlot);
      if (existing) {
        const inputDate = new Date(av.date);
        if (inputDate < threeDaysLater) {
          errors.push(`${av.date} 的申报不可修改（3 天内）`);
          continue;
        }
      }

      validAvailabilities.push({
        date: av.date,
        timeSlot: av.timeSlot
      });
    }

    if (validAvailabilities.length > 0) {
      Availability.addBatch(req.user.id, validAvailabilities);
    }

    res.json({
      message: `成功提交 ${validAvailabilities.length} 条申报`,
      successCount: validAvailabilities.length,
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

    // 检查是否可以删除（3 天后）
    const today = new Date();
    const inputDate = new Date(date);
    const threeDaysLater = new Date(today);
    threeDaysLater.setDate(today.getDate() + 3);
    threeDaysLater.setHours(0, 0, 0, 0);

    if (inputDate < threeDaysLater) {
      return res.status(400).json({ 
        error: '只能删除 3 天后的申报，今天、明天和后天的申报不可删除' 
      });
    }

    Availability.remove(req.user.id, date, timeSlotNum);

    res.json({ message: '删除成功' });
  } catch (error) {
    console.error('删除可用时间错误:', error);
    res.status(500).json({ error: '删除失败，请稍后重试' });
  }
});

// 获取未来 14 天的日期列表
router.get('/dates/next14', authMiddleware, (req, res) => {
  try {
    const dates = [];
    const today = new Date();

    for (let i = 0; i < 14; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      
      dates.push({
        date: formatDate(date),
        dayOfWeek: getDayOfWeek(date),
        isModifiable: i >= 3 // 3 天后可修改
      });
    }

    res.json({ dates });
  } catch (error) {
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
