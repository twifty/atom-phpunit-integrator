/** @babel */
/* global atom window Promise */

import {Point, Range} from 'atom'
import {promisify} from 'util'
import fs from 'fs'

const stat = promisify(fs.stat)

export async function openInAtom (file, line, column) {
  await stat(file)

  const editor = await atom.workspace.open(file)

  if (line !== undefined) {
    line = parseInt(line) - 1
    column = column ? parseInt(column) - 1 : 0
    editor.setCursorBufferPosition([line, column])
    editor.scrollToCursorPosition()
  }

  return editor
}

export function offsetRange(range, offset, copy = true) {
  range = Range.fromObject(range, copy)

  if (offset) {
    offset = Range.fromObject(offset, true)

    Point.assertValid(offset.start)
    Point.assertValid(offset.end)
    Point.assertValid(range.start)
    Point.assertValid(range.end)

    range.start.row += offset.start.row
    range.start.column += offset.start.column
    range.end.row += offset.end.row
    range.end.column += offset.end.column
  }

  return range
}

export function offsetPoint(point, offset, copy = true) {
  point = Point.fromObject(point, copy)

  if (offset) {
    offset = Point.fromObject(offset, true)

    point.row += offset.row
    point.column += offset.column
  }

  return point
}

export function waitForCondition (condition, timeout = 60) {
  return new Promise((resolve, reject) => {
    window.setTimeout(() => {
      return reject('timed out')
    }, timeout * 1000)

    const loop = () => {
      if (condition()) {
        return resolve()
      }
      window.setTimeout(loop, 100)
    }

    window.setTimeout(loop, 100)
  })
}

export function removeLeadingChars (chars, string) {
  let index = 0

  while (chars.includes(string.charAt(index))) {
    index++
  }

  return string.slice(index)
}

export function removeTrailingChars (chars, string) {
  let index = string.length - 1

  while (index >= 0 && chars.includes(string.charAt(index))) {
    index--
  }

  return string.substring(0, index)
}

export function removeSurroundingChars (chars, string) {
  return removeLeadingChars(chars, removeTrailingChars(chars, string))
}
