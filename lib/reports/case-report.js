/** @babel */

import AbstractTestReport from './abstract-test-report'

export default class CaseReport extends AbstractTestReport
{
    /**
     * Constructor
     *
     * @constructor
     * @param {String}             state      - One of 'passed', 'skipped', 'error', 'failure', 'warning'
     * @param {String}             name       - The name of the test case
     * @param {String}             time       - The time, in ms, it took to complete
     * @param {Number}             assertions - The count of assertions within the test
     * @param {String}             suite      - The parent test suite name
     * @param {String}             file       - The source file containing the test case
     * @param {Number}             line       - The line number within the source file
     * @param {String}             output     - Any text sent to stdout during the test
     * @param {Array<ErrorReport>} errors     - Any error data
     */
    constructor ({state, name, time, assertions, suite, file, line, output, errors}) {
        super({state, name, file, line, time, assertions})

        this.suite = suite
        this.output = output
        this.errors = errors
    }

    /**
     * Checks if this is a case report
     *
     * @return {Boolean} - Always true
     */
    isCaseReport () {
        return true
    }

    /**
     * Returns the parent test suite name
     *
     * NOTE: This may be different than a suite name in configuration files
     *
     * @return {[type]} [description]
     */
    getSuiteName () {
        return this.suite
    }

    /**
     * Returns any textual output sent to stdout during the test
     *
     * @return {String} - The textual output
     */
    getOutput () {
        return this.output
    }

    /**
     * Returns any errors associated with the test
     *
     * @return {Array<ErrorReport>} - The error reports
     */
    getErrors () {
        return this.errors
    }
}
