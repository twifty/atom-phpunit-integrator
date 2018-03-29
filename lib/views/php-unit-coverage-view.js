/** @babel */
/** @jsx etch.dom */
/* global Promise */

import etch from 'etch'
import Path from 'path'

import {EtchProgressBar, EtchTable, EtchTableColumn, EtchTableCell} from '../etch/components'
import {openInAtom} from '../util/php-unit-utils'

/**
 * Helper class for the etch table cell
 */
class StatsView extends EtchTableCell
{
  static renderHeader () {
    return (
      <span>
        <span>{ 'Covered' }</span>
        <span>{ '/' }</span>
        <span>{ 'Total (stmts)' }</span>
      </span>
    )
  }

  render () {
    const fields = this.getFields()

    return (
      <span>
        <span>{ fields.covered }</span>
        <span>{ '/' }</span>
        <span>{ fields.total }</span>
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
   * @param {String}                properties.root   - The root dir of the tested project
   */
  constructor (properties) {
    if (properties) {
      this.report = properties.report
      this.root = properties.root
    }

    etch.initialize(this)
  }

  /**
   * Updates the rendered report
   *
   * @param  {Object}                properties        - The inital state
   * @param  {PhpUnitCoverageReport} properties.report - The report results
   * @param  {String}                properties.root   - The root dir of the tested project
   *
   * @return {Promise}                                 - Resolves when rendering complete
   */
  update (properties = {}) {
    if (properties.report !== this.report) {
      this.report = properties.report
      this.root = properties.root

      if (this.report) {
        this.report.getCoverage().then(meta => {
          this.meta = meta

          return etch.update(this)
        })
      } else {
        this.meta = null

        return etch.update(this)
      }
    }

    return Promise.resolve()
  }

  /**
   * Generates the virtual DOM
   *
   * @return {VirtualDom} - The virtual dom required by etch
   */
  render () {
    const makeRelative = (fields) => {
      const result = {}

      if (fields.path) {
        if (fields.path.startsWith(this.root)) {
          result.path = fields.path.substr(this.root.length + 1)
        } else {
          result.path = Path.relative(this.root, fields.path)
        }
      }

      return result
    }

    const sort = {
      initial: 'asc',
      resolver: (element) => {return element.dataset},
      comparator: (left, right, asc) => {
        let delta = left.percent - right.percent

        if (delta === 0) {
          delta = left.total - right.total
        }

        return asc ? delta : -delta
      }
    }

    return (
      <EtchTable className="php-unit-coverage-view" data={ this.meta && this.meta.files } >
        <EtchTableColumn sortable field={ makeRelative } className="covered-file file-link" bind={{click: (fields) => {openInAtom(fields.path)}}} >
          Files
        </EtchTableColumn>

        <EtchTableColumn sortable={ sort } value="Covered (%)" field={["covered: complete", "total"]} className="covered-percent" >
          <EtchProgressBar />
        </EtchTableColumn>

        <EtchTableColumn field={["covered", "total"]} value={ StatsView.renderHeader } className="covered-stats" >
          <StatsView />
        </EtchTableColumn>
      </EtchTable>
    )
  }
}
