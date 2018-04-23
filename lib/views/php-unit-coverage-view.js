/** @babel */
/** @jsx etch.dom */
/* global Promise */

import etch from 'etch'
import Path from 'path'

import {EtchProgressBar, EtchTable, EtchTableColumn, EtchTableCell} from 'colletch'
import {openInAtom} from '../util/php-unit-utils'

/**
 * Helper class for the etch table cell
 */
class StatsView extends EtchTableCell
{
    static renderHeader () {
        return (<span>
            <span>{ 'Covered' }</span>
            <span>{ '/' }</span>
            <span>{ 'Total (stmts)' }</span>
        </span>)
    }

    render () {
        const fileReport = this.getFields()
        const metrics = fileReport.getMetrics()

        return (
            <span>
                <span>{ metrics.covered.statements }</span>
                <span>{ '/' }</span>
                <span>{ metrics.total.statements }</span>
            </span>
        )
    }
}

/**
 * A view of the covered files in a table format
 */
export default class PhpUnitCoverageView
{
    /**
     * Constructor
     *
     * @constructor
     * @param {Object}                [properties]      - The inital state
     * @param {PhpUnitCoverageReport} properties.report - The report results
     */
    constructor (properties = {}) {
        if (properties.report) {
            this.report = properties.report
            this.root = properties.report.getProject().getRoot()
            this.fileReports = properties.report.getFileReports()
        }

        etch.initialize(this)
    }

    /**
     * Updates the rendered report
     *
     * @param  {Object}                properties        - The inital state
     * @param  {PhpUnitCoverageReport} properties.report - The report results
     *
     * @return {Promise}                                 - Resolves when rendering complete
     */
    update (properties = {}) {
        if (properties.report !== this.report) {
            this.report = properties.report

            if (this.report) {
                this.root = this.report.getProject().getRoot()
                this.fileReports = this.report.getFileReports()
            } else {
                this.root = null
                this.fileReports = null
            }

            return etch.update(this)
        }

        return Promise.resolve()
    }

    /**
     * Resets the component to its initial empty state
     *
     * @return {Promise} - Resolves when rendering complete
     */
    clear () {
        return this.update()
    }

    /**
     * Generates the virtual DOM
     *
     * @return {VirtualDom} - The virtual dom required by etch
     */
    render () {
        const makeRelative = (fileReport) => {
            const result = {}
            const path = fileReport.getFilePath()

            if (path) {
                if (path.startsWith(this.root)) {
                    result.path = path.substr(this.root.length + 1)
                } else {
                    result.path = Path.relative(this.root, path)
                }
            }

            return result
        }

        const fetchLineCounts = (fileReport) => {
            const result = {}
            const metrics = fileReport.getMetrics()

            result.total = metrics.total.lines
            result.complete = metrics.covered.lines

            return result
        }

        const sort = {
            initial: 'asc',
            resolver: (element) => {
                return element.dataset
            },
            comparator: (left, right, asc) => {
                let delta = left.percent - right.percent

                if (delta === 0) {
                    delta = left.total - right.total
                }

                return asc ? delta : -delta
            }
        }

        let total = {}

        if (this.report) {
            total = fetchLineCounts(this.report)
        }

        return (
            <div className="php-unit-coverage-view">
                <EtchTable data={this.fileReports}>
                    <EtchTableColumn
                        sortable="sortable"
                        field={ makeRelative }
                        className="covered-file file-link"
                        bind={ { click: (fileReport) => { openInAtom(fileReport.getFilePath()) }} }
                    >
                        Files
                    </EtchTableColumn>

                    <EtchTableColumn
                        sortable={sort}
                        value="Covered (%)"
                        field={ fetchLineCounts }
                        className="covered-percent"
                    >
                        <EtchProgressBar />
                    </EtchTableColumn>

                    <EtchTableColumn
                        value={ StatsView.renderHeader }
                        className="covered-stats"
                    >
                        <StatsView/>
                    </EtchTableColumn>
                </EtchTable>

                <EtchProgressBar {...total} />
            </div>
        )
    }
}
