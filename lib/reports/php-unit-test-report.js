/** @babel */
/* global console Map */

import xpath from 'xpath'

import CaseReport from './case-report'
import SuiteReport from './suite-report'
import ErrorReport from './error-report'

export default class PhpUnitTestReport
{
    /**
     * Constructor
     *
     * @constructor
     * @param {PhpUnitProject} project     - The project to which the report belongs
     * @param {DomDocument}    xmlDoc      - A valid test result xml file
     * @param {Object}         result      - The raw process output
     * @param {Number}         result.code - The process' exit code
     * @param {String}         result.data - The process' stdout data
     * @param {String}         result.cmd  - The process' command line
     */
    constructor (project, xmlDoc, result) {
        this.project = project
        this.doc = xmlDoc
        this.result = result
        this.valid = true

        this.time = 0
        this.tests = 0
        this.assertions = 0
        this.states = {}
    }

    /**
     * Destructor
     */
    destroy () {
        this.project = null
        this.doc = null
        this.testSuites = null
        this.valid = false
    }

    /**
     * Checks if the report has been destroyed or not
     *
     * @return {Boolean}
     */
    isValid () {
        return this.valid
    }

    /**
     * Moves the suite reports from another instance into this instance
     *
     * NOTE: The other instance will become empty after this call
     *
     * @param  {PhpUnitTestReport} report - The report to merge
     *
     * @return {PhpUnitTestReport}        - A reference to this
     */
    merge (report) {
        if (!(report instanceof PhpUnitTestReport)) {
            throw new Error(`Expected a PhpUnitTestReport, but got (${typeof report})`)
        }

        if (report === this) {
            throw new Error('Cannot merge with self')
        }

        const localReports = this.buildTestSuiteReports()
        const otherReports = report.buildTestSuiteReports()

        for (const suiteName of Object.keys(otherReports)) {
            const suiteReport = otherReports[suiteName]

            if (suiteName in localReports) {
                localReports[suiteName].merge(suiteReport)
            } else {
                localReports[suiteName] = suiteReport
            }

            delete otherReports[suiteName]
        }

        this.time += report.time
        this.assertions += report.assertions
        this.tests += report.tests

        for (const state of Object.keys(report.states)) {
            if (!(state in this.states)) {
                this.states[state] = report.states[state]
            } else {
                this.states[state] += report.states[state]
            }
        }

        report.destroy()

        return this
    }

    /**
     * Returns the project to which the report belongs
     *
     * @return {PhpUnitProject}
     */
    getProject () {
        return this.project
    }

    /**
     * Returns the full test result
     *
     * @return {Array<SuiteReport>}
     */
    getTestSuiteReports () {
        return Object.values(this.buildTestSuiteReports())
    }

    /**
     * Returns a single test suite report by name
     *
     * @param  {String} suiteName - The name of a test suite
     *
     * @return {SuiteReport}      - The test suite report
     */
    getTestSuiteReport (suiteName) {
        const reports = this.buildTestSuiteReports()

        if (!(suiteName in reports)) {
            throw new Error(`The test suite '${suiteName}' could not be found!`)
        }

        return reports[suiteName]
    }

    /**
     * Returns a single test suite report by name
     *
     * @param  {String} suiteName - The name of the containing test suite
     * @param  {String} caseName  - The name of the individual case
     *
     * @return {CaseReport}       - The resolved case report
     */
    getTestCaseReport (suiteName, caseName) {
        const suiteReport = this.getTestSuiteReport(suiteName)

        return suiteReport.getCaseReport(caseName)
    }

    /**
     * Returns the states of all test cases
     *
     * @return {Array<String>} - The state names
     */
    getContainedStates () {
        this.buildTestSuiteReports()

        return Object.keys(this.states)
    }

