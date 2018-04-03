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

		return (
			<span>
				<span>{ fileReport.getCoveredStatementCount() }</span>
				<span>{ '/' }</span>
				<span>{ fileReport.getTotalStatementCount() }</span>
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
	constructor (properties) {
		if (properties && properties.report) {
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
			this.root = properties.report.getProject().getRoot()
			this.fileReports = properties.report.getFileReports()

			return etch.update(this)
		}

		return Promise.resolve()
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

		return (
			<EtchTable className="php-unit-coverage-view" data={this.fileReports}>
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
					field={ ["getCoveredStatementCount: complete", "getTotalStatementCount: total"] }
					className="covered-percent"
				>
					<EtchProgressBar/>
				</EtchTableColumn>

				<EtchTableColumn
					// field={ ["getCoveredStatementCount: covered", "getTotalStatementCount: total"] }
					value={ StatsView.renderHeader }
					className="covered-stats"
				>
					<StatsView/>
				</EtchTableColumn>
			</EtchTable>
		)
	}
}
