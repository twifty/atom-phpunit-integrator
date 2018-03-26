/** @babel */
/** @jsx etch.dom */
/* global Promise */

import etch from 'etch'
import Path from 'path'

import {EtchProgressBar} from '../etch/components'
import {openInAtom} from '../util/php-unit-utils'

class CoverageHeader
{
  constructor () {
    etch.initialize(this)
  }

  update () {
    return Promise.resolve()
  }

  render () {
    return (
      <div className="php-unit-coverage-row header">
        <div className="php-unit-coverage-cell covered-file">
          <span>File</span>
        </div>
        <div className="php-unit-coverage-cell covered-percent">
          <span>Coverage (%)</span>
        </div>
        <div className="php-unit-coverage-cell covered-stats">
          <span>Covered/Total (stmts)</span>
        </div>
      </div>
    )
  }
}

class CoverageRow
{
  constructor (properties) {
    this.meta = properties.file
    // this.element = this.render()

    etch.initialize(this)
  }

  update () {
    return Promise.resolve()
  }

  render () {
    return (
      <div className="php-unit-coverage-row">
        <div className="php-unit-coverage-cell covered-file file-link">
          <span onClick={ () => {openInAtom(this.meta.label)} } >{ this.meta.label }</span>
        </div>
        <div className="php-unit-coverage-cell covered-percent">
          <EtchProgressBar complete={ this.meta.percent } />
          {/* <span>{ this.meta.percent }</span> */}
        </div>
        <div className="php-unit-coverage-cell covered-stats">
          <span>{ this.meta.covered + '/' + this.meta.total }</span>
        </div>
      </div>
    )
  }
}

export default class PhpUnitCoverageView
{
  constructor (properties) {
    if (properties) {
      this.report = properties.report
      this.root = properties.root
    }

    etch.initialize(this)
  }

  update (properties) {
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

  render () {
    const children = []

    if (this.meta) {
      for (const file of Object.values(this.meta.files)) {
        if (!file.label) {
          if (file.path.startsWith(this.root)) {
            file.label = file.path.substr(this.root.length + 1)
          } else {
            file.label = Path.relative(this.root, file.path)
          }
        }

        children.push(<CoverageRow file={file}/>)
      }
    }

    return (
      <div className="php-unit-coverage-view">
        <CoverageHeader />
        { children }
      </div>
    )
  }
}
