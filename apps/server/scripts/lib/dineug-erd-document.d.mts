export interface ErdInventoryColumn {
  name: string;
  type: string;
  nullable: boolean;
  foreignKey: boolean;
  autoIncrement: boolean;
  default: string | null;
  comment: string;
}

export interface ErdInventoryRelationship {
  constraint: string;
  onDelete: string | null;
  onUpdate: string | null;
  sourceCardinality: "1" | "0..1" | "1..N" | "0..N";
  sourceColumns: string[];
  sourceTable: string;
  targetCardinality: "1" | "0..1";
  targetColumns: string[];
  targetTable: string;
}

export interface ErdInventory {
  contract: "ERDInventory/2.0";
  name: string;
  scope: string;
  engine: string | null;
  sourceRevision: string;
  tables: Array<{
    qualifiedName: string;
    comment: string;
    columns: ErdInventoryColumn[];
    primaryKey: { columns: string[] } | null;
    uniqueConstraints: Array<{ name: string; columns: string[] }>;
  }>;
  relationships: ErdInventoryRelationship[];
}

export const DINEUG_SCHEMA_URL: string;
export const DINEUG_VERSION: "3.0.0";
export const INVENTORY_CONTRACT: "ERDInventory/2.0";
export const MAXIMUM_DOCUMENT_BYTES: number;
export const MAXIMUM_COLLECTION_ENTITIES: number;
export function sortJsonKeys(value: unknown): unknown;
export function canonicalJson(value: unknown): string;
export function stableId(kind: string, key: string): string;
export function relationshipKey(relationship: ErdInventoryRelationship): string;
export function normalizeInventory(value: unknown): ErdInventory;
export function upgradeInventoryV1(value: unknown): ErdInventory;
export function inventoryFromLegacyErdHtml(html: string): ErdInventory;
export function extractInventoryFromExcalidrawScene(scene: unknown): ErdInventory;
export function buildDineugErdDocument(inventory: unknown): unknown;
export function validateDineugErdDocument<T>(document: T): T;
export function migrateLegacyMemoDineugDocument(document: unknown): unknown;
export function canonicalizeDineugErdDocument(document: unknown): string;
