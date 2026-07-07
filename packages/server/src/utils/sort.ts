// ============================================================================
// Safe ORDER BY builder.
//
// Raw-SQL search paths interpolate the client's `sort`/`order` params directly
// into ORDER BY, which is a SQL-injection surface. This validates the column
// against a per-table allow-list and the direction against ASC/DESC, returning
// a safe `ORDER BY <col> <dir>` fragment. Anything not on the allow-list falls
// back to the provided default column.
// ============================================================================

export function safeOrderBy(
  sort: string | undefined,
  order: string | undefined,
  allowedColumns: readonly string[],
  defaultColumn: string,
  columnPrefix = "",
): string {
  const col = sort && allowedColumns.includes(sort) ? sort : defaultColumn;
  const dir = String(order || "").toLowerCase() === "asc" ? "ASC" : "DESC";
  return `ORDER BY ${columnPrefix}${col} ${dir}`;
}
