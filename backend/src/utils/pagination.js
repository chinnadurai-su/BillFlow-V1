// pagination.js — parse offset-based pagination params from a query object (Spec Section 8).
//
// Default limit is 20; hard-capped at 100 so a client can't request an unbounded page.
// Pure and side-effect free → trivially unit-testable.

/**
 * @param {object} [query] typically req.query
 * @returns {{ page: number, limit: number, skip: number }}
 */
function parsePagination(query = {}) {
  const rawLimit = parseInt(query.limit, 10);
  const rawPage = parseInt(query.page, 10);

  const limit = Math.min(Math.max(Number.isNaN(rawLimit) ? 20 : rawLimit, 1), 100);
  const page = Math.max(Number.isNaN(rawPage) ? 1 : rawPage, 1);
  const skip = (page - 1) * limit;

  return { page, limit, skip };
}

/**
 * Build the standard paginated list envelope.
 * @param {Array} items
 * @param {number} total  total matching documents (for hasNextPage/pageCount)
 * @param {{page:number, limit:number}} param2
 */
function paginatedResult(items, total, { page, limit }) {
  return {
    items,
    pagination: {
      page,
      limit,
      total,
      pageCount: Math.ceil(total / limit) || 0,
      hasNextPage: page * limit < total,
    },
  };
}

module.exports = { parsePagination, paginatedResult };
