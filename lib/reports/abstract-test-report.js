/** @babel */

let uniqueid = 0

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
    constructor ({state, name, file, line = 0, time = 0, assertions = 0}) {
        this.state = state
        this.name = name
        this.file = file
        this.line = line
        this.time = time
        this.assertions = assertions

        this.id = uniqueid++
    }

    /**
     * Returns a number unique to this instance
     *
     * @return {Number} - The unique identifier
     */
    getUniqueId () {
        return this.id
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
     * Returns the path to the source code file containing the test
     *
     * @return {String} - The full path
     */
    getFilePath () {
        return this.file
    }

    /**
     * Returns the line number within the source code where the test is defined
     *
     * @return {Number} - The, one base, line number
     */
    getFileLine () {
        return this.line
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