    /**
     * Returns a map of label to values
     *
     * @return {Map} - The total statistics
     */
    getStatistics () {
        const stats = new Map()

        stats.set('Tests', this.tests)

        for (const state of Object.keys(this.states)) {
            const label = state.charAt(0).toUpperCase() + state.substring(1)

            stats.set(label, this.states[state])
        }

        stats.set('Assertions', this.assertions)
        stats.set('Time', this.time.toFixed(5))

        return stats
    }

    /**
     * Returns each test case result as a simple object
     *
     * Returns a promise so that subsequent calls recieve the same result
     *
     * @private
     * @return {Object} - A SuiteReport map
     */
    buildTestSuiteReports () {
        if (!this.testSuites) {
            if (!this.doc) {
                throw new Error('An XML document has not been configured!')
            }

            const suites = xpath.select('/testsuites/testsuite', this.doc)
            let caseReports = []

            suites.forEach(testSuite => {
                caseReports = caseReports.concat(this.parseTestSuite(testSuite))
            })

            this.testSuites = {}

            caseReports.forEach(caseReport => {
                const suiteName = caseReport.getSuiteName() || '<standalone>'
                const suiteReport = this.testSuites[suiteName] || new SuiteReport(suiteName, caseReport.getFilePath(), this.result)

                suiteReport.addCaseReport(caseReport)

                this.testSuites[suiteName] = suiteReport
            })
        }

        return this.testSuites
    }

    /**
     * Converts dom error nodes into error reports
     *
     * @private
     * @param  {DomNode} node       - The parent node containing errors
     *
     * @return {Array<ErrorReport>} - The converted error reports
     */
    parseErrors (node) {
        const errors = []

        for (const type of ['error', 'warning', 'failure', 'skipped']) {
            const children = xpath.select('./' + type, node)

            // PHPUnit should have a max of one child
            if (1 < children.length) {
                console.log(`multiple <${type}> types detected, please report this as a bug.`);
            }

            if (children.length === 1) {
                errors.push(
                    new ErrorReport({
                        type: type,
                        message: children[0].getAttribute('type'),
                        detail: children[0].textContent
                    })
                )
            }
        }

        return errors
    }

    /**
     * Reads a single test case and converts it to an object
     *
     * @private
     * @param  {DomNode} node - The node with the case data
     *
     * @return {CaseReport}   - The converted object
     */
    parseTestCase (node) {
        let meta = {
            state: 'passed',

            // The name of the test case method
            name: node.getAttribute('name'),
            time: parseFloat(node.getAttribute('time')),

            // The following are only available if a genuine test case was used

            // The fully qualified class name
            suite: node.getAttribute('class'),
            // The full path to the source
            file: node.getAttribute('file'),
            // The line on which the test case was declared
            line: parseInt(node.getAttribute('line')),
            // The number of assert statements in the test
            assertions: parseInt(node.getAttribute('assertions')),

            output: '',

            errors: this.parseErrors(node)
        }

        const output = xpath.select('./system-out', node)

        if (output.length > 0) {
            meta.output = output[0].textContent
        }

        if (0 < meta.errors.length) {
            meta.state = meta.errors[0].getType()
        }

        // this.containedStates[meta.state] = true

        this.time += meta.time
        this.assertions += meta.assertions
        this.tests++

        if (!(meta.state in this.states)) {
            this.states[meta.state] = 1
        } else {
            this.states[meta.state] += 1
        }

        return new CaseReport(meta)
    }

    /**
     * Reads and converts a test suite node
     *
     * @private
     * @param  {DomNode} suite      - The node containing the suite data and cases
     *
     * @return {Array<CaseReport>}  - The converted results
     */
    parseTestSuite (suite) {
        let caseReports = []

        const suites = xpath.select('./testsuite', suite)
        const cases = xpath.select('./testcase', suite)

        suites.forEach(testSuite => {
            caseReports = caseReports.concat(this.parseTestSuite(testSuite))
        })

        cases.forEach(testCase => {
            caseReports.push(this.parseTestCase(testCase))
        })

        return caseReports
    }
}
