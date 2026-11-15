/**
 * A focused TOML reader for agent config files (notably Codex's
 * `~/.codex/config.toml`): tables, arrays of tables, dotted/quoted keys,
 * strings, multiline strings, arrays, inline tables, booleans, and numbers.
 *
 * It intentionally implements the TOML subset configuration files use. Values
 * it does not model (dates, times) are kept as their literal text so the MCP
 * scanner can ignore them without failing the document.
 *
 * @module @hexiaowu/dsh-mcp-config/lib/toml
 */

/** Remove comments while respecting every string form. */
function stripComments(text) {
  let out = ''
  let index = 0
  let state = 'normal'
  while (index < text.length) {
    const character = text[index]
    if (state === 'normal') {
      if (character === '#') {
        while (index < text.length && text[index] !== '\n') index += 1
        continue
      }
      if (character === '"' && text.startsWith('"""', index)) {
        state = 'ml-basic'
        out += '"""'
        index += 3
        continue
      }
      if (character === "'" && text.startsWith("'''", index)) {
        state = 'ml-literal'
        out += "'''"
        index += 3
        continue
      }
      if (character === '"') state = 'basic'
      else if (character === "'") state = 'literal'
      out += character
      index += 1
      continue
    }
    if (state === 'basic') {
      out += character
      index += 1
      if (character === '\\' && index < text.length) {
        out += text[index]
        index += 1
      } else if (character === '"') state = 'normal'
      continue
    }
    if (state === 'literal') {
      out += character
      index += 1
      if (character === "'") state = 'normal'
      continue
    }
    if (state === 'ml-basic') {
      if (character === '\\' && index + 1 < text.length) {
        out += character + text[index + 1]
        index += 2
        continue
      }
      if (text.startsWith('"""', index)) {
        out += '"""'
        index += 3
        state = 'normal'
        continue
      }
      out += character
      index += 1
      continue
    }
    // ml-literal
    if (text.startsWith("'''", index)) {
      out += "'''"
      index += 3
      state = 'normal'
      continue
    }
    out += character
    index += 1
  }
  return out
}

/** Whether a value fragment has closed all strings, arrays, and inline tables. */
function isCompleteValue(text) {
  let depth = 0
  let quote = ''
  let triple = false
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (quote !== '') {
      if (triple) {
        if (character === '\\' && quote === '"') {
          index += 1
          continue
        }
        if (text.startsWith(quote.repeat(3), index)) {
          index += 2
          quote = ''
          triple = false
        }
        continue
      }
      if (character === '\\' && quote === '"') {
        index += 1
        continue
      }
      if (character === quote) quote = ''
      continue
    }
    if (character === '"' || character === "'") {
      if (text.startsWith(character.repeat(3), index)) {
        quote = character
        triple = true
        index += 2
        continue
      }
      quote = character
      continue
    }
    if (character === '[' || character === '{') depth += 1
    else if (character === ']' || character === '}') depth -= 1
  }
  return quote === '' && depth <= 0
}

/** Split text on a delimiter at top level, respecting strings and containers. */
function splitTopLevel(text, delimiter) {
  const parts = []
  let start = 0
  let depth = 0
  let quote = ''
  let triple = false
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (quote !== '') {
      if (triple) {
        if (character === '\\' && quote === '"') {
          index += 1
          continue
        }
        if (text.startsWith(quote.repeat(3), index)) {
          index += 2
          quote = ''
          triple = false
        }
        continue
      }
      if (character === '\\' && quote === '"') {
        index += 1
        continue
      }
      if (character === quote) quote = ''
      continue
    }
    if (character === '"' || character === "'") {
      if (text.startsWith(character.repeat(3), index)) {
        quote = character
        triple = true
        index += 2
        continue
      }
      quote = character
      continue
    }
    if (character === '[' || character === '{') depth += 1
    else if (character === ']' || character === '}') depth -= 1
    else if (character === delimiter && depth === 0) {
      parts.push(text.slice(start, index))
      start = index + 1
    }
  }
  parts.push(text.slice(start))
  return parts
}

/** Split a dotted key path, honoring quoted segments. */
function splitKeyPath(text) {
  const segments = []
  let current = ''
  let quote = ''
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (quote !== '') {
      if (character === '\\' && quote === '"') {
        index += 1
        current += text[index] ?? ''
        continue
      }
      if (character === quote) {
        quote = ''
        continue
      }
      current += character
      continue
    }
    if (character === '"' || character === "'") {
      quote = character
      continue
    }
    if (character === '.') {
      segments.push(current.trim())
      current = ''
      continue
    }
    current += character
  }
  segments.push(current.trim())
  return segments.filter((segment) => segment !== '')
}

