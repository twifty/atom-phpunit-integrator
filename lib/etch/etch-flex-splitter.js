/** @babel */
/** @jsx etch.dom */
/* global document Promise */

import etch from 'etch'

import EtchComponent from './etch-component'
import symbols from './symbols'

export default class EtchFlexSplitter extends EtchComponent
{
  [symbols.initialize] () {
    this[symbols.self].emitter = this[symbols.self].properties.emitter || {emit: () => {}}
    this[symbols.self].state = {
      active: false
    }
  }

  [symbols.getDefaultProperties] () {
    return {
      propagate: false,
      className: '',
      style: {}
    }
  }

  onMouseDown (event) {
    this[symbols.self].state.active = true

    const mouseMove = (event) => {
      return this.onMouseMove(event)
    }

    const mouseUp = (event) => {
      document.removeEventListener('mousemove', mouseMove)
      document.removeEventListener('mouseup', mouseUp)
      document.body.style.cursor = 'auto'

      return this.onMouseUp(event)
    }

    document.body.style.cursor = this[symbols.self].properties.orientation === 'vertical' ? 'col-resize' : 'row-resize'

    document.addEventListener('mouseup', mouseUp)
    document.addEventListener('mousemove', mouseMove, {
      passive: false
    })

    this[symbols.self].emitter.emit('splitter.startResize', {
      index: this[symbols.self].properties.index,
      event
    })
  }

  onMouseMove (event) {
    if (this[symbols.self].state.active) {
      this[symbols.self].emitter.emit('splitter.resize', {
        index: this[symbols.self].properties.index,
        event
      })

      event.stopPropagation()
      event.preventDefault()
    }
  }

  onMouseUp (event) {
    if (this[symbols.self].state.active) {
      this[symbols.self].state.active = false

      this[symbols.self].emitter.emit('splitter.stopResize', {
        index: this[symbols.self].properties.index,
        event
      })
    }
  }

  update () {
    return Promise.resolve()
  }

  render () {
    const active = this[symbols.self].state.active ? 'active' : null

    return (
      <div
        className={ this[symbols.getClassName]('etch-flex-splitter', active) }
        style={ this[symbols.getStyle]() }
        on={{ mousedown: this.onMouseDown }} >
      </div>
    )
  }
}
