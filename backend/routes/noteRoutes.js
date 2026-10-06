const express = require('express');
const path = require('path');
const fs = require('fs');
const Note = require('../models/Note');
const User = require('../models/User');
const auth = require('../middleware/auth');
const upload = require('../config/upload');
const { notifyUsers, notifyNoteRoom } = require('../config/realtime');

const router = express.Router();
router.use(auth);

function collaboratorIds(note) {
  return [note.owner._id || note.owner, ...note.sharedWith.map(u => u._id || u)];
}

function canAccess(note, userId) {
  const isOwner = (note.owner._id || note.owner).toString() === userId;
  const isShared = note.sharedWith.some(u => (u._id || u).toString() === userId);
  return isOwner || isShared || note.isPublic;
}

// Get all notes owned by or shared with the logged-in user.
// Optional filters: q (full-text search of title/content/tags), tag, folder.
router.get('/', async (req, res) => {
  try {
    const filter = { $and: [{ $or: [{ owner: req.userId }, { sharedWith: req.userId }] }] };

    if (req.query.q) filter.$and.push({ $text: { $search: req.query.q } });
    if (req.query.tag) filter.$and.push({ tags: req.query.tag });
    if (req.query.folder) filter.$and.push({ folder: req.query.folder });

    const notes = await Note.find(filter)
      .populate('owner', 'name email')
      .populate('sharedWith', 'name email')
      .select('-versions') // list view doesn't need full version history payloads
      .sort({ updatedAt: -1 });
    res.json(notes);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Distinct tags and folders across the user's own + shared notes, for building filter UI
router.get('/meta/tags-and-folders', async (req, res) => {
  try {
    const scope = { $or: [{ owner: req.userId }, { sharedWith: req.userId }] };
    const [tags, folders] = await Promise.all([
      Note.distinct('tags', scope),
      Note.distinct('folder', { ...scope, folder: { $ne: '' } })
    ]);
    res.json({ tags: tags.sort(), folders: folders.sort() });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Get a single note
router.get('/:id', async (req, res) => {
  try {
    const note = await Note.findById(req.params.id)
      .populate('owner', 'name email')
      .populate('sharedWith', 'name email');
    if (!note) return res.status(404).json({ message: 'Note not found' });
    if (!canAccess(note, req.userId)) return res.status(403).json({ message: 'Access denied' });
    res.json(note);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Create a note — optionally shared with all registered users or a chosen
// subset, and with files attached, all in the same request.
router.post('/', upload.array('files', 5), async (req, res) => {
  try {
    const { title, content, folder } = req.body;
    if (!title || !content) return res.status(400).json({ message: 'Title and content are required' });

    const isPublic = req.body.isPublic === 'true' || req.body.isPublic === true;
    const shareWithAll = req.body.shareWithAll === 'true' || req.body.shareWithAll === true;

    let tags = [];
    if (req.body.tags) {
      try {
        const parsed = typeof req.body.tags === 'string' ? JSON.parse(req.body.tags) : req.body.tags;
        if (Array.isArray(parsed)) tags = parsed.map(t => String(t).trim().toLowerCase()).filter(Boolean).slice(0, 15);
      } catch (e) { tags = []; }
    }

    let selectedIds = [];
    if (req.body.shareWith) {
      try {
        const parsed = typeof req.body.shareWith === 'string' ? JSON.parse(req.body.shareWith) : req.body.shareWith;
        if (Array.isArray(parsed)) selectedIds = parsed;
      } catch (e) {
        selectedIds = [];
      }
    }

    let recipientIds = [];
    if (shareWithAll) {
      const allUsers = await User.find({ _id: { $ne: req.userId } }, '_id');
      recipientIds = allUsers.map(u => u._id);
    } else if (selectedIds.length) {
      recipientIds = selectedIds.filter(id => id !== req.userId);
    }

    const attachments = (req.files || []).map(f => ({
      originalName: f.originalname,
      storedName: f.filename,
      mimeType: f.mimetype,
      size: f.size
    }));

    const note = await Note.create({
      title,
      content,
      isPublic: !!isPublic,
      owner: req.userId,
      sharedWith: recipientIds,
      attachments,
      tags,
      folder: (folder || '').trim()
    });

    const populated = await Note.findById(note._id)
      .populate('owner', 'name email')
      .populate('sharedWith', 'name email');

    notifyUsers([req.userId], 'note:created', { noteId: note._id });
    if (recipientIds.length) notifyUsers(recipientIds, 'note:shared', { noteId: note._id });

    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Update a note (owner only)
router.put('/:id', async (req, res) => {
  try {
    const note = await Note.findById(req.params.id);
    if (!note) return res.status(404).json({ message: 'Note not found' });
    if (note.owner.toString() !== req.userId) return res.status(403).json({ message: 'Only the owner can edit this note' });

    const { title, content, isPublic, tags, folder } = req.body;

    // Only snapshot when the actual text is changing — toggling isPublic/tags/folder alone isn't a content edit
    const contentChanging = (title !== undefined && title !== note.title) || (content !== undefined && content !== note.content);
    if (contentChanging) note.snapshotBeforeEdit();

    if (title !== undefined) note.title = title;
    if (content !== undefined) note.content = content;
    if (isPublic !== undefined) note.isPublic = isPublic;
    if (Array.isArray(tags)) note.tags = tags.map(t => String(t).trim().toLowerCase()).filter(Boolean).slice(0, 15);
    if (folder !== undefined) note.folder = String(folder).trim();
    await note.save();

    notifyUsers(collaboratorIds(note), 'note:updated', { noteId: note._id });
    notifyNoteRoom(note._id, 'note:saved', { noteId: note._id, title: note.title, content: note.content });
    res.json(note);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// --- Version history ---

// List past snapshots of a note (anyone with access can review history)
router.get('/:id/versions', async (req, res) => {
  try {
    const note = await Note.findById(req.params.id);
    if (!note) return res.status(404).json({ message: 'Note not found' });
    if (!canAccess(note, req.userId)) return res.status(403).json({ message: 'Access denied' });
    res.json([...note.versions].reverse()); // most recent first
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Restore a note to a past version (owner only) — the current state is kept as a new snapshot first
router.post('/:id/versions/:versionId/restore', async (req, res) => {
  try {
    const note = await Note.findById(req.params.id);
    if (!note) return res.status(404).json({ message: 'Note not found' });
    if (note.owner.toString() !== req.userId) return res.status(403).json({ message: 'Only the owner can restore a version' });

    const version = note.versions.id(req.params.versionId);
    if (!version) return res.status(404).json({ message: 'Version not found' });

    note.snapshotBeforeEdit();
    note.title = version.title;
    note.content = version.content;
    await note.save();

    notifyUsers(collaboratorIds(note), 'note:updated', { noteId: note._id });
    notifyNoteRoom(note._id, 'note:saved', { noteId: note._id, title: note.title, content: note.content });
    res.json(note);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Delete a note (owner only)
router.delete('/:id', async (req, res) => {
  try {
    const note = await Note.findById(req.params.id);
    if (!note) return res.status(404).json({ message: 'Note not found' });
    if (note.owner.toString() !== req.userId) return res.status(403).json({ message: 'Only the owner can delete this note' });

    const collaborators = collaboratorIds(note);
    // Remove attachment files from disk
    note.attachments.forEach(a => {
      const filePath = path.join(__dirname, '..', 'uploads', a.storedName);
      fs.unlink(filePath, () => {});
    });

    await note.deleteOne();
    notifyUsers(collaborators, 'note:deleted', { noteId: req.params.id });
    res.json({ message: 'Note deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Share a note with another user by email (owner only)
router.post('/:id/share', async (req, res) => {
  try {
    const { email } = req.body;
    const note = await Note.findById(req.params.id);
    if (!note) return res.status(404).json({ message: 'Note not found' });
    if (note.owner.toString() !== req.userId) return res.status(403).json({ message: 'Only the owner can share this note' });

    const targetUser = await User.findOne({ email: (email || '').toLowerCase() });
    if (!targetUser) return res.status(404).json({ message: 'No user found with that email' });
    if (targetUser._id.toString() === req.userId) return res.status(400).json({ message: 'You already own this note' });

    if (!note.sharedWith.some(id => id.toString() === targetUser._id.toString())) {
      note.sharedWith.push(targetUser._id);
      await note.save();
      notifyUsers([targetUser._id], 'note:shared', { noteId: note._id });
    }

    const populated = await note.populate('sharedWith', 'name email');
    res.json(populated);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// --- Attachments ---

// Upload one or more files to a note (owner only)
router.post('/:id/attachments', upload.array('files', 5), async (req, res) => {
  try {
    const note = await Note.findById(req.params.id);
    if (!note) return res.status(404).json({ message: 'Note not found' });
    if (note.owner.toString() !== req.userId) return res.status(403).json({ message: 'Only the owner can add attachments' });

    const files = req.files || [];
    files.forEach(f => {
      note.attachments.push({
        originalName: f.originalname,
        storedName: f.filename,
        mimeType: f.mimetype,
        size: f.size
      });
    });
    await note.save();

    notifyUsers(collaboratorIds(note), 'note:updated', { noteId: note._id });
    res.status(201).json(note.attachments);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// List attachments for a note
router.get('/:id/attachments', async (req, res) => {
  try {
    const note = await Note.findById(req.params.id);
    if (!note) return res.status(404).json({ message: 'Note not found' });
    if (!canAccess(note, req.userId)) return res.status(403).json({ message: 'Access denied' });
    res.json(note.attachments);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Download a single attachment
router.get('/:id/attachments/:attachmentId/download', async (req, res) => {
  try {
    const note = await Note.findById(req.params.id);
    if (!note) return res.status(404).json({ message: 'Note not found' });
    if (!canAccess(note, req.userId)) return res.status(403).json({ message: 'Access denied' });

    const attachment = note.attachments.id(req.params.attachmentId);
    if (!attachment) return res.status(404).json({ message: 'Attachment not found' });

    const filePath = path.join(__dirname, '..', 'uploads', attachment.storedName);
    if (!fs.existsSync(filePath)) return res.status(404).json({ message: 'File missing on server' });

    res.download(filePath, attachment.originalName);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Delete an attachment (owner only)
router.delete('/:id/attachments/:attachmentId', async (req, res) => {
  try {
    const note = await Note.findById(req.params.id);
    if (!note) return res.status(404).json({ message: 'Note not found' });
    if (note.owner.toString() !== req.userId) return res.status(403).json({ message: 'Only the owner can remove attachments' });

    const attachment = note.attachments.id(req.params.attachmentId);
    if (!attachment) return res.status(404).json({ message: 'Attachment not found' });

    const filePath = path.join(__dirname, '..', 'uploads', attachment.storedName);
    fs.unlink(filePath, () => {});
    attachment.deleteOne();
    await note.save();

    notifyUsers(collaboratorIds(note), 'note:updated', { noteId: note._id });
    res.json({ message: 'Attachment removed' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

module.exports = router;