/** Decode the escapes TOML permits in basic strings. */
function decodeBasicString(text) {
  let out = ''
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (character !== '\\') {
      out += character
      continue
    }
    index += 1
    const escape = text[index]
    switch (escape) {
      case 'b': out += '\b'; break
      case 't': out += '\t'; break
      case 'n': out += '\n'; break
      case 'f': out += '\f'; break
      case 'r': out += '\r'; break
      case '"': out += '"'; break
      case '\\': out += '\\'; break
      case 'u':
      case 'U': {
        const length = escape === 'u' ? 4 : 8
        const hex = text.slice(index + 1, index + 1 + length)
        const code = Number.parseInt(hex, 16)
        if (Number.isFinite(code)) {
          out += String.fromCodePoint(code)
          index += length
        }
        break
      }
      default:
        out += escape ?? ''
    }
  }
  return out
}

/** Parse one TOML value from its source text. */
function parseValue(source) {
  const text = source.trim()
  if (text === '') return ''
  if (text.startsWith('"""') && text.endsWith('"""') && text.length >= 6) {
    return decodeBasicString(text.slice(3, -3).replace(/^\n/, ''))
  }
  if (text.startsWith("'''") && text.endsWith("'''") && text.length >= 6) {
    return text.slice(3, -3).replace(/^\n/, '')
  }
  if (text.startsWith('"') && text.endsWith('"') && text.length >= 2) {
    return decodeBasicString(text.slice(1, -1))
  }
  if (text.startsWith("'") && text.endsWith("'") && text.length >= 2) {
    return text.slice(1, -1)
  }
  if (text.startsWith('[') && text.endsWith(']')) {
    const inner = text.slice(1, -1).trim()
    if (inner === '') return []
    return splitTopLevel(inner, ',').map((part) => parseValue(part)).filter((value, index, all) => !(value === '' && index === all.length - 1 && inner.trim().endsWith(',')))
  }
  if (text.startsWith('{') && text.endsWith('}')) {
    const inner = text.slice(1, -1).trim()
    /** @type {Record<string, unknown>} */
    const table = {}
    if (inner === '') return table
    for (const part of splitTopLevel(inner, ',')) {
      const separator = findAssignment(part)
      if (separator < 0) continue
      const key = splitKeyPath(part.slice(0, separator))
      const value = parseValue(part.slice(separator + 1))
      setPath(table, key, value)
    }
    return table
  }
  if (text === 'true') return true
  if (text === 'false') return false
  if (/^[+-]?(?:\d[\d_]*)(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?$/.test(text)) {
    return Number(text.replaceAll('_', ''))
  }
  // Dates, times, and other scalar literals stay as their original text.
  return text
}

/** Index of the first top-level `=` in a key/value pair, or -1. */
function findAssignment(text) {
  let quote = ''
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (quote !== '') {
      if (character === '\\' && quote === '"') {
        index += 1
        continue
      }
      if (character === quote) quote = ''
      continue
    }
    if (character === '"' || character === "'") {
      quote = character
      continue
    }
    if (character === '=') return index
  }
  return -1
}

/** Assign a value at a dotted path, creating tables as needed. */
function setPath(root, segments, value) {
  let current = root
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index]
    let next = current[segment]
    if (Array.isArray(next)) next = next[next.length - 1]
    if (next === null || typeof next !== 'object' || Array.isArray(next)) {
      next = {}
      current[segment] = next
    }
    current = next
  }
  const last = segments[segments.length - 1]
  if (last !== undefined) current[last] = value
}

/** Create or resolve the table a header names. */
function openTable(root, segments, isArray) {
  let current = root
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index]
    const last = index === segments.length - 1
    if (last && isArray) {
      if (!Array.isArray(current[segment])) current[segment] = []
      const table = {}
      current[segment].push(table)
      return table
    }
    let next = current[segment]
    if (Array.isArray(next)) next = next[next.length - 1]
    if (next === null || typeof next !== 'object' || Array.isArray(next)) {
      next = {}
      current[segment] = next
    }
    current = next
  }
  return current
}

/**
 * Parse TOML source into a plain object tree.
 * @param {string} source
 * @returns {Record<string, unknown>}
 */
export function parseToml(source) {
  const text = stripComments(typeof source === 'string' ? source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n') : '')
  const lines = text.split('\n')
  /** @type {Record<string, unknown>} */
  const root = {}
  let current = root
  let index = 0

  while (index < lines.length) {
    let line = lines[index].trim()
    index += 1
    if (line === '') continue

    if (line.startsWith('[[') && line.endsWith(']]')) {
      const segments = splitKeyPath(line.slice(2, -2).trim())
      if (segments.length > 0) current = openTable(root, segments, true)
      continue
    }
    if (line.startsWith('[') && line.endsWith(']')) {
      const segments = splitKeyPath(line.slice(1, -1).trim())
      if (segments.length > 0) current = openTable(root, segments, false)
      continue
    }

    const separator = findAssignment(line)
    if (separator < 0) continue
    const key = splitKeyPath(line.slice(0, separator))
    let valueText = line.slice(separator + 1).trim()
    while (!isCompleteValue(valueText) && index < lines.length) {
      valueText += `\n${lines[index]}`
      index += 1
    }
    if (key.length === 0) continue
    setPath(current, key, parseValue(valueText))
  }

  return root
}
