/** @babel */

export default class FileCoverage
{
    /**
     * Constructor
     *
     * @constructor
     * @param {String} path - The full path to the covered file
     */
    constructor (path, classCount) {
        this.path = path
        this.lines = {}
        this.classes = classCount
        this.metrics = null
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

        // https://github.com/sebastianbergmann/php-code-coverage/issues/608
        // php-code-coverage includes extra line elements for files not covered
        for (const idx of Object.keys(this.lines)) {
            if (!(idx in report.lines)) {
                delete this.lines[idx]
            } else {
                const line = report.lines[idx]

                this.addLine(line)

                delete report.lines[idx]
            }
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
     * Returns a clone of the metrics object
     *
     * @return {Object} - The cloned object
     */
    getMetrics () {
        if (!this.metrics) {
            this.metrics = this.calculateMetrics()
        }

        const clone = {
            classes: this.classes,
            total: {},
            covered: {}
        }

        Object.assign(clone.total, this.metrics.total)
        Object.assign(clone.covered, this.metrics.covered)

        return clone
    }

    /**
     * Returns the file coverage as a percentage
     *
     * @return {Number}
     */
    getCoveredPercent () {
        const metrics = this.getMetrics()
        const total = metrics.total.lines
        const covered = metrics.covered.lines

        return total ? ((covered / total) * 100) : 0
    }

    /**
     * Adds a coverage line to the instance
     *
     * @param {LineCoverage} line
     */
    addLine (line) {
        this.metrics = null

        const idx = line.getNum()

        if (!this.lines[idx]) {
            this.lines[idx] = line
        } else if (line.isCovered()) {
            this.lines[idx].covered = true
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

    /**
     * Builds the metrics object by iterating the lines
     *
     * @private
     * @return {Object} - The calculated metrics
     */
    calculateMetrics () {
        const metrics = {
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

        let inMethod = false
        let methodCovered = true

        for (const idx of Object.keys(this.lines).sort((a, b) => a - b)) {
            const line = this.lines[idx]
            const covered = line.isCovered()

            metrics.total.lines++
            if (covered) {
                metrics.covered.lines++
            }

            switch (line.getType()) {
                case 'method':
                    // php-code-coverage up to 6.0.3 (inclusive) includes anonymous
                    // functions, declared within method bodies, as 'method'. This
                    // prevents us from hit testing lines as we do not know where
                    // the anonymous function ends and the outer method ends.
                    if (inMethod && methodCovered) {
                        metrics.covered.methods++
                    }
                    inMethod = true
                    methodCovered = covered
                    metrics.total.methods++
                    break

                case 'stmt':
                    if (inMethod && (!methodCovered || !covered)) {
                        methodCovered = false
                    }
                    metrics.total.statements++
                    if (covered) {
                        metrics.covered.statements++
                    }
                    break

                default:
                    throw new Error(`Unrecognized line type '${line.getType()}' for file '${this.path}'`)
            }
        }

        if (inMethod && methodCovered) {
            metrics.covered.methods++
        }

        metrics.total.elements = metrics.total.statements + metrics.total.methods
        metrics.covered.elements = metrics.covered.statements + metrics.covered.methods

        return metrics
    }
}
