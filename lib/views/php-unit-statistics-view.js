/** @babel */
/** @jsx etch.dom */
/* global Promise */

import etch from 'etch'

export default class PhpUnitStatisticsView
{
	constructor (props) {
		this.stats = props.report ? props.report.getStatistics() : null

		etch.initialize(this)
	}

	update (props) {
		const stats = props.report ? props.report.getStatistics() : null

		if (stats !== this.stats) {
			this.stats = stats

			return etch.update(this)
		}

		return Promise.resolve()
	}

	clear () {
		return this.update({report: null})
	}

	render () {
		const children = []

		if (this.stats) {
			this.stats.forEach((value, label) => {
				children.push(
					<span className="stats-item">
						<span className="stats-label">{ label + ':' }</span>
						<span className="stats-value">{ value }</span>
					</span>
				)
			})
		}

		return (
			<div className="php-unit-statistics">
				{ children }
			</div>
		)
	}
}
