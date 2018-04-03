/** @babel */

import xpath from 'xpath'

import FileCoverage from './file-coverage'
import LineCoverage from './line-coverage'

export default class PhpUnitCoverageReport
{
	/**
	 * Constructor
	 *
	 * @constructor
	 * @param {PhpUnitProject} project - The project to which the report belongs
	 * @param {DomDocument}   xmlDoc   - A valid test result xml file
	 */
	constructor (project, xmlDoc) {
		this.project = project
		this.doc = xmlDoc
	}

	/**
	 * Destructor
	 */
	destroy () {
		this.project = null
		this.doc = null
		this.fileReports = null
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
	 * Merges another instance into this
	 *
	 * NOTE: The other instance will become empty after calling this
	 *
	 * @param  {PhpUnitCoverageReport} report - The report to merge
	 *
	 * @return {PhpUnitCoverageReport}        - A reference to this
	 */
	merge (report) {
		if (!(report instanceof PhpUnitCoverageReport)) {
			throw new Error(`Expected a PhpUnitCoverageReport, but got (${typeof report})`)
		}

		if (report === this) {
			throw new Error('Cannot merge with self')
		}

		const localReports = this.buildFileReports()
		const otherReports = report.buildFileReports()

		for (const path of Object.keys(otherReports)) {
			const fileReport = otherReports[path]

			if (path in localReports) {
				this.covered -= localReports[path].getCoveredStatementCount()

				localReports[path].merge(fileReport)

				this.covered += localReports[path].getCoveredStatementCount()
			} else {
				this.total += fileReport.getTotalStatementCount()
				this.covered += fileReport.getCoveredStatementCount()

				localReports[path] = fileReport
			}

			delete otherReports[path]
		}

		report.destroy()

		return this
	}

	/**
	 * Returns all the file reports
	 *
	 * @return {Array<FileCoverage>} - The file reports
	 */
	getFileReports () {
		return Object.values(this.buildFileReports())
	}

	/**
	 * Returns a single file report for the given path
	 *
	 * @param  {String} path - The path to search for
	 *
	 * @return {FileCoverage}
	 */
	getFileReport (path) {
		const reports = this.buildFileReports()

		return reports[path] || null
	}

	/**
	 * Returns the calculated coverage in a percentage
	 *
	 * @return {Number}
	 */
	getCoveragePercent () {
		if (!this.fileReports) {
			this.getFileReports()
		}

		return this.total ? Math.round((this.covered / this.total) * 100) : 0
	}

	/**
	 * Parses the xml and generates the file reports
	 *
	 * @private
	 * @return {Object} - The file report map
	 */
	buildFileReports () {
		if (!this.doc) {
			throw new Error('An XML document has not been configured!')
		}

		if (!this.fileReports) {
			const projectMetrics = xpath.select('/coverage/project/metrics', this.doc)
			const projectFiles = xpath.select('/coverage/project/file', this.doc)
			const projectPackages = xpath.select('/coverage/project/package', this.doc)

			if (projectMetrics.length !== 1) {
				throw new Error(`Expected one <metrics> node exist, found ${projectMetrics.length}`)
			}

			this.covered = parseInt(projectMetrics[0].getAttribute('coveredstatements'))
			this.total = parseInt(projectMetrics[0].getAttribute('statements'))
			this.fileReports = this.parseFiles(projectFiles)

			projectPackages.forEach(node => {
				const packageFiles = xpath.select('./file', node)

				Object.assign(this.fileReports, this.parseFiles(packageFiles))
			})
		}

		return this.fileReports
	}

	/**
	 * Reads the coverage data for a single file
	 *
	 * @private
	 * @param  {Array<DomNode>} nodes - The file nodes
	 *
	 * @return {Object}               - Filname to file report map
	 */
	parseFiles (nodes) {
		const fileReports = {}

		nodes.forEach(node => {
			const lines = xpath.select("./line", node)
			const path = node.getAttribute('name')
			const report = new FileCoverage(path)

			lines.forEach(line => {
				report.addLine(
					new LineCoverage({
						type: line.getAttribute('type'),
						num: parseInt(line.getAttribute('num')),
						covered: !!parseInt(line.getAttribute('count'))
					})
				)
			})

			fileReports[path] = report
		})

		return fileReports
	}
}
