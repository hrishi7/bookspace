import mongoose, { Schema, Document as MongooseDocument } from 'mongoose';

/**
 * Comment Interface
 * 
 * Interview Topic: Nested Comments (Tree Structure in MongoDB)
 * 
 * Two approaches:
 * 1. Parent Reference (our approach)
 *    - Each comment has parentId
 *    - Query: Get all comments, build tree in code
 *    - Pros: Simple writes, flexible
 *    - Cons: Multiple queries or post-processing
 * 
 * 2. Child References
 *    - Each comment has replies: [childId]
 *    - Query: Recursive lookup
 *    - Pros: Tree structure in DB
 *    - Cons: Complicated nested writes
 * 
 * 3. Materialized Path
 *    - path: "/1/2/3"
 *    - Query: path regex
 *    - Pros: Efficient subtree queries
 *    - Cons: Path updates on reparenting
 */
export interface IComment extends MongooseDocument {
  docId: string;
  userId: string;
  text: string;
  parentId: string | null; // null = top-level comment
  level: number; // 0, 1, or 2 (max 3 levels: 0, 1, 2)
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Comment Schema
 */
const CommentSchema = new Schema<IComment>({
  docId: {
    type: String,
    required: [true, 'Document ID is required'],
    index: true, // Index for querying document's comments
  },
  userId: {
    type: String,
    required: [true, 'User ID is required'],
  },
  text: {
    type: String,
    required: [true, 'Comment text is required'],
    minlength: [1, 'Comment cannot be empty'],
    maxlength: [1000, 'Comment too long'],
  },
  parentId: {
    type: String,
    default: null,
    index: true, // Index for finding replies
  },
  level: {
    type: Number,
    required: true,
    default: 0,
    min: 0,
    max: 2, // Max 3 levels (0, 1, 2)
    validate: {
      validator: function(level: number) {
        return [0, 1, 2].includes(level);
      },
      message: 'Level must be 0, 1, or 2'
    }
  },
}, {
  timestamps: true,
  collection: 'comments',
});

/**
 * Indexes
 */

// Compound index for document's comments
CommentSchema.index({ docId: 1, createdAt: 1 });

// Index for finding replies to a comment
CommentSchema.index({ parentId: 1 });

/**
 * Static Methods
 */

// Get all comments for a document (with nesting)
CommentSchema.statics.findByDocument = async function(docId: string) {
  const comments = await this.find({ docId })
    .sort({ createdAt: 1 })
    .lean();

  // Build nested structure
  return buildCommentTree(comments);
};

// Add comment with level validation
CommentSchema.statics.addComment = async function(
  docId: string,
  userId: string,
  text: string,
  parentId: string | null = null
) {
  let level = 0;

  if (parentId) {
    // Find parent to determine level
    const parent = await this.findById(parentId);
    if (!parent) {
      throw new Error('Parent comment not found');
    }

    level = parent.level + 1;

    if (level > 2) {
      throw new Error('Maximum nesting level (3) reached');
    }
  }

  return this.create({
    docId,
    userId,
    text,
    parentId,
    level,
  });
};

/**
 * Helper: Build comment tree from flat array
 * 
 * Interview Topic: Tree Building Algorithm
 * 
 * Approach: Two-pass algorithm
 * 1. First pass: Create map of id → comment
 * 2. Second pass: Attach children to parents
 * 
 * Time complexity: O(n)
 * Space complexity: O(n)
 */
function buildCommentTree(comments: any[]): any[] {
  // Map for quick lookup
  const commentMap = new Map();
  const rootComments: any[] = [];

  // Initialize map and add replies array
  comments.forEach(comment => {
    commentMap.set(comment._id.toString(), {
      ...comment,
      replies: [],
    });
  });

  // Build tree
  comments.forEach(comment => {
    const commentWithReplies = commentMap.get(comment._id.toString());

    if (comment.parentId) {
      // Has parent - add to parent's replies
      const parent = commentMap.get(comment.parentId.toString());
      if (parent) {
        parent.replies.push(commentWithReplies);
      } else {
        // Parent not found (orphaned comment) - treat as root
        rootComments.push(commentWithReplies);
      }
    } else {
      // No parent - root comment
      rootComments.push(commentWithReplies);
    }
  });

  return rootComments;
}

/**
 * Export Model
 */
export const CommentModel = mongoose.model<IComment>('Comment', CommentSchema);
