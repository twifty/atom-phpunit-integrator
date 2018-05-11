/** @babel */
/* global console */

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
        this.metrics = {
            classes: 0,
            total: {
                lines: 0,
                methods: 0,
                statements: 0,
                elements: 0
            },
            covered: {
                lines: 0,
                methods: 0,
                statements: 0,
                elements: 0
            }
        }
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
        let missmatch = false

        for (const path of Object.keys(otherReports)) {
            const fileReport = otherReports[path]
            const otherMetrics = fileReport.getMetrics()

            if (path in localReports) {
                const localMetrics = localReports[path].getMetrics()

                if (missmatch || localMetrics.classes !== otherMetrics.classes) {
                    missmatch = true
                }

                for (const name of ['lines', 'methods', 'statements', 'elements']) {
                    if (missmatch || localMetrics.total[name] !== otherMetrics.total[name]) {
                        missmatch = true
                    }

                    this.metrics.covered[name] += otherMetrics.covered[name] - localMetrics.covered[name]
                }

                localReports[path].merge(fileReport)
            } else {
                // NOTE This should never happen with phpunit
                this.metrics.classes += otherMetrics.classes
                for (const name of ['lines', 'methods', 'statements', 'elements']) {
                    this.metrics.total[name] += otherMetrics.total[name]
                    this.metrics.covered[name] += otherMetrics.covered[name]
                }

                localReports[path] = fileReport
            }

            delete otherReports[path]
        }

        this.suppressWarning = report.suppressWarning
        if (missmatch && !this.suppressWarning) {
            this.suppressWarning = true
            console.warn(
                "Some discrepancies between class and method counts were detected.\n" +
                "Please upgrade 'phpunit/php-code-coverage' to at least version 6.0.4"
            )
        }

        report.destroy()

        return this
    }

    /**
     * Returns a clone of the metrics object
     *
     * @return {Object} - The cloned object
     */
    getMetrics () {
        const clone = {
            classes: this.metrics.classes,
            total: {},
            covered: {}
        }

        Object.assign(clone.total, this.metrics.total)
        Object.assign(clone.covered, this.metrics.covered)

        return clone
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
        let missmatch = false

        nodes.forEach(node => {
            const lines = xpath.select("./line", node)
            const metrics = xpath.select("./metrics", node)
            const path = node.getAttribute('name')

            if (!metrics || 1 !== metrics.length) {
                throw new Error(`Expected exactly one <metrics> node, got (${metrics && metrics.length})`)
            }

            const classCount = parseInt(metrics[0].getAttribute('classes'))
            const report = new FileCoverage(path, classCount)

            const fileMetrics = {
                total: {
                    lines: lines.length,
                    methods: parseInt(metrics[0].getAttribute('methods')),
                    statements: parseInt(metrics[0].getAttribute('statements')),
                    elements: parseInt(metrics[0].getAttribute('elements')),
                },
                covered: {
                    lines: parseInt(metrics[0].getAttribute('coveredelements')),
                    methods: parseInt(metrics[0].getAttribute('coveredmethods')),
                    statements: parseInt(metrics[0].getAttribute('coveredstatements')),
                    elements: parseInt(metrics[0].getAttribute('coveredelements')),
                }
            }

            lines.forEach(line => {
                const name = line.getAttribute('name')
                const meta = name ? {name} : null

                report.addLine(
                    new LineCoverage({
                        type: line.getAttribute('type'),
                        num: parseInt(line.getAttribute('num')),
                        covered: !!parseInt(line.getAttribute('count')),
                        meta
                    })
                )
            })

            const reportMetrics = report.getMetrics()
            if (missmatch || classCount !== reportMetrics.classes) {
                missmatch = true
            }

            this.metrics.classes += classCount

            for (const which of ['total', 'covered']) {
                for (const name of ['lines', 'methods', 'statements', 'elements']) {
                    if (missmatch || fileMetrics[which][name] !== reportMetrics[which][name]) {
                        missmatch = true
                    }

                    this.metrics[which][name] += fileMetrics[which][name]
                }
            }

            fileReports[path] = report
        })

        if (missmatch && !this.suppressWarning) {
            this.suppressWarning = true
            console.warn(
                "Some discrepancies between class and method counts were detected.\n" +
                "Please upgrade 'phpunit/php-code-coverage' to at least version 6.0.4"
            )
        }

        return fileReports
    }
}
