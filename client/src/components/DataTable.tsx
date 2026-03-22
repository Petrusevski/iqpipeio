import { ReactNode } from "react";

interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string;
}

export default function DataTable<T extends { id: string | number }>({
  columns,
  data,
  onRowClick,
  rowClassName,
}: DataTableProps<T>) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/60">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-900/80">
          <tr>
            {columns.map((col) => (
              <th
                key={String(col.key)}
                className="px-4 py-2 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide"
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-8 text-center text-slate-500"
              >
                No records yet.
              </td>
            </tr>
          ) : (
            data.map((row, rowIndex) => (
              <tr
                key={row.id}
                onClick={() => onRowClick && onRowClick(row)}
                className={[
                  "border-t border-slate-800 transition-colors",
                  rowIndex % 2 === 0 ? "bg-slate-950/40" : "bg-slate-950/20",
                  onRowClick ? "cursor-pointer hover:bg-slate-800/60" : "",
                  rowClassName ? rowClassName(row) : "",
                ].join(" ")}
              >
                {columns.map((col) => (
                  <td key={String(col.key)} className="px-4 py-2">
                    {col.render
                      ? col.render(row)
                      : // @ts-ignore
                        (row[col.key] as ReactNode)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}