/** @babel */
/** @jsx etch.dom */

import etch from 'etch'

import EtchComponent from './etch-component'
import symbols from './symbols'

export default class EtchProgressBar extends EtchComponent
{
  [symbols.getDefaultProperties] () {
    return {
      complete: 0,
      label: ''
    }
  }

  render () {
    var total = 100
    var width = 0

    if (!Number.isNaN(this[symbols.self].properties.total)) {
      total = this[symbols.self].properties.total
    }

    if (!Number.isNaN(this[symbols.self].properties.complete)) {
      width = Math.max(0, Math.min(total, this[symbols.self].properties.complete))
    }

    const percent = (total ? Math.round((width / total) * 100) : 0)

    return (
      <div dataset={{width, total, percent}} className="etch-flex-progress">
        <div className="complete" style={{ width: percent + '%' }}></div>
        <span className="label">{ this[symbols.self].properties.label || (percent + '%') }</span>
      </div>
    )
  }
}
