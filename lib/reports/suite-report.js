/** @babel */

import AbstractTestReport from './abstract-test-report'

const STATES = {
	'passed': 0,
	'skipped': 1,
	'warning': 2,
	'failure': 3,
	'error': 4
}

const STATE_HIERARCHY = {
	0: 'passed',
	1: 'skipped',
	2: 'warning',
	3: 'failure',
	4: 'error'
}

const maxState = (l, r) => {
	return STATE_HIERARCHY[
		Math.max( STATES[l], STATES[r] )
	]
}

export default class SuiteReport extends AbstractTestReport
{
	/**
	 * Constructor
	 *
	 * @param {String} name - The suite name
	 */
	constructor (name) {
		super({state: 'passed', name})

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
	 * Returns the states of all case reports
	 *
	 * @return {Array<String>} - The state names
	 */
	getContainedStates () {
		return Object.keys(this.containedStates)
	}
}
