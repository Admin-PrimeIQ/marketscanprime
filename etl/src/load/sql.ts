import type { Column } from "./specs"

/** Identificador entre comillas dobles ("user" es palabra reservada). */
export const q = (name: string) => `"${name.replace(/"/g, '""')}"`

/** Tipo de Postgres al que se convierte el texto de cada columna. */
export function pgType(column: Column): string {
  switch (column.kind) {
    case "text":
      return "text"
    case "ref":
      return column.textRef ? "text" : "integer"
    case "int":
      return "integer"
    case "numeric":
      return "numeric"
    case "float":
      return "double precision"
    case "bool":
      return "boolean"
    case "timestamp":
      return "timestamptz"
    case "date":
      return "date"
    case "enum":
      return q(column.enumType!)
  }
}
