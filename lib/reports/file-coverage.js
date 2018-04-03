/** @babel */

export default class FileCoverage
{
	/**
	 * Constructor
	 *
	 * @constructor
	 * @param {String} path - The full path to the covered file
	 */
	constructor (path) {
		this.path = path
		this.coveredStatements = 0
		this.totalStatements = 0
		this.lines = {}
	}

	/**
	 * Merges another instance into this
	 *
	 * NOTE It is not safe to use the other instance after merging
	 *
	 * @param  {FileCoverage} report - The coverage report to merge
	 */
	merge (report) {
		if (!(report instanceof FileCoverage)) {
			throw new Error(`Expected a FileReport, but got (${typeof report})`)
		}

		if (report === this) {
			throw new Error('Cannot merge with self')
		}

		if (report.path !== this.path) {
			throw new Error(`Path '${report.path}' doesn't match local path (${this.path})`)
		}

		for (const idx of Object.keys(report.lines)) {
			const line = report.lines[idx]

			this.addLine(line)

			delete report.lines[idx]
		}
	}

	/**
	 * Returns the full path to the source
	 *
	 * @return {String}
	 */
	getFilePath () {
		return this.path
	}

	/**
	 * Returns the covered number of statements within the file
	 *
	 * @return {Number}
	 */
	getCoveredStatementCount () {
		return this.coveredStatements
	}

	/**
	 * Returns the total number of statements within the file
	 *
	 * @return {Number}
	 */
	getTotalStatementCount () {
		return this.totalStatements
	}

	/**
	 * Returns the file coverage as a percentage
	 *
	 * @return {Number}
	 */
	getCoveredPercent () {
		return this.totalStatements ? Math.round((this.coveredStatements / this.totalStatements) * 100) : 0
	}

	/**
	 * Adds a coverage line to the instance
	 *
	 * @param {LineCoverage} line
	 */
	addLine (line) {
		const idx = line.getNum()

		if (!this.lines[idx]) {
			if ('stmt' === line.getType()) {
				this.totalStatements++
				if (line.isCovered()) {
					this.coveredStatements++
				}
			}
			this.lines[idx] = line
		} else {
			if (!this.lines[idx].isCovered() && line.isCovered()) {
				this.coveredStatements++
				this.lines[idx].covered = true
			}
		}
	}

	/**
	 * Returns all line coverage
	 *
	 * @return {Array<LineCoverage>}
	 */
	getLines () {
		return Object.values(this.lines)
	}
}
