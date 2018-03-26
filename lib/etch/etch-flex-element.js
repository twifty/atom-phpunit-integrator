/** @babel */
/** @jsx etch.dom */
/* global Promise */

import etch from 'etch'

import EtchComponent from './etch-component'
import symbols from './symbols'

export default class EtchFlexElement extends EtchComponent
{
  [symbols.initialize] () {
    this[symbols.self].state = {
      dimensions: {
        height: "100%",
        width: "100%"
      }
    }
  }

  [symbols.getDefaultProperties] () {
    return {
      className: ''
    }
  }

  update (properties) {
    if (properties.flex !== this[symbols.self].properties.flex) {
      this[symbols.self].properties.flex = properties.flex
      return super.update(...arguments)
    }

    return Promise.resolve()
  }

  render () {
    const innerStyle = {
      height: this[symbols.self].state.dimensions.height,
      width: this[symbols.self].state.dimensions.width
    }

    return (
      <div ref='outer'
        className={ this[symbols.getClassName]('etch-flex-element') }
        style={ this[symbols.getStyle]({flex: this[symbols.self].properties.flex}) }
      >
        <div style={innerStyle}>
          { this[symbols.self].children }
        </div>
      </div>
    )
  }
}
