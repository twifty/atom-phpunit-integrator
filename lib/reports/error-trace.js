/** @babel */

export default class ErrorTrace
{
	/**
	 * Constructor
	 *
	 * @constructor
	 * @param {String} display - The error line to display to the user
	 * @param {String} file    - The path to the source file
	 * @param {Number} line    - The, one base, line number within the source
	 */
	constructor ({display, file, line}) {
		this.display = display
		this.file = file
		this.line = line
	}

	/**
	 * Returns the humanized trace line
	 *
	 * @return {String} - The line to display to the user
	 */
	getDisplay () {
		return this.display
	}

	/**
	 * Returns the full path to the source file
	 *
	 * @return {String}
	 */
	getFilePath () {
		return this.file
	}

	/**
	 * Returns the position within the file where the error occurred
	 *
	 * NOTE: These are file positions not TextBuffer positions
	 *
	 * @return {Point}
	 */
	getFilePosition () {
		return [parseInt(this.line, 10), 0]
	}

	/**
	 * Returns a range within the source where the error ocurred
	 *
	 * NOTE: These are file positions not TextBuffer positions
	 *
	 * @return {Range}
	 */
	getFileRange () {
		return null
	}
}
