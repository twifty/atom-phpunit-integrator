/** @babel */

export default class ErrorReport
{
	/**
	 * Constructor
	 *
	 * @constructor
	 * @param {String}            type    - The type of error, should match the parent state
	 * @param {String}            message - A short description of the error
	 * @param {Array<String>}     detail  - A detailed description of the error
	 * @param {Array<ErrorTrace>} trace   - The stack trace of where the error occured
	 */
	constructor ({type, message, detail, trace}) {
		this.type = type
		this.message = message
		this.detail = detail
		this.trace = trace
	}

	/**
	 * Returns the type of error
	 *
	 * @return {String} - Should match the parent state
	 */
	getType () {
		return this.type
	}

	/**
	 * Returns a short description of the error
	 *
	 * @return {String}
	 */
	getMessage () {
		return this.message
	}

	/**
	 * Returns a detailed description of the error
	 *
	 * @return {Array<String>} - The description lines
	 */
	getDetail () {
		return this.detail
	}

	/**
	 * Returns a stack trace for the error
	 *
	 * @return {Array<TraceReport>} - The trace lines
	 */
	getTrace () {
		return this.trace
	}
}
