const express = require('express');
const { body, validationResult, query } = require('express-validator');
const Task = require('../models/Task');
const Project = require('../models/Project');
const { auth } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/tasks
// @desc    Get tasks with filtering and pagination
// @access  Private
router.get('/', auth, [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('status').optional().isIn(['todo', 'in-progress', 'review', 'completed', 'cancelled']),
  query('priority').optional().isIn(['low', 'medium', 'high', 'urgent']),
  query('project').optional().isMongoId().withMessage('Invalid project ID')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Build filter object
    const filter = { isArchived: false };
    
    if (req.query.status) filter.status = req.query.status;
    if (req.query.priority) filter.priority = req.query.priority;
    if (req.query.project) filter.project = req.query.project;
    if (req.query.assignee) filter.assignee = req.query.assignee;
    if (req.query.search) {
      filter.$or = [
        { title: { $regex: req.query.search, $options: 'i' } },
        { description: { $regex: req.query.search, $options: 'i' } }
      ];
    }

    // Get user's accessible projects
    const userProjects = await Project.find({
      $or: [
        { owner: req.user._id },
        { 'members.user': req.user._id }
      ]
    }).select('_id');

    const projectIds = userProjects.map(p => p._id);
    filter.project = { $in: projectIds };

    const tasks = await Task.find(filter)
      .populate('assignee', 'firstName lastName username avatar')
      .populate('reporter', 'firstName lastName username avatar')
      .populate('project', 'name color')
      .populate('watchers', 'firstName lastName username avatar')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Task.countDocuments(filter);

    res.json({
      tasks,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total,
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      }
    });

  } catch (error) {
    console.error('Get tasks error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/tasks/:id
// @desc    Get single task
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id)
      .populate('assignee', 'firstName lastName username avatar')
      .populate('reporter', 'firstName lastName username avatar')
      .populate('project', 'name color members')
      .populate('watchers', 'firstName lastName username avatar')
      .populate('comments.author', 'firstName lastName username avatar')
      .populate('timeTracking.user', 'firstName lastName username avatar');

    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    // Check if user has access to this task
    const project = await Project.findById(task.project._id);
    const hasAccess = project.owner.toString() === req.user._id.toString() ||
                     project.members.some(member => member.user.toString() === req.user._id.toString());

    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json(task);

  } catch (error) {
    console.error('Get task error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/tasks
// @desc    Create new task
// @access  Private
router.post('/', auth, [
  body('title').notEmpty().trim().withMessage('Title is required'),
  body('project').isMongoId().withMessage('Valid project ID is required'),
  body('priority').optional().isIn(['low', 'medium', 'high', 'urgent']),
  body('status').optional().isIn(['todo', 'in-progress', 'review', 'completed', 'cancelled']),
  body('dueDate').optional().isISO8601().withMessage('Invalid due date format')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { title, description, project, assignee, priority, status, dueDate, estimatedHours, labels } = req.body;

    // Check if project exists and user has access
    const projectDoc = await Project.findById(project);
    if (!projectDoc) {
      return res.status(404).json({ message: 'Project not found' });
    }

    const hasAccess = projectDoc.owner.toString() === req.user._id.toString() ||
                     projectDoc.members.some(member => member.user.toString() === req.user._id.toString());

    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied to this project' });
    }

    const task = new Task({
      title,
      description: description || '',
      project,
      assignee: assignee || null,
      reporter: req.user._id,
      priority: priority || 'medium',
      status: status || 'todo',
      dueDate: dueDate || null,
      estimatedHours: estimatedHours || null,
      labels: labels || []
    });

    await task.save();

    const populatedTask = await Task.findById(task._id)
      .populate('assignee', 'firstName lastName username avatar')
      .populate('reporter', 'firstName lastName username avatar')
      .populate('project', 'name color');

    // Emit real-time update
    req.io.to(project).emit('task-created', {
      task: populatedTask,
      projectId: project
    });

    res.status(201).json({
      message: 'Task created successfully',
      task: populatedTask
    });

  } catch (error) {
    console.error('Create task error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/tasks/:id
// @desc    Update task
// @access  Private
router.put('/:id', auth, [
  body('title').optional().notEmpty().trim().withMessage('Title cannot be empty'),
  body('priority').optional().isIn(['low', 'medium', 'high', 'urgent']),
  body('status').optional().isIn(['todo', 'in-progress', 'review', 'completed', 'cancelled']),
  body('dueDate').optional().isISO8601().withMessage('Invalid due date format')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const task = await Task.findById(req.params.id).populate('project');
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    // Check access
    const hasAccess = task.project.owner.toString() === req.user._id.toString() ||
                     task.project.members.some(member => member.user.toString() === req.user._id.toString());

    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const updateFields = ['title', 'description', 'assignee', 'priority', 'status', 'dueDate', 'estimatedHours', 'progress', 'labels'];
    updateFields.forEach(field => {
      if (req.body[field] !== undefined) {
        task[field] = req.body[field];
      }
    });

    await task.save();

    const updatedTask = await Task.findById(task._id)
      .populate('assignee', 'firstName lastName username avatar')
      .populate('reporter', 'firstName lastName username avatar')
      .populate('project', 'name color');

    // Emit real-time update
    req.io.to(task.project._id.toString()).emit('task-updated', {
      task: updatedTask,
      projectId: task.project._id.toString()
    });

    res.json({
      message: 'Task updated successfully',
      task: updatedTask
    });

  } catch (error) {
    console.error('Update task error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/tasks/:id
// @desc    Delete task
// @access  Private
router.delete('/:id', auth, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id).populate('project');
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    // Check access (only project owner or task reporter can delete)
    const canDelete = task.project.owner.toString() === req.user._id.toString() ||
                     task.reporter.toString() === req.user._id.toString();

    if (!canDelete) {
      return res.status(403).json({ message: 'Access denied' });
    }

    await Task.findByIdAndDelete(req.params.id);

    // Emit real-time update
    req.io.to(task.project._id.toString()).emit('task-deleted', {
      taskId: req.params.id,
      projectId: task.project._id.toString()
    });

    res.json({ message: 'Task deleted successfully' });

  } catch (error) {
    console.error('Delete task error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/tasks/:id/comments
// @desc    Add comment to task
// @access  Private
router.post('/:id/comments', auth, [
  body('content').notEmpty().trim().withMessage('Comment content is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const task = await Task.findById(req.params.id).populate('project');
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    // Check access
    const hasAccess = task.project.owner.toString() === req.user._id.toString() ||
                     task.project.members.some(member => member.user.toString() === req.user._id.toString());

    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const comment = {
      author: req.user._id,
      content: req.body.content
    };

    task.comments.push(comment);
    await task.save();

    const updatedTask = await Task.findById(task._id)
      .populate('comments.author', 'firstName lastName username avatar');

    const newComment = updatedTask.comments[updatedTask.comments.length - 1];

    // Emit real-time update
    req.io.to(task.project._id.toString()).emit('comment-added', {
      taskId: task._id,
      comment: newComment,
      projectId: task.project._id.toString()
    });

    res.status(201).json({
      message: 'Comment added successfully',
      comment: newComment
    });

  } catch (error) {
    console.error('Add comment error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/tasks/analytics/dashboard
// @desc    Get task analytics for dashboard
// @access  Private
router.get('/analytics/dashboard', auth, async (req, res) => {
  try {
    // Get user's accessible projects
    const userProjects = await Project.find({
      $or: [
        { owner: req.user._id },
        { 'members.user': req.user._id }
      ]
    }).select('_id');

    const projectIds = userProjects.map(p => p._id);

    // Task status distribution
    const statusStats = await Task.aggregate([
      { $match: { project: { $in: projectIds }, isArchived: false } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    // Priority distribution
    const priorityStats = await Task.aggregate([
      { $match: { project: { $in: projectIds }, isArchived: false } },
      { $group: { _id: '$priority', count: { $sum: 1 } } }
    ]);

    // Tasks by assignee
    const assigneeStats = await Task.aggregate([
      { $match: { project: { $in: projectIds }, isArchived: false, assignee: { $ne: null } } },
      { $group: { _id: '$assignee', count: { $sum: 1 } } },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
      { $unwind: '$user' },
      { $project: { count: 1, name: { $concat: ['$user.firstName', ' ', '$user.lastName'] } } }
    ]);

    // Overdue tasks
    const overdueTasks = await Task.countDocuments({
      project: { $in: projectIds },
      isArchived: false,
      dueDate: { $lt: new Date() },
      status: { $ne: 'completed' }
    });

    // Recent activity (last 7 days)
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const recentActivity = await Task.find({
      project: { $in: projectIds },
      updatedAt: { $gte: weekAgo }
    })
    .populate('assignee', 'firstName lastName')
    .populate('project', 'name')
    .sort({ updatedAt: -1 })
    .limit(10);

    res.json({
      statusStats,
      priorityStats,
      assigneeStats,
      overdueTasks,
      recentActivity,
      totalTasks: await Task.countDocuments({ project: { $in: projectIds }, isArchived: false })
    });

  } catch (error) {
    console.error('Dashboard analytics error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;