/** @babel */
/* global atom window Promise */

import {Point, Range} from 'atom'
import {promisify} from 'util'
import fs from 'fs'

const stat = promisify(fs.stat)

/**
 * Checks if a file exists
 *
 * @param  {string} path      - The file path to check
 *
 * @return {Promise<Boolean>}
 */
export async function fileExists (path) {
  try {
    await stat(path)

    return true
  } catch (error) {
    if (error.message.includes('ENOENT')) {
      return false
    }
    throw error
  }
}

/**
 * Checks if the file exists, opens and optionaly positions the cursor
 *
 * All cursor values other than a specific point are treated as line numbers.
 *
 * @param  {string}               file     - the full path of the file to open
 * @param  {Point|number|string}  [line]   - the line on which to place the cursor
 * @param  {number|string}        [column] - the column on which to place the cursor
 *
 * @return {Promise<TextEditor>}           - Resolves with the TextEditor instance
 */
export async function openInAtom (file, line, column) {
  await stat(file)

  const editor = await atom.workspace.open(file)

  var cursorPos

  if (line instanceof Point || Array.isArray(line)) {
    cursorPos = Point.fromObject(line)
  } else if (line !== undefined) {
    line = parseInt(line) - 1
    column = column ? parseInt(column) - 1 : 0
    cursorPos = new Point(line, column)
  }

  if (cursorPos) {
    editor.setCursorBufferPosition([line, column])
    editor.scrollToCursorPosition()
  }

  return editor
}

/**
 * Adjusts the range's row and column fields by the given offset
 *
 * @param {Range}       range       - The range to adjust
 * @param {Range|Point} [offset]    - How to adjust
 * @param {Boolean}     [copy=true] - If false range will be adjused otherwise a new object returned
 *
 * @return {Range}                  - The adjusted range
 * @throws {Error}                  - If any arguments cannot be converted to a Range
 */
export function offsetRange(range, offset, copy = true) {
  range = Range.fromObject(range, copy)

  Point.assertValid(range.start)
  Point.assertValid(range.end)

  if (offset) {
    if (offset instanceof Point || (Array.isArray(offset) && offset.length === 2 && !Array.isArray(offset[0]))) {
      offset = Range.fromObject(Point.fromObject(offset, true), Point.fromObject(offset, true))
    } else {
      offset = Range.fromObject(offset, true)
    }

    Point.assertValid(offset.start)
    Point.assertValid(offset.end)

    range.start.row += offset.start.row
    range.start.column += offset.start.column
    range.end.row += offset.end.row
    range.end.column += offset.end.column
  }

  return range
}

/**
 * Adjusts the point by the given offset
 *
 * @param {Point}   point       - The point, or a point like value, to adjust
 * @param {Point}   [offset]    - A point, or point like value, representing the offset
 * @param {Boolean} [copy=true] - If false point will be adjused otherwise a new object returned
 *
 * @return {Point}              - The adjusted point
 * @throws {Error}              - If any arguments cannot be converted to a point
 */
export function offsetPoint(point, offset, copy = true) {
  point = Point.fromObject(point, copy)

  Point.assertValid(point)

  if (offset) {
    offset = Point.fromObject(offset, true)

    Point.assertValid(offset)

    point.row += offset.row
    point.column += offset.column
  }

  return point
}

/**
 * Creates a promise which resolves when the given condition is met
 *
 * The returned promise will reject as soon as the timeout has elapsed
 *
 * @param  {function} condition      - The condition to check
 * @param  {Number}   [timeout=60]   - Number of seconds before a timeout
 * @param  {Number}   [interval=100] - The number of milliseconds between each condition check
 *
 * @return {Promise}
 */
export function waitForCondition (condition, timeout = 60, interval = 100) {
  return new Promise((resolve, reject) => {
    window.setTimeout(() => {
      return reject('timed out')
    }, timeout * 1000)

    const loop = () => {
      if (condition()) {
        return resolve()
      }
      window.setTimeout(loop, interval)
    }

    window.setTimeout(loop, interval)
  })
}

/**
 * Removes all leading characters from string which are present in chars
 *
 * @param  {string} chars  - A list of characters to remove
 * @param  {string} string - The string from which to remove characters
 *
 * @return {string}        - The modified string
 */
export function removeLeadingChars (chars, string) {
  let index = 0

  while (chars.includes(string.charAt(index))) {
    index++
  }

  return string.slice(index)
}

/**
 * Removes all trailing characters from string which are present in chars
 *
 * @param  {string} chars  - A list of characters to remove
 * @param  {string} string - The string from which to remove characters
 *
 * @return {string}        - The modified string
 */
export function removeTrailingChars (chars, string) {
  let index = string.length - 1

  while (index >= 0 && chars.includes(string.charAt(index))) {
    index--
  }

  return string.substring(0, index)
}

/**
 * Removes all leading and trailing characters from string which are present in chars
 *
 * @param  {string} chars  - A list of characters to remove
 * @param  {string} string - The string from which to remove characters
 *
 * @return {string}        - The modified string
 */
export function removeSurroundingChars (chars, string) {
  return removeLeadingChars(chars, removeTrailingChars(chars, string))
}
