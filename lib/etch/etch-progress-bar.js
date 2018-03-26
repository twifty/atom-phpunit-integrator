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
    const width = Math.max(0, Math.min(100, this[symbols.self].properties.complete)) + '%'

    return (
      <div className="etch-flex-progress">
        <div className="complete" style={{ width }}></div>
        <span className="label">{ this[symbols.self].properties.label || width }</span>
      </div>
    )
  }
}
