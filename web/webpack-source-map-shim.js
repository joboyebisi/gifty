/**
 * Shim for next/dist/compiled/source-map
 * This prevents Next.js from crashing when it tries to require this module
 * We provide a minimal implementation that satisfies the require
 */

// Minimal SourceMapConsumer implementation
class SourceMapConsumer {
  constructor() {}
  originalPositionFor() {
    return { line: null, column: null, source: null };
  }
  generatedPositionFor() {
    return { line: null, column: null };
  }
  allGeneratedPositionsFor() {
    return [];
  }
  hasContentsOfAllSources() {
    return false;
  }
  sourceContentFor() {
    return null;
  }
  destroy() {}
}

// Minimal SourceMapGenerator implementation
class SourceMapGenerator {
  constructor() {}
  addMapping() {}
  setSourceContent() {}
  toString() {
    return '';
  }
  toJSON() {
    return { version: 3, sources: [], mappings: '' };
  }
}

module.exports = {
  SourceMapConsumer,
  SourceMapGenerator,
  BasicSourceMapConsumer: SourceMapConsumer,
  IndexedSourceMapConsumer: SourceMapConsumer,
};

