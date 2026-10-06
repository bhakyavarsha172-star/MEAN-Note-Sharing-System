const mongoose = require('mongoose');

const attachmentSchema = new mongoose.Schema({
  originalName: { type: String, required: true },
  storedName: { type: String, required: true },
  mimeType: { type: String, required: true },
  size: { type: Number, required: true },
  uploadedAt: { type: Date, default: Date.now }
});

// A snapshot of the note taken right before each edit, so past content can be reviewed or restored
const versionSchema = new mongoose.Schema({
  title: { type: String, required: true },
  content: { type: String, required: true },
  editedAt: { type: Date, default: Date.now }
});

const MAX_VERSIONS = 20;

const noteSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  content: { type: String, required: true }, // stores HTML from the rich text editor
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  isPublic: { type: Boolean, default: false },
  sharedWith: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  attachments: [attachmentSchema],

  tags: { type: [String], default: [] },
  folder: { type: String, trim: true, default: '', maxlength: 60 },

  versions: { type: [versionSchema], default: [] }
}, { timestamps: true });

noteSchema.index({ title: 'text', content: 'text', tags: 'text' });

// Call before mutating title/content — pushes the current state into history
noteSchema.methods.snapshotBeforeEdit = function () {
  this.versions.push({ title: this.title, content: this.content });
  if (this.versions.length > MAX_VERSIONS) {
    this.versions = this.versions.slice(this.versions.length - MAX_VERSIONS);
  }
};

module.exports = mongoose.model('Note', noteSchema);
