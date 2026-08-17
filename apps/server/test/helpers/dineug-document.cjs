const DINEUG_SCHEMA_URL =
  "https://raw.githubusercontent.com/dineug/erd-editor/main/json-schema/schema.json";

const createDineugDocument = (overrides = {}) => ({
  $schema: DINEUG_SCHEMA_URL,
  version: "3.0.0",
  settings: {
    width: 2000,
    height: 2000,
    scrollTop: 0,
    scrollLeft: 0,
    zoomLevel: 1,
    show: 511,
    database: 32,
    databaseName: "harness",
    canvasType: "ERD",
    language: 16,
    tableNameCase: 1,
    columnNameCase: 1,
    bracketType: 1,
    relationshipDataTypeSync: true,
    relationshipOptimization: false,
    columnOrder: [1, 2, 4, 8, 16, 32, 64],
    maxWidthComment: -1,
    ignoreSaveSettings: 3,
  },
  doc: {
    tableIds: ["table-7dfb4cf67742cb066030"],
    relationshipIds: [],
    indexIds: [],
    memoIds: [],
  },
  collections: {
    tableEntities: {
      "table-7dfb4cf67742cb066030": {
        id: "table-7dfb4cf67742cb066030",
        name: "users",
        comment: "identity table",
        columnIds: ["column-ea72dfea08f0938f4531"],
        seqColumnIds: ["column-ea72dfea08f0938f4531"],
        ui: {
          x: 100,
          y: 100,
          zIndex: 1,
          widthName: 300,
          widthComment: 60,
          color: "#8b5cf6",
        },
        meta: { updateAt: 0, createAt: 0 },
      },
    },
    tableColumnEntities: {
      "column-ea72dfea08f0938f4531": {
        id: "column-ea72dfea08f0938f4531",
        tableId: "table-7dfb4cf67742cb066030",
        name: "id",
        comment: "primary identifier",
        dataType: "INTEGER",
        default: "",
        options: 10,
        ui: {
          keys: 1,
          widthName: 180,
          widthComment: 60,
          widthDataType: 180,
          widthDefault: 180,
        },
        meta: { updateAt: 0, createAt: 0 },
      },
    },
    relationshipEntities: {},
    indexEntities: {},
    indexColumnEntities: {},
    memoEntities: {},
  },
  ...overrides,
});

const cloneDocument = (document) => JSON.parse(JSON.stringify(document));

module.exports = {
  DINEUG_SCHEMA_URL,
  cloneDocument,
  createDineugDocument,
};
