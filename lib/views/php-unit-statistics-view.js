/** @babel */
/** @jsx etch.dom */
/* global Promise */

import etch from 'etch'

import {maxState} from '../reports/states'

export default class PhpUnitStatisticsView
{
    constructor (props) {
        this.statistics = props.report ? props.report.getStatistics() : null
        this.state = props.report ? maxState(props.report.getContainedStates()) : null

        etch.initialize(this)
    }

    update (props) {
        const stats = props.report ? props.report.getStatistics() : null

        if (stats !== this.statistics) {
            this.statistics = stats
            this.state = props.report ? maxState(props.report.getContainedStates()) : null

            return etch.update(this)
        }

        return Promise.resolve()
    }

    clear () {
        return this.update({report: null})
    }

    render () {
        const children = []

        if (this.statistics) {
            this.statistics.forEach((value, label) => {
                children.push(
                    <span className="stats-item">
                        <span className="stats-label">{ label + ':' }</span>
                        <span className="stats-value">{ value }</span>
                    </span>
                )
            })
        }

        let className = 'php-unit-statistics'

        if (this.state) {
            className += ' ' + ('skipped' === this.state ? 'passed' : this.state)
        }

        return (
            <div className={ className }>
                { children }
            </div>
        )
    }
}
