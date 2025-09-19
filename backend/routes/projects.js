const express = require('express');
const { body, validationResult } = require('express-validator');
const Project = require('../models/Project');
const Task = require('../models/Task');
const { auth } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/projects
// @desc    Get user's projects
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const projects = await Project.find({
      $or: [
        { owner: req.user._id },
        { 'members.user': req.user._id }
      ],
      isArchived: false
    })
    .populate('owner', 'firstName lastName username avatar')
    .populate('members.user', 'firstName lastName username avatar')
    .populate('taskCount')
    .sort({ createdAt: -1 });

    res.json(projects);

  } catch (error) {
    console.error('Get projects error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/projects/:id
// @desc    Get single project
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id)
      .populate('owner', 'firstName lastName username avatar')
      .populate('members.user', 'firstName lastName username avatar')
      .populate('taskCount')
      .populate('completedTaskCount');

    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    // Check access
    const hasAccess = project.owner._id.toString() === req.user._id.toString() ||
                     project.members.some(member => member.user._id.toString() === req.user._id.toString());

    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json(project);

  } catch (error) {
    console.error('Get project error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/projects
// @desc    Create new project
// @access  Private
router.post('/', auth, [
  body('name').notEmpty().trim().withMessage('Project name is required'),
  body('description').optional().trim(),
  body('deadline').optional().isISO8601().withMessage('Invalid deadline format'),
  body('priority').optional().isIn(['low', 'medium', 'high', 'urgent'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, description, deadline, priority, color, tags } = req.body;

    const project = new Project({
      name,
      description: description || '',
      deadline: deadline || null,
      priority: priority || 'medium',
      color: color || '#2196F3',
      tags: tags || [],
      owner: req.user._id
    });

    await project.save();

    const populatedProject = await Project.findById(project._id)
      .populate('owner', 'firstName lastName username avatar')
      .populate('members.user', 'firstName lastName username avatar');

    res.status(201).json({
      message: 'Project created successfully',
      project: populatedProject
    });

  } catch (error) {
    console.error('Create project error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/projects/:id
// @desc    Update project
// @access  Private
router.put('/:id', auth, [
  body('name').optional().notEmpty().trim().withMessage('Project name cannot be empty'),
  body('deadline').optional().isISO8601().withMessage('Invalid deadline format'),
  body('priority').optional().isIn(['low', 'medium', 'high', 'urgent']),
  body('status').optional().isIn(['planning', 'active', 'on-hold', 'completed', 'cancelled'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    // Check if user is owner or admin member
    const isOwner = project.owner.toString() === req.user._id.toString();
    const isAdmin = project.members.some(member => 
      member.user.toString() === req.user._id.toString() && member.role === 'admin'
    );

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const updateFields = ['name', 'description', 'status', 'priority', 'deadline', 'color', 'tags', 'progress'];
    updateFields.forEach(field => {
      if (req.body[field] !== undefined) {
        project[field] = req.body[field];
      }
    });

    await project.save();

    const updatedProject = await Project.findById(project._id)
      .populate('owner', 'firstName lastName username avatar')
      .populate('members.user', 'firstName lastName username avatar');

    res.json({
      message: 'Project updated successfully',
      project: updatedProject
    });

  } catch (error) {
    console.error('Update project error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/projects/:id
// @desc    Delete project
// @access  Private
router.delete('/:id', auth, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    // Only owner can delete project
    if (project.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only project owner can delete the project' });
    }

    // Delete all tasks in the project
    await Task.deleteMany({ project: req.params.id });

    // Delete the project
    await Project.findByIdAndDelete(req.params.id);

    res.json({ message: 'Project and all associated tasks deleted successfully' });

  } catch (error) {
    console.error('Delete project error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/projects/:id/members
// @desc    Add member to project
// @access  Private
router.post('/:id/members', auth, [
  body('userId').isMongoId().withMessage('Valid user ID is required'),
  body('role').optional().isIn(['admin', 'member', 'viewer']).withMessage('Invalid role')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { userId, role = 'member' } = req.body;
    const project = await Project.findById(req.params.id);

    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    // Check if user is owner or admin
    const isOwner = project.owner.toString() === req.user._id.toString();
    const isAdmin = project.members.some(member => 
      member.user.toString() === req.user._id.toString() && member.role === 'admin'
    );

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Check if user is already a member
    const existingMember = project.members.find(member => 
      member.user.toString() === userId
    );

    if (existingMember) {
      return res.status(400).json({ message: 'User is already a member of this project' });
    }

    project.members.push({
      user: userId,
      role,
      joinedAt: new Date()
    });

    await project.save();

    const updatedProject = await Project.findById(project._id)
      .populate('members.user', 'firstName lastName username avatar');

    res.json({
      message: 'Member added successfully',
      project: updatedProject
    });

  } catch (error) {
    console.error('Add member error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/projects/:id/members/:userId
// @desc    Remove member from project
// @access  Private
router.delete('/:id/members/:userId', auth, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    // Check if user is owner or admin
    const isOwner = project.owner.toString() === req.user._id.toString();
    const isAdmin = project.members.some(member => 
      member.user.toString() === req.user._id.toString() && member.role === 'admin'
    );

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Cannot remove the owner
    if (req.params.userId === project.owner.toString()) {
      return res.status(400).json({ message: 'Cannot remove project owner' });
    }

    project.members = project.members.filter(member => 
      member.user.toString() !== req.params.userId
    );

    await project.save();

    res.json({ message: 'Member removed successfully' });

  } catch (error) {
    console.error('Remove member error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/projects/:id/analytics
// @desc    Get project analytics
// @access  Private
router.get('/:id/analytics', auth, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    // Check access
    const hasAccess = project.owner.toString() === req.user._id.toString() ||
                     project.members.some(member => member.user.toString() === req.user._id.toString());

    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Task statistics
    const taskStats = await Task.aggregate([
      { $match: { project: project._id, isArchived: false } },
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

    // Priority distribution
    const priorityStats = await Task.aggregate([
      { $match: { project: project._id, isArchived: false } },
      { $group: { _id: '$priority', count: { $sum: 1 } } }
    ]);

    // Member task distribution
    const memberStats = await Task.aggregate([
      { $match: { project: project._id, isArchived: false, assignee: { $ne: null } } },
      { $group: { _id: '$assignee', count: { $sum: 1 } } },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
      { $unwind: '$user' },
      { $project: { count: 1, name: { $concat: ['$user.firstName', ' ', '$user.lastName'] } } }
    ]);

    // Recent activity
    const recentTasks = await Task.find({ project: project._id })
      .populate('assignee', 'firstName lastName')
      .sort({ updatedAt: -1 })
      .limit(5);

    res.json({
      taskStats: taskStats[0] || { total: 0, completed: 0, inProgress: 0, todo: 0, overdue: 0 },
      priorityStats,
      memberStats,
      recentTasks,
      project: {
        name: project.name,
        progress: project.progress,
        daysRemaining: project.daysRemaining
      }
    });

  } catch (error) {
    console.error('Project analytics error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;