/** @babel */
/* global atom window Promise DOMParser */

import {Point, Range} from 'atom'
import promisify from 'util.promisify'
import fs from 'fs'
import Path from 'path'

const statAsync = promisify(fs.stat)
const readDirectoryAsync = promisify(fs.readdir)
const readFileAsync = promisify(fs.readFile)

/**
 * Checks if a file exists
 *
 * @param  {String} path      - The file path to check
 *
 * @return {Promise<Boolean>}
 */
export async function fileExists (path) {
    try {
        await statAsync(path)

        return true
    } catch (error) {
        if (error.message.includes('ENOENT')) {
            return false
        }
        throw error
    }
}

/**
 * Checks if the path points to a regular file
 *
 * @param  {String}  path - The full path to check
 *
 * @return {Promise<Boolean>}
 */
export async function isFile (path) {
    try {
        return (await statAsync(path)).isFile()
    } catch (error) {
        if (error.message.includes('ENOENT')) {
            return false
        }
        throw error
    }
}

/**
 * Checks if the path points to a regular directory
 *
 * @param  {String}  path - The full path to check
 *
 * @return {Promise<Boolean>}
 */
export async function isDirectory (path) {
    try {
        return (await statAsync(path)).isDirectory()
    } catch (error) {
        if (error.message.includes('ENOENT')) {
            return false
        }
        throw error
    }
}

/**
 * Checks if the path points to a symbolic link
 *
 * @param  {String}  path - The full path to check
 *
 * @return {Promise<Boolean>}
 */
export async function isSymlink (path) {
    try {
        return (await statAsync(path)).isSymbolicLink()
    } catch (error) {
        if (error.message.includes('ENOENT')) {
            return false
        }
        throw error
    }
}

/**
 * Reads all entries within a directory
 *
 * @param  {String}   path              - The full path to the directory to read
 * @param  {Boolean}  [recursive=false] - Whether subdirectories should also be read
 * @param  {Function} [filter]          - A filter function to exclude files/directories. Called with
 *                                      -    @param {Object} params          - A collection of properties
 *                                      -    @param {String} params.path     - The full path of the file/directory
 *                                      -    @param {String} params.basename - The file name of the file/directory
 *                                      -    @param {String} params.type     - One of 'directory', 'link' or 'type'
 *
 * @return {Promise<Array<String>>}     - Resolves with an array of directory paths
 */
export async function getEntries (path, recursive = false, filter = () => false) {
    if (typeof recursive !== 'boolean') {
        filter = recursive
        recursive = false
    }

    let _filter = filter
    if (typeof filter.then !== 'function') {
        _filter = async (args) => {
            return filter(args)
        }
    }

    const entries = await readDirectoryAsync(path)
    const results = []

    for (const entry of entries) {
        const resolved = Path.resolve(path, entry)
        const stats = await statAsync(resolved)
        const type = stats.isDirectory() ? 'directory' : (stats.isSymbolicLink() ? 'link' : 'file')

        if (!await _filter({path: resolved, basename: entry, type})) {
            results.push(resolved)
        }

        if ('directory' === type && recursive) {
            results.push(await getDirectories(resolved, true, filter))
        }
    }

    return results.reduce((a, f) => a.concat(f), [])
}

/**
 * Reads directory entries within a directory
 *
 * @param  {String}   path              - The full path to the directory to read
 * @param  {Boolean}  [recursive=false] - Whether subdirectories should also be read
 * @param  {Function} [filter]          - A filter function to exclude files/directories. Called with
 *                                      -    @param {Object} params          - A collection of properties
 *                                      -    @param {String} params.path     - The full path of the file/directory
 *                                      -    @param {String} params.basename - The file name of the file/directory
 *                                      -    @param {String} params.type     - One of 'directory', 'link' or 'type'
 *
 * @return {Promise<Array<String>>}     - Resolves with an array of directory paths
 */
export async function getDirectories (path, recursive = false, filter = () => false) {
    if (typeof recursive === 'function') {
        filter = recursive
        recursive = false
    }

    return getEntries(path, recursive, async ({path, basename, type}) => {
        return type !== 'directory' || filter({path, basename, type})
    })
}

/**
 * Reads file entries within a directory
 *
 * If a filter is provided, it should return true to exclude entries from the results.
 *
 * @param  {String}   path              - The full path to the directory to read
 * @param  {Boolean}  [recursive=false] - Whether subdirectories should also be read
 * @param  {Function} [filter]          - A filter function to exclude files/directories. Called with
 *                                      -    @param {Object} params          - A collection of properties
 *                                      -    @param {String} params.path     - The full path of the file/directory
 *                                      -    @param {String} params.basename - The file name of the file/directory
 *                                      -    @param {String} params.type     - One of 'directory', 'link' or 'type'
 *
 * @return {Promise<Array<String>>}     - Resolves with an array of file paths
 */
export async function getFiles (path, recursive = false, filter = () => false) {
    if (typeof recursive === 'function') {
        filter = recursive
        recursive = false
    }

    return getEntries(path, recursive, async ({path, basename, type}) => {
        return type !== 'file' || filter({path, basename, type})
    })
}

/**
 * Returns a promise to read a file
 *
 * @param  {String} path             - The full path to the file
 * @param  {Object} [options]        - fs.readFile options
 * @param  {String} options.encoding - The encoding type of the file, defaults to 'utf8'
 *
 * @return {Promise<String>}         - The file data
 */
export async function readFile (path, options = {encoding: 'utf8'}) {
    return readFileAsync(path, options)
}

/**
 * Creates and validates an xml document
 *
 * @param  {String}       data - Raw XML data
 *
 * @return {DOMDocument=}
 */
export function createXmlDocument (data) {
  if (data) {
    const xmlDoc = (new DOMParser()).parseFromString(data, "text/xml")

    if (xmlDoc.getElementsByTagNameNS('http://www.w3.org/1999/xhtml', 'parsererror').length === 0) {
        return xmlDoc
    }
  }

  return null
}

/**
 * Reads an XML file into a DOMDocument
 *
 * @param  {String}               path - The full path of the XML file
 *
 * @return {Promise<DomDocument>}      - Resolves with a DOMDocument
 */
export async function readXmlFile (path) {
  return new Promise((resolve, reject) => {
    fs.readFile(path, 'utf8', (err, data) => {
        const xmlDoc = err ? null : createXmlDocument(data)

        if (!xmlDoc) {
            return reject(new Error(`Failed to read "${path}"`))
        }

        resolve(xmlDoc)
    })
  })
}

/**
 * Checks if the file exists, opens and optionaly positions the cursor
 *
 * All cursor values other than a specific point are treated as line numbers.
 *
 * @param  {String}               file     - the full path of the file to open
 * @param  {Point|Number|String}  [line]   - the line on which to place the cursor
 * @param  {Number|String}        [column] - the column on which to place the cursor
 *
 * @return {Promise<TextEditor>}           - Resolves with the TextEditor instance
 */
export async function openInAtom (file, line, column, force = false) {
    await statAsync(file)

    if (typeof column === 'boolean') {
        force = column
        column = 0
    }

    let editor = atom.workspace.getActiveTextEditor()

    if (force || !editor || editor.getPath() !== file) {
        if (line instanceof Point || Array.isArray(line)) {
            const point = Point.fromObject(line, true)

            // line = Math.max(0, point.row - 1)
            line = point.row
            column = point.column
        } else if (line !== undefined) {
            line = parseInt(line, 10) - 1
            column = parseInt(column, 10)
            column = Number.isNaN(column) ? 0 : column - 1
        }

        editor = await atom.workspace.open(file, {
            initialLine: line,
            initialColumn: column
        })
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
export function offsetRange (range, offset, copy = true) {
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
export function offsetPoint (point, offset, copy = true) {
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
 * @param  {String} chars  - A list of characters to remove
 * @param  {String} string - The string from which to remove characters
 *
 * @return {String}        - The modified string
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
 * @param  {String} chars  - A list of characters to remove
 * @param  {String} string - The string from which to remove characters
 *
 * @return {String}        - The modified string
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
 * @param  {String} chars  - A list of characters to remove
 * @param  {String} string - The string from which to remove characters
 *
 * @return {String}        - The modified string
 */
export function removeSurroundingChars (chars, string) {
    return removeLeadingChars(chars, removeTrailingChars(chars, string))
}
