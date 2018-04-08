/** @babel */
/* global console WeakMap */

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
	 * @param {PhpUnitProject} project - The project to which the report belongs
	 * @param {DomDocument}    xmlDoc  - A valid test result xml file
	 */
	constructor (project, xmlDoc, result) {
		this.project = project
		this.doc = xmlDoc
		this.result = result
		this.containedStates = {}
		this.resultMap = new WeakMap()
	}

	/**
	 * Destructor
	 */
	destroy () {
		this.project = null
		this.doc = null
		this.testSuites = null
		this.containedStates = {}

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

		for (const state of report.getContainedStates()) {
			this.containedStates[state] = true
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
	 * Returns the states of all test cases
	 *
	 * @return {Array<String>} - The state names
	 */
	getContainedStates () {
		this.buildTestSuiteReports()

		return Object.keys(this.containedStates)
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
				const suiteReport = this.testSuites[suiteName] || new SuiteReport(suiteName, this.result)

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

		if (1 < errors.length) {
			console.log('<testcase> conatins multiple children, please report this as a bug.');
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

		this.containedStates[meta.state] = true

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
