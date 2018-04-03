/** @babel */

export default class AbstractTestReport
{
	/**
	 * Constructor
	 *
	 * @constructor
	 * @param {String} state           - One of 'passed', 'failed', 'error', 'warning', 'skipped'
	 * @param {String} name            - The name of the suite/case
	 * @param {Number} [time=0]        - The completion time of the test
	 * @param {Number} [assertions=0}] - The number of assertions within the test
	 */
	constructor ({state, name, time = 0, assertions = 0}) {
		this.state = state
		this.name = name
		this.time = time
		this.assertions = assertions
	}

	/**
	 * Returns the state of the test
	 *
	 * @return {String} - One of 'passed', 'failed', 'error', 'warning', 'skipped'
	 */
	getState () {
		return this.state
	}

	/**
	 * Returns the name of the suite/case
	 *
	 * @return {String}
	 */
	getName () {
		return this.name
	}

	/**
	 * Returns the completion time of the test
	 *
	 * @return {Number} - The time in ms
	 */
	getTime () {
		return this.time
	}

	/**
	 * Returns the number of assertions in the test
	 *
	 * @return {Number}
	 */
	getAssertionCount () {
		return this.assertions
	}

	/**
	 * Checks if this is a suite report
	 *
	 * @return {Boolean}
	 */
	isSuiteReport () {
		return false
	}

	/**
	 * Checks if this is a case report
	 *
	 * @return {Boolean}
	 */
	isCaseReport () {
		return false
	}
}
