/**
 * A small JSONC reader for the many agent/IDE configs that ship comments and
 * trailing commas (VS Code, Copilot, Claude Code's settings, ...).
 *
 * It deliberately does not accept single-quoted strings or unquoted keys: only
 * the two extensions those tools actually use, so a malformed file fails loudly
 * instead of silently producing a partially wrong MCP list.
 *
 * @module @hexiaowu/dsh-mcp-config/lib/jsonc
 */

/** Remove `//` and block comments without touching string contents. */
function stripComments(text) {
  let out = ''
  let index = 0
  while (index < text.length) {
    const character = text[index]
    if (character === '"') {
      out += character
      index += 1
      while (index < text.length) {
        const inner = text[index]
        out += inner
        index += 1
        if (inner === '\\') {
          if (index < text.length) {
            out += text[index]
            index += 1
          }
          continue
        }
        if (inner === '"') break
      }
      continue
    }
    if (character === '/' && text[index + 1] === '/') {
      index += 2
      while (index < text.length && text[index] !== '\n' && text[index] !== '\r') index += 1
      continue
    }
    if (character === '/' && text[index + 1] === '*') {
      index += 2
      while (index < text.length && !(text[index] === '*' && text[index + 1] === '/')) {
        if (text[index] === '\n') out += '\n'
        index += 1
      }
      index += 2
      continue
    }
    out += character
    index += 1
  }
  return out
}

/** Drop commas that are immediately followed by a closing bracket. */
function stripTrailingCommas(text) {
  let out = ''
  let index = 0
  while (index < text.length) {
    const character = text[index]
    if (character === '"') {
      out += character
      index += 1
      while (index < text.length) {
        const inner = text[index]
        out += inner
        index += 1
        if (inner === '\\') {
          if (index < text.length) {
            out += text[index]
            index += 1
          }
          continue
        }
        if (inner === '"') break
      }
      continue
    }
    if (character === ',') {
      let lookahead = index + 1
      while (lookahead < text.length && /\s/.test(text[lookahead])) lookahead += 1
      if (text[lookahead] === '}' || text[lookahead] === ']') {
        index += 1
        continue
      }
    }
    out += character
    index += 1
  }
  return out
}

/**
 * Parse JSONC text.
 * @param {string} text
 * @returns {unknown}
 * @throws {SyntaxError} when the cleaned text is not valid JSON.
 */
export function parseJsonc(text) {
  const source = typeof text === 'string' ? text.replace(/^\uFEFF/, '') : ''
  const cleaned = stripTrailingCommas(stripComments(source))
  try {
    return JSON.parse(cleaned)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new SyntaxError(`Invalid JSONC: ${message}`)
  }
}

/** Parse a JSON or JSONC document, preferring plain JSON when it already works. */
export function parseJsonLike(text) {
  const source = typeof text === 'string' ? text.replace(/^\uFEFF/, '') : ''
  try {
    return JSON.parse(source)
  } catch {
    return parseJsonc(source)
  }
}
