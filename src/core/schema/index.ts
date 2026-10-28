export {
  CURRENT_SCHEMA_VERSION,
  DesignDocumentSchema,
  DesignLayerSchema,
  createEmptyDocument,
  deserializeDocument,
  migrateDocument,
  serializeDocument,
  validateDocument,
} from './designDocument';

export type {
  BoundingBox,
  DesignDocument,
  DesignLayer,
  EmptyDocumentOptions,
  GroupDesignLayer,
  ImageDesignLayer,
  LayerSource,
  QrDesignLayer,
  ShapeDesignLayer,
  TextDesignLayer,
} from './designDocument';
