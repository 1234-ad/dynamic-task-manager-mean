const express = require('express');
const { query } = require('express-validator');
const User = require('../models/User');
const { auth } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/users
// @desc    Get users (for project member selection)
// @access  Private
router.get('/', auth, [
  query('search').optional().trim(),
  query('limit').optional().isInt({ min: 1, max: 50 })
], async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const search = req.query.search;

    let filter = { isActive: true };
    
    if (search) {
      filter.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { username: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const users = await User.find(filter)
      .select('firstName lastName username email avatar department role')
      .limit(limit)
      .sort({ firstName: 1, lastName: 1 });

    res.json(users);

  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/users/:id
// @desc    Get user profile
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('firstName lastName username email avatar department role createdAt lastLogin');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!user.isActive) {
      return res.status(404).json({ message: 'User account is deactivated' });
    }

    res.json(user);

  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/users/me/stats
// @desc    Get current user's statistics
// @access  Private
router.get('/me/stats', auth, async (req, res) => {
  try {
    const Task = require('../models/Task');
    const Project = require('../models/Project');

    // Get user's task statistics
    const taskStats = await Task.aggregate([
      { $match: { assignee: req.user._id, isArchived: false } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
          inProgress: { $sum: { $cond: [{ $eq: ['$status', 'in-progress'] }, 1, 0] } },
          todo: { $sum: { $cond: [{ $eq: ['$status', 'todo'] }, 1, 0] } },
          overdue: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $ne: ['$dueDate', null] },
                    { $lt: ['$dueDate', new Date()] },
                    { $ne: ['$status', 'completed'] }
                  ]
                },
                1,
                0
              ]
            }
          }
        }
      }
    ]);

    // Get projects where user is owner or member
    const projectCount = await Project.countDocuments({
      $or: [
        { owner: req.user._id },
        { 'members.user': req.user._id }
      ],
      isArchived: false
    });

    // Get owned projects count
    const ownedProjectsCount = await Project.countDocuments({
      owner: req.user._id,
      isArchived: false
    });

    // Recent tasks assigned to user
    const recentTasks = await Task.find({
      assignee: req.user._id,
      isArchived: false
    })
    .populate('project', 'name color')
    .sort({ updatedAt: -1 })
    .limit(5);

    // Tasks by priority
    const priorityStats = await Task.aggregate([
      { $match: { assignee: req.user._id, isArchived: false } },
      { $group: { _id: '$priority', count: { $sum: 1 } } }
    ]);

    // Weekly task completion trend (last 4 weeks)
    const fourWeeksAgo = new Date();
    fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);

    const weeklyStats = await Task.aggregate([
      {
        $match: {
          assignee: req.user._id,
          status: 'completed',
          completedAt: { $gte: fourWeeksAgo }
        }
      },
      {
        $group: {
          _id: {
            week: { $week: '$completedAt' },
            year: { $year: '$completedAt' }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.week': 1 } }
    ]);

    res.json({
      taskStats: taskStats[0] || { total: 0, completed: 0, inProgress: 0, todo: 0, overdue: 0 },
      projectCount,
      ownedProjectsCount,
      recentTasks,
      priorityStats,
      weeklyStats,
      user: {
        name: req.user.fullName,
        role: req.user.role,
        department: req.user.department,
        joinDate: req.user.createdAt
      }
    });

  } catch (error) {
    console.error('Get user stats error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;