# Phase 6 Interview Q&A - Search & Indexing

Production-ready answers for Elasticsearch, full-text search, and search optimization interviews.

---

## Q1: "How does Elasticsearch work? What is an inverted index?"

**Answer:**

**Inverted Index** = Core data structure that makes search fast

**Normal Index (Database):**
```
Doc 1 → "Node.js is fast"
Doc 2 → "Node.js and Express"
```

**Inverted Index (Elasticsearch):**
```
"node.js"  → [Doc 1, Doc 2]
"fast"     → [Doc 1]
"express"  → [Doc 2]
```

**How Search Works:**
```
1. Indexing: Document → Tokenize → Build inverted index
2. Searching: Query → Lookup in index → Get document IDs
3. Scoring: Rank results by relevance (TF-IDF / BM25)
```

**Example:**
```javascript
// Index document
await esClient.index({
  index: 'documents',
  document: {
    title: "Node.js Tutorial",
    content: "Learn Node.js basics..."
  },
});

// Search
await esClient.search({
  query: {
    match: { title: "Node.js" } // → Instant lookup in inverted index
  },
});
```

**Why It's Fast:**
- **O(1) lookup**: Direct index access (not scanning documents)
- **Pre-computed**: Index built once, queried many times
- **Optimized**: Skip lists, compression, caching

**Interview Tip:** Emphasize **inverted index enables instant search**!

---

## Q2: "Explain relevance scoring: TF-IDF vs BM25"

**Answer:**

**TF-IDF** (Term Frequency - Inverse Document Frequency):

**Formula:** `Score = TF × IDF`

- **TF** = How often term appears in document
- **IDF** = How rare term is across all documents

**Example:**
```
Query: "Node.js tutorial"

Doc A: "Node.js tutorial for beginners" (3 words)
- TF("Node.js") = 1/3 = 0.33
- I DF("Node.js") = log(total_docs / docs_with_term) = high (rare)
- Score = 0.33 × high = HIGH

Doc B: "Everything about everything" (3 words)
- TF("Node.js") = 0
- Score = 0
```

**BM25** (Best Match 25) - Modern algorithm (Elasticsearch default):

**Improvements over TF-IDF:**
1. **Saturation**: Diminishing returns for term frequency
   - "Node.js" appearing 100x doesn't mean 100x more relevant
2. **Document length normalization**: Longer docs don't rank higher just because
3. **Tunable parameters**: k1 (saturation), b (length norm)

**Formula (simplified):**
```
Score = IDF × (TF × (k1 + 1)) / (TF + k1 × (1 - b + b × doc_length / avg_doc_length))
```

**Our Implementation:**
```typescript
await esClient.search({
  query: {
    multi_match: {
      query: "Node.js",
      fields: ['title^3', 'content'], // title 3x boost
      type: 'best_fields', // BM25 scoring
    },
  },
});
```

**Interview Tip:** Mention **BM25 is industry standard** and **handles edge cases better**!

---

## Q3: "How do you implement auto-complete/suggestions?"

**Answer:**

**Three Approaches:**

**1. Prefix Matching** (Simple but limited):
```json
{
  "query": {
    "prefix": {
      "title": "nod" // Matches "node.js"
    }
  }
}
```
- Fast for exact prefixes
- No typo tolerance
- Not ranking-aware

**2. N-grams** (Flexible but slower):
```
"node.js" → ["no", "od", "de", "e.", "node", "ode.", ...]
```
- Matches partial words
- More storage
- Slower indexing

**3. Completion Suggester** (Optimized - our choice):
```typescript
// Index with completion field
mappings: {
  properties: {
    title: {
      type: 'text',
      fields: {
        completion: { type: 'completion' } // Special field!
      },
    },
  },
}

// Query completion suggester
await esClient.search({
  suggest: {
    title_suggest: {
      prefix: "nod",
      completion: {
        field: 'title.completion',
        size: 10,
      },
    },
  },
});
```

**How Completion Suggester Works:**
- **FST** (Finite State Transducer) data structure
- **Prefix tree** optimized for auto-complete
- **Sub-millisecond** response times
- **Ranked** by document frequency/score

**Benefits:**
- **Very fast**: ~1-5ms
- **Memory efficient**: Compressed FST
- **Ranking-aware**: Popular suggestions first

**Interview Tip:** Mention **completion suggester uses special data structure (FST)**!

---

## Q4: "What is faceted search? How do you implement it?"

**Answer:**

**Faceted Search** = Filters + Counts (like Amazon sidebar)

**Example:**
```
Search: "laptop"

Filters:
✓ Brand
  - Dell (142)
  - HP (98)
  - Lenovo (76)
✓ Price
  - $500-$1000 (231)
  - $1000-$1500 (89)
✓ Rating
  - 4+ stars (156)
```

**Our Implementation:**
```typescript
await esClient.search({
  query: {
    match: { content: "guide" },
  },
  aggs: { // Aggregations = Facets
    top_tags: {
      terms: {
        field: 'tags', // Must be 'keyword' type!
        size: 10,
      },
    },
    authors: {
      terms: {
        field: 'createdBy',
        size: 10,
      },
    },
  },
});

// Response:
{
  "aggregations": {
    "top_tags": {
      "buckets": [
        { "key": "api", "doc_count": 45 },
        { "key": "tutorial", "doc_count": 32 },
      ]
    }
  }
}
```

**Key Concepts:**

**1. Mapping:**
```typescript
tags: { type: 'keyword' } // NOT 'text'!
// keyword = exact match (no analysis)
// text = analyzed (tokenized)
```

**2. Aggregation Types:**
- **terms**: Top N values with counts
- **range**: Numeric/date ranges
- **histogram**: Buckets by interval
- **filters**: Named filters

**3. Combining Filters:**
```typescript
query: {
  bool: {
    must: [{ match: { content: "guide" } }],
    filter: [
      { terms: { tags: ["api", "rest"] } }, // AND
    ],
  },
}
```

**Interview Tip:** Mention **facets = aggregations** and **keyword vs text**!

---

## Q5: "How do you handle typos in search? (Fuzzy matching)"

**Answer:**

**Fuzzy Matching** = Typo tolerance using Levenshtein distance

**Levenshtein Distance** = Number of edits to transform one word to another

**Examples:**
- "nod" → "node" = 1 edit (insert 'e')
- "noed" → "node" = 1 edit (swap 'e' and 'd')
- "nodee" → "node" = 1 edit (delete 'e')

**Our Implementation:**
```typescript
await esClient.search({
  query: {
    multi_match: {
      query: "nodee tutorail", // Typos!
      fields: ['title', 'content'],
      fuzziness: 'AUTO', // Smart fuzzy matching
    },
  },
});

// Matches:
// - "node tutorial" (corrected both typos)
// - "nodejs tutorial"
```

**Fuzziness Levels:**
- **0**: Exact match only
- **1**: 1-edit typos (short words)
- **2**: 2-edit typos (long words)
- **AUTO**: Smart (our choice)
  - 0-2 length: exact
  - 3-5 length: fuzziness=1
  - 6+ length: fuzziness=2

**Performance Considerations:**

**Good:**
```typescript
fuzziness: 'AUTO', // Elasticsearch is smart!
```

**Bad (too slow):**
```typescript
fuzziness: 3, // Explores too many variations
```

**Advanced: Prefix + Fuzzy:**
```typescript
{
  prefix: { title: "nod" }, // Fast prefix match first
  match: {
    title: {
      query: "nodee",
      fuzziness: 1, // Then fuzzy if needed
    },
  },
}
```

**Interview Tip:** Mention **Levenshtein distance** and **AUTO fuzziness balances accuracy/performance**!

---

## Q6: "Elasticsearch vs MongoDB text search vs Algolia?"

**Answer:**

| Aspect | Elasticsearch | MongoDB Text Search | Algolia |
|--------|---------------|---------------------|---------|
| **Type** | Search engine | Database | Managed search service |
| **Best for** | Complex search | Simple search | Instant search UX |
| **Relevance** | BM25 (excellent) | Basic TF-IDF | Custom (excellent) |
| **Speed** | Very fast | Slow for large data | Extremely fast (CDN) |
| **Auto-complete** | Completion suggester | Regex (slow) | Optimized |
| **Facets** | Aggregations | Aggregations | Built-in |
| **Typo tolerance** | Fuzzy matching | Fuzzy (limited) | Phonetic + fuzzy |
| **Cost** | Self-hosted (free) | Included with MongoDB | $1/1000 searches |
| **Ops complexity** | Medium-high | Low (already have DB) | Zero (managed) |
| **Scale** | Horizontal | Vertical | Infinite (managed) |

**When to Use:**

**Elasticsearch:**
- Need advanced search features (our choice)
- Willing to self-host
- Complex queries and analytics
- Have devops expertise

**MongoDB Text Search:**
- Simple keyword search
- Don't want extra infrastructure
- Already using MongoDB

**Algolia:**
- Need instant results (<10ms)
- Don't want to manage search
- Have budget ($$$)
- Need typo tolerance out-of-the-box

**Our Choice: Elasticsearch**
- Production-grade relevance (BM25)
- Full control over ranking
- Advanced features (auto-complete, facets, analytics)
- Free (self-hosted)
- Interview-worthy (most companies use it)

**Interview Tip:** Know **trade-offs** and when to use each!

---

## Q7: "How do you optimize search performance?"

**Answer:**

**1. Index Optimization:**

**Sharding:**
```typescript
settings: {
  number_of_shards: 3, // Distribute data
  number_of_replicas: 1, // Redundancy
}
```
- More shards = Parallel processing
- Too many shards = Overhead

**Analyzers:**
```typescript
analysis: {
  analyzer: {
    custom_analyzer: {
      tokenizer: 'standard',
      filter: ['lowercase', 'stop', 'snowball'], // Optimize tokenization
    },
  },
}
```

**2. Query Optimization:**

**Field Boosting:**
```typescript
fields: ['title^3', 'content'], // Title 3x more important
```

**Filter Context (Fast):**
```typescript
filter: [
  { term: { status: 'published' } } // Cached, not scored
]
```

**Query Context (Slower):**
```typescript
must: [
  { match: { content: "guide" } } // Scored (slower)
]
```

**3. Caching:**

**Filter Cache:**
```typescript
// Elasticsearch caches filter results
filter: [{ term: { tags: "api" } }] // Cached!
```

**Request Cache:**
```typescript
// Cache entire response for identical queries
request_cache: true
```

**4. Pagination:**

**Offset-based (Slow for deep pages):**
```typescript
from: 1000, // Skip 1000 docs = slow!
size: 20,
```

**Search After (Fast):**
```typescript
search_after: [1234, "doc_id"], // Resume from last result
```

**5. Indexing Strategy:**

**Bulk Indexing:**
```typescript
// BAD: 1000 individual requests
for (doc of docs) {
  await es.index({ document: doc });
}

// GOOD: 1 bulk request
await es.bulk({
  operations: docs.flatMap(doc => [
    { index: { _id: doc.id } },
    doc,
  ]),
});
```

**Interview Tip:** Mention **filter cache** and **bulk operations**!

---

## Q8: "How do you implement search analytics?"

**Answer:**

**What to Track:**
1. **Query terms**: What users search for
2. **Zero-result queries**: Gaps in content
3. **Click-through rate (CTR)**: Which results users click
4. **Query refinements**: How users adjust searches
5. **Search latency**: Performance metrics

**Our Implementation:**

**1. Log Search Queries:**
```typescript
router.get('/search', async (req, res) => {
  const { q, userId } = req.query;
  
  // Log to analytics
  await logSearchQuery({
    query: q,
    userId,
    timestamp: new Date(),
    resultsCount: results.length,
  });
  
  res.json({ results });
});
```

**2. Track Clicks:**
```typescript
router.post('/search/click', async (req, res) => {
  const { query, documentId, position } = req.body;
  
  await logSearchClick({
    query,
    documentId,
    position, // Clicked 3rd result
    timestamp: new Date(),
  });
});
```

**3. Analyze with Elasticsearch Aggregations:**
```typescript
// Top searches
await es.search({
  index: 'search_logs',
  aggs: {
    top_queries: {
      terms: { field: 'query.keyword', size: 100 },
    },
    zero_result_queries: {
      filter: { term: { resultsCount: 0 } },
      aggs: {
        queries: {
          terms: { field: 'query.keyword', size: 50 },
        },
      },
    },
  },
});
```

**4. Calculate CTR:**
```typescript
CTR = clicks / impressions

Example:
- Query "Node.js" shown 100 times
- Clicked 15 times
- CTR = 15 / 100 = 15%
```

**5. Use for Ranking Improvements:**
```typescript
// Boost popular results
await es.search({
  query: {
    function_score: {
      query: { match: { title: query } },
      functions: [{
        field_value_factor: {
          field: 'click_count', // Boost by clicks
          modifier: 'log1p',
        },
      }],
    },
  },
});
```

**Benefits:**
- **Identify content gaps** (zero-result queries)
- **Improve ranking** (boost clicked results)
- **Understand users** (intent analysis)
- **A/B testing** (compare ranking algorithms)

**Interview Tip:** Mention **CTR** and **using analytics to improve ranking**!

---

## Topics Covered

✅ Inverted Index (how Elasticsearch works)
✅ TF-IDF vs BM25 (relevance scoring)
✅ Auto-complete (completion suggester, FST)
✅ Faceted Search (aggregations)
✅ Fuzzy Matching (Levenshtein distance, typo tolerance)
✅ Elasticsearch vs MongoDB vs Algolia (trade-offs)
✅ Search Optimization (sharding, caching, bulk operations)
✅ Search Analytics (CTR, zero-result queries)

**All Phase 6 concepts ready for senior-level interviews!** 🚀
