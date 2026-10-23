// Parameter validation for visual templates: the same JSON-schema subset as
// tools/visuals.py, driven by the schemas published from content/visuals/templates.json.

export function validateSchema(schema, value, where, errors, tpl) {
  if (value === null || value === undefined) {
    if (value === null && schema.nullable) return null;
    errors.push(`${where}: required value missing`);
    return value;
  }
  switch (schema.type) {
    case 'object': {
      if (typeof value !== 'object' || Array.isArray(value)) {
        errors.push(`${where}: expected object`);
        return value;
      }
      const props = schema.properties || {};
      const out = {};
      for (const k of Object.keys(value)) if (!(k in props)) errors.push(`${where}.${k}: unknown parameter`);
      for (const k of schema.required || []) if (!(k in value)) errors.push(`${where}.${k}: required`);
      for (const [k, sub] of Object.entries(props)) {
        if (k in value) out[k] = validateSchema(sub, value[k], `${where}.${k}`, errors, tpl);
        else if ('default' in sub) out[k] = structuredCloneSafe(sub.default);
      }
      return out;
    }
    case 'array': {
      if (!Array.isArray(value)) {
        errors.push(`${where}: expected array`);
        return value;
      }
      if (value.length < (schema.minItems || 0)) errors.push(`${where}: needs at least ${schema.minItems} item(s)`);
      if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${where}: at most ${schema.maxItems} item(s)`);
      return value.map((v, i) => validateSchema(schema.items, v, `${where}[${i}]`, errors, tpl));
    }
    case 'number':
    case 'integer': {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        errors.push(`${where}: expected a finite number`);
        return value;
      }
      if (schema.type === 'integer' && !Number.isInteger(value)) errors.push(`${where}: expected an integer`);
      if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${where}: ${value} is below the minimum ${schema.minimum}`);
      if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${where}: ${value} is above the maximum ${schema.maximum}`);
      return value;
    }
    case 'string': {
      if (typeof value !== 'string') {
        errors.push(`${where}: expected a string`);
        return value;
      }
      const en = schema.enum || (schema.enum_from ? Object.keys((tpl && tpl[schema.enum_from]) || {}) : null);
      if (en && !en.includes(value)) errors.push(`${where}: ${JSON.stringify(value)} is not allowed`);
      if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push(`${where}: longer than ${schema.maxLength} characters`);
      if (schema.pattern && !new RegExp(schema.pattern).test(value)) errors.push(`${where}: does not match ${schema.pattern}`);
      if (/[<>&]/.test(value)) errors.push(`${where}: characters < > & are not allowed`);
      return value;
    }
    case 'boolean':
      if (typeof value !== 'boolean') errors.push(`${where}: expected true/false`);
      return value;
    default:
      errors.push(`${where}: unsupported schema type ${schema.type}`);
      return value;
  }
}

function structuredCloneSafe(v) {
  return v === undefined ? v : JSON.parse(JSON.stringify(v));
}

export function deepMerge(base, over) {
  if (base && over && typeof base === 'object' && typeof over === 'object' && !Array.isArray(base) && !Array.isArray(over)) {
    const out = { ...base };
    for (const [k, v] of Object.entries(over)) out[k] = k in base ? deepMerge(base[k], v) : structuredCloneSafe(v);
    return out;
  }
  return structuredCloneSafe(over);
}
