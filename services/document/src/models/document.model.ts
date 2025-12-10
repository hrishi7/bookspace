import mongoose, { Schema, Document as MongooseDocument } from 'mongoose';

/**
 * Document Version Interface
 * 
 * Interview Topic: Document Versioning Strategies
 * 
 * Two main approaches:
 * 1. Snapshot versioning (our approach)
 *    - Store complete document state per version
 *    - Pros: Fast reads, simple rollback
 *    - Cons: More storage
 * 
 * 2. Delta versioning
 *    - Store only changes between versions
 *    - Pros: Less storage
 *    - Cons: Slow reconstruction, complex rollback
 * 
 * We choose snapshot for simplicity and read performance
 */
export interface IDocumentVersion {
  version: number;
  content: string;
  updatedAt: Date;
  updatedBy: string; // userId
}

/**
 * Document Interface
 */
export interface IDocument extends MongooseDocument {
  title: string;
  content: string;
  tags: string[];
  versions: IDocumentVersion[];
  createdBy: string; // userId
  createdAt: Date;
  updatedAt: Date;
  
  // Instance methods
  addVersion(content: string, userId: string): void;
  getVersion(version: number): IDocumentVersion | undefined;
  
  // Virtual properties
  currentVersion: number;
}


/**
 * Document Version Schema
 */
const DocumentVersionSchema = new Schema<IDocumentVersion>({
  version: {
    type: Number,
    required: true,
  },
  content: {
    type: String,
    required: true,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
  updatedBy: {
    type: String,
    required: true,
  },
}, { _id: false }); // Don't create _id for subdoc

/**
 * Document Schema
 */
const DocumentSchema = new Schema<IDocument>({
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
    minlength: [1, 'Title cannot be empty'],
    maxlength: [200, 'Title too long'],
  },
  content: {
    type: String,
    required: [true, 'Content is required'],
  },
  tags: {
    type: [String],
    default: [],
    validate: {
      validator: function(tags: string[]) {
        return tags.length <= 10;
      },
      message: 'Maximum 10 tags allowed'
    }
  },
  versions: {
    type: [DocumentVersionSchema],
    default: [],
  },
  createdBy: {
    type: String,
    required: [true, 'CreatedBy is required'],
    index: true, // Index for querying user's documents
  },
}, {
  timestamps: true, // Adds createdAt and updatedAt
  collection: 'documents',
});

/**
 * Indexes
 * 
 * Interview Topic: MongoDB Indexing
 * 
 * Indexes speed up queries but slow down writes
 * Trade-off: Read performance vs Write performance
 */

// Text index for full-text search
DocumentSchema.index({
  title: 'text',
  content: 'text',
  tags: 'text',
}, {
  weights: {
    title: 10,    // Title matches more important
    tags: 5,      // Tag matches medium importance
    content: 1,   // Content matches least important
  },
  name: 'document_text_index',
});

// Compound index for user's documents sorted by date
DocumentSchema.index({ createdBy: 1, createdAt: -1 });

// Index for tag queries
DocumentSchema.index({ tags: 1 });

/**
 * Instance Methods
 */

// Add new version
DocumentSchema.methods.addVersion = function(content: string, userId: string) {
  const currentVersion = this.versions.length;
  this.versions.push({
    version: currentVersion + 1,
    content,
    updatedAt: new Date(),
    updatedBy: userId,
  });
  this.content = content; // Update current content
};

// Get specific version
DocumentSchema.methods.getVersion = function(version: number) {
  return this.versions.find(v => v.version === version);
};

/**
 * Static Methods
 */

// Find documents by user
DocumentSchema.statics.findByUser = function(userId: string) {
  return this.find({ createdBy: userId })
    .sort({ createdAt: -1 })
    .select('-versions'); // Exclude versions for list view
};

// Search documents
DocumentSchema.statics.search = function(query: string, options: any = {}) {
  return this.find(
    { $text: { $search: query } },
    { score: { $meta: 'textScore' } } // Include relevance score
  )
    .sort({ score: { $meta: 'textScore' } }) // Sort by relevance
    .limit(options.limit || 20);
};

/**
 * Virtuals
 */

// Current version number
DocumentSchema.virtual('currentVersion').get(function() {
  return this.versions.length || 1;
});

// Include virtuals in JSON
DocumentSchema.set('toJSON', { virtuals: true });
DocumentSchema.set('toObject', { virtuals: true });

/**
 * Export Model
 */
export const DocumentModel = mongoose.model<IDocument>('Document', DocumentSchema);
