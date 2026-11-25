/** The shape of `content-model.json`, written by `scripts/content-model/`. */
export interface FieldInfo {
  type: string;
  required: boolean;
  list: boolean;
  hasDefault: boolean;
  /** The model a foreign key column points at. */
  fk?: string;
  /** The values of an enum type. */
  enum?: string[];
  /** `Date` for `@db.Date`, `Time` for `@db.Time`: the column keeps only that part. */
  dbType?: "Date" | "Time";
  /** The length limit of a `@db.VarChar(n)` column. */
  maxLength?: number;
  isId?: boolean;
  isUpdatedAt?: boolean;
}

export interface ModelInfo {
  /** The Prisma client property for the model (`show`, `placeName`). */
  delegate: string;
  table: string;
  /** Scalar columns only; relation fields are left out. */
  fields: Record<string, FieldInfo>;
  /** Set when the model's `id` is a shared record ID (a row in `entities` has the same ID). */
  entityKind: string | null;
}

export interface ContentModel {
  enums: Record<string, string[]>;
  models: Record<string, ModelInfo>;
}
