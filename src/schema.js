// AJV-based schema validation with friendly error reporting.
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const ajv = new Ajv({ allErrors: true, allowUnionTypes: true, strict: false });
addFormats(ajv);

const cache = new Map();

export function compile(schema) {
  if (cache.has(schema)) return cache.get(schema);
  const validate = ajv.compile(schema);
  cache.set(schema, validate);
  return validate;
}

export function validate(schema, data) {
  const v = compile(schema);
  const ok = v(data);
  if (ok) return { ok: true, errors: [] };
  return { ok: false, errors: v.errors.map(formatError) };
}

function formatError(err) {
  const path = err.instancePath || '(root)';
  let msg = err.message || 'invalid';
  if (err.params) {
    if (err.keyword === 'required') msg = `missing required field: ${err.params.missingProperty}`;
    if (err.keyword === 'enum') msg = `must be one of: ${err.params.allowedValues.join(', ')}`;
    if (err.keyword === 'type') msg = `must be ${err.params.type}`;
    if (err.keyword === 'additionalProperties') msg = `unknown field: ${err.params.additionalProperty}`;
  }
  return { path, message: msg, keyword: err.keyword };
}

export function formatErrorList(errors) {
  return errors.map((e) => `  - ${e.path}: ${e.message}`).join('\n');
}
