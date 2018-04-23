/** @babel */

import AbstractTestReport from './abstract-test-report'
import {maxState} from './states'

export default class SuiteReport extends AbstractTestReport
{
    /**
     * Constructor
     *
     * @constructor
     * @param {String} name        - The suite name
     * @param {String} file        - The path to the source file containing the test
     * @param {Object} result      - The raw process output
     * @param {Number} result.code - The process' exit code
     * @param {String} result.data - The process' stdout data
     * @param {String} result.cmd  - The process' command line
     */
    constructor (name, file, result) {
        super({state: 'passed', name, file})

        this.result = result
        this.caseReports = {}
        this.containedStates = {}
    }

    /**
     * Checks if the instance is a suite report
     *
     * @return {Boolean} - Always true
     */
    isSuiteReport () {
        return true
    }

    /**
     * Merges another instance into this
     *
     * NOTE: It is not safe to use the other instance after merging
     *
     * @param  {SuiteReport} report - The instance to merge
     */
    merge (report) {
        if (!(report instanceof SuiteReport)) {
            throw new Error(`Expected a SuiteReport, but got (${typeof report})`)
        }

        if (report === this) {
            throw new Error('Cannot merge with self')
        }

        this.state = maxState(this.state, report.state)

        for (const idx of Object.keys(report.caseReports)) {
            const caseReport = report.caseReports[idx]

            this.addCaseReport(caseReport)

            delete report.caseReports[idx]
        }
    }

    /**
     * Returns the raw data output by the process
     *
     * @return {{code: Number, data: String}} - The exit code and stdout data of the process
     */
    getRawResult () {
        return Object.assign({}, this.result)
    }

    /**
     * Adds a case report
     *
     * @param {CaseReport} report - The case report to add
     */
    addCaseReport (report) {
        const name = report.getName()

        if (!(name in this.caseReports)) {
            const state = report.getState()

            this.time += report.getTime()
            this.state = maxState(this.state, state)
            this.assertions += report.getAssertionCount()

            this.caseReports[name] = report
            this.containedStates[state] = true
        }
    }

    /**
     * Returns all case reports
     *
     * @return {Array<CaseReport>} - All case reports
     */
    getCaseReports () {
        return Object.values(this.caseReports)
    }

    /**
     * Returns a single case report by name
     *
     * @param  {String} caseName - The name of the report to retrieve
     *
     * @return {CaseReport}      - The resolved case report
     * @throws                   - If the name does not exist
     */
    getCaseReport (caseName) {
        if (!(caseName in this.caseReports)) {
            throw new Error(`Test case (${caseName}) does not belong to this instance (${this.getName()})`)
        }

        return this.caseReports[caseName]
    }

    /**
     * Returns the states of all case reports
     *
     * @return {Array<String>} - The state names
     */
    getContainedStates () {
        return Object.keys(this.containedStates)
    }
}
