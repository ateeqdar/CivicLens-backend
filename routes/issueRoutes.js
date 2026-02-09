const express = require('express');
const router = express.Router();
const issueController = require('../controllers/issueController');
const { authenticate, authorize } = require('../middlewares/auth');

// Public: Get all issues for Transparency Wall
router.get(
  '/public',
  issueController.getAllIssues
);

// Citizen: Report issue
router.post(
  '/', 
  authenticate, 
  authorize(['citizen']), 
  issueController.createIssue
);

// Citizen: Get my issues
router.get(
  '/my', 
  authenticate, 
  authorize(['citizen']), 
  issueController.getMyIssues
);

// Head Authority: Get issues
router.get(
  '/authority', 
  authenticate, 
  authorize(['head_authority']), 
  issueController.getAuthorityIssues
);

// Head Authority: Update status
router.patch(
  '/:id/status', 
  authenticate, 
  authorize(['head_authority']), 
  issueController.updateStatus
);

// Head Authority: Reassign issue
router.patch(
  '/:id/reassign', 
  authenticate, 
  authorize(['head_authority']), 
  issueController.reassignIssue
);

// Public: Get single issue detail
router.get(
  '/:id',
  issueController.getIssueById
);

// Head Authority: Delete issue
router.delete(
  '/:id',
  authenticate,
  authorize(['head_authority']),
  issueController.deleteIssue
);

// Head Authority: Bulk delete issues
router.post(
  '/bulk-delete',
  authenticate,
  authorize(['head_authority']),
  issueController.bulkDeleteIssues
);

module.exports = router;
