/** @babel */
/** @jsx etch.dom */
/* global Symbol ResizeObserver */

import etch from 'etch'
import {Emitter} from 'atom'

import EtchComponent from './etch-component'
import EtchFlexSplitter from './etch-flex-splitter'
import symbols from './symbols'

const onSplitterStartResize = Symbol()
const onSplitterResize = Symbol()
const addOffset = Symbol()
const getSize = Symbol()
const computeAvailableOffset = Symbol()
const computeAvailableStretch = Symbol()
const computeAvailableShrink = Symbol()
const checkPropagate = Symbol()
const dispatchOffset = Symbol()
const dispatchShrink = Symbol()
const dispatchStretch = Symbol()
const adjustFlex = Symbol()
const computePixelFlex = Symbol()
const computeFlexData = Symbol()
const configureChildrensProps = Symbol()

export default class EtchFlexContainer extends EtchComponent
{
  constructor () {
    super(...arguments)

    this[symbols.self].resizeObserver.observe(this.element)
  }

  destroy () {
    super.destroy()
    this[symbols.self].resizeObserver.disconnect()
    etch.destroy(this)
  }

  update () {
    super.update(...arguments, {
      update: false
    })

    this[configureChildrensProps]()

    return etch.update(this)
  }

  getState () {
    return this[symbols.self].flexData
  }

  render () {
    this[symbols.self].children.forEach((child, idx) => {
      if (idx < this[symbols.self].flexData.length) {
        child.props.flex = this[symbols.self].flexData[idx].flex
      }
    })

    const className = this[symbols.getClassName](
      'etch-flex-layout',
      'etch-flex-container',
      this[symbols.self].properties.orientation
    )

    return (
      <div className={ className } style={ this[symbols.self].properties.style }>
        { this[symbols.self].children }
      </div>
    )
  }

  [symbols.initialize] () {
    this[symbols.self].emitter = new Emitter()
    this[symbols.self].flexData = this[symbols.state] || []

    this[configureChildrensProps]()

    this[symbols.self].resizeObserver = new ResizeObserver(() => {
      this[symbols.self].flexData = this[computeFlexData]()
      this[symbols.self].resizeObserver.disconnect()
      etch.update(this)
    })

    this[symbols.self].emitter.on('splitter.startResize', this[onSplitterStartResize].bind(this))
    this[symbols.self].emitter.on('splitter.resize', this[onSplitterResize].bind(this))
  }

  [symbols.getDefaultProperties] () {
    return {
      orientation: 'horizontal',
      className: '',
      style: {}
    }
  }

  [configureChildrensProps] () {
    this[symbols.self].children.forEach((child, idx) => {
      child.props = Object.assign({
        maxSize: Number.MAX_VALUE,
        minSize: 1
      }, child.props || {}, {
        index: idx,
        emitter: this[symbols.self].emitter,
        orientation: this[symbols.self].properties.orientation
      })
    })

    // console.log(this[symbols.self].children)
  }

  [onSplitterStartResize] (data) {
    this[symbols.self].previousPos = this[symbols.self].properties.orientation === 'vertical' ? data.event.pageX : data.event.pageY
  }

  [onSplitterResize] (data) {
    if (this[symbols.self].flexData[data.index]) {
      const pos = this[symbols.self].properties.orientation === 'vertical' ? data.event.pageX : data.event.pageY
      const availableOffset = this[computeAvailableOffset](data.index, pos - this[symbols.self].previousPos)

      if (availableOffset) {
        this[symbols.self].previousPos = pos

        this[adjustFlex](this[dispatchOffset](data.index, availableOffset))

        this[symbols.self].children.forEach(child => {
          child.component.update(child.props)
        })
      }
    }
  }

  [addOffset] (child, offset) {
    const size = this[getSize](child)
    const idx = child.props.index
    const newSize = Math.max(size + offset, 0)
    const currentFlex = this[symbols.self].flexData[idx].flex
    const newFlex = (currentFlex > 0) ? currentFlex * newSize / size : this[computePixelFlex] () * newSize

    this[symbols.self].flexData[idx].flex = (!isFinite(newFlex) || isNaN(newFlex)) ? 0 : newFlex
  }

  [getSize] (child) {
    if (this[symbols.self].properties.orientation === 'vertical') {
      return child.domNode.offsetWidth
    }

    return child.domNode.offsetHeight
  }

  [computeAvailableOffset] (idx, offset) {
    const stretch = this[computeAvailableStretch](idx, offset)
    const shrink = this[computeAvailableShrink](idx, offset)
    const availableOffset = Math.min(stretch, shrink) * Math.sign(offset)

    return availableOffset
  }

  [computeAvailableStretch] (idx, offset) {
    const childIdx = offset < 0 ? idx + 1 : idx - 1
    const child = this[symbols.self].children[childIdx]
    const size = this[getSize](child)
    const maxSize = child.props.maxSize
    const availableStretch = maxSize - size

    if (availableStretch < Math.abs(offset)) {
      if (this[checkPropagate](idx, -1 * offset)) {
        const nextOffset = Math.sign(offset) * (Math.abs(offset) - availableStretch)

        return availableStretch + this[computeAvailableStretch](offset < 0 ? idx + 2 : idx - 2, nextOffset)
      }
    }

    return Math.min(availableStretch, Math.abs(offset))
  }

  [computeAvailableShrink] (idx, offset) {
    const childIdx = offset > 0 ? idx + 1 : idx -1
    const child = this[symbols.self].children[childIdx]
    const size = this[getSize](child)
    const minSize = Math.max(child.props.minSize, 0)
    const availableShrink = size - minSize

    if (availableShrink < Math.abs(offset)) {
      if (this[checkPropagate](idx, offset)) {
        const nextOffset = Math.sign(offset) * (Math.abs(offset) - availableShrink)

        return availableShrink + this[computeAvailableShrink](offset > 0 ? idx + 2 : idx - 2, nextOffset)
      }
    }

    return Math.min(availableShrink, Math.abs(offset))
  }

  [checkPropagate] (idx, direction) {
    if (direction > 0) {
      if (idx < this[symbols.self].children.length - 2) {
        const child = this[symbols.self].children[idx + 2]

        return child.tag === EtchFlexSplitter && child.props.propagate
      }
    } else {
      if (idx > 2) {
        const child = this[symbols.self].children[idx - 2]

        return child.tag === EtchFlexSplitter && child.props.propagate
      }
    }

    return false
  }

  [dispatchOffset] (idx, offset) {
    return [
      ...this[dispatchStretch](idx, offset),
      ...this[dispatchShrink](idx, offset)
    ]
  }

  [dispatchShrink] (idx, offset) {
    const childIdx = offset > 0 ? idx + 1 : idx - 1
    if (childIdx < 0 || childIdx > this[symbols.self].children.length-1) {
      return []
    }

    const child = this[symbols.self].children[childIdx]
    const size = this[getSize](child)
    const newSize = Math.max(child.props.minSize, size - Math.abs(offset))
    const dispatchedShrink = newSize - size

    this[addOffset](child, dispatchedShrink)

    if (Math.abs(dispatchedShrink) < Math.abs(offset)) {
      const nextIdx = idx + Math.sign(offset) * 2
      const nextOffset = Math.sign(offset) * (Math.abs(offset) + dispatchedShrink)

      return [
        child,
        ...this[dispatchShrink](nextIdx, nextOffset)
      ]
    }

    return [child]
  }

  [dispatchStretch] (idx, offset) {
    const childIdx = offset < 0 ? idx + 1 : idx - 1

    if (childIdx < 0 || childIdx > this[symbols.self].children.length-1) {
      return []
    }

    const child = this[symbols.self].children[childIdx]
    const size = this[getSize](child)
    const newSize = Math.min(child.props.maxSize, size + Math.abs(offset))
    const dispatchedStretch = newSize - size

    this[addOffset](child, dispatchedStretch)

    if (dispatchedStretch < Math.abs(offset)) {
      const nextIdx = idx - Math.sign(offset) * 2
      const nextOffset = Math.sign(offset) * (Math.abs(offset) - dispatchedStretch)

      return [
        child,
        ...this[dispatchStretch](nextIdx, nextOffset)
      ]
    }

    return [child]
  }

  [adjustFlex] (children) {
    const diffFlex = children.reduce((sum, child) => {
      const idx = child.props.index
      const previousFlex = child.props.flex
      const nextFlex = this[symbols.self].flexData[idx].flex

      return sum + (previousFlex - nextFlex) / children.length
    }, 0)

    children.forEach(child => {
      this[symbols.self].flexData[child.props.index].flex += diffFlex
      child.props.flex = this[symbols.self].flexData[child.props.index].flex
    })
  }

  [computePixelFlex] () {
    if (this[symbols.self].properties.orientation === 'vertical') {
      return 1.0 / this.element.offsetWidth
    }

    return 1.0 / this.element.offsetHeight
  }

  [computeFlexData] () {
    const pixelFlex = this[computePixelFlex]()

    const computeFreeFlex = (flexData) => {
      return flexData.reduce((sum, entry) => {
        if (!entry.isSplitter && entry.constrained) {
          return sum - entry.flex
        }
        return sum
      }, 1)
    }

    const computeFreeElements = (flexData) => {
      return flexData.reduce((sum, entry) => {
        if (!entry.isSplitter && !entry.constrained) {
          return sum + 1
        }
        return sum
      }, 0)
    }

    const flexDataInit = this[symbols.self].children.map(child => {
      const props = child.props || {}

      return {
        maxFlex: (props.maxSize || Number.MAX_VALUE) * pixelFlex,
        sizeFlex: (props.size || Number.MAX_VALUE) * pixelFlex,
        minFlex: (props.minSize || 1) * pixelFlex,
        constrained: props.flex !== undefined,
        flex: props.flex || 0,
        isSplitter: child.tag === EtchFlexSplitter
      }
    })

    const computeFlexDataRec = (flexDataIn) => {
      let hasContrain = false
      const freeElements = computeFreeElements(flexDataIn)
      const freeFlex = computeFreeFlex(flexDataIn)
      const flexDataOut = flexDataIn.map((entry) => {
        if (entry.isSplitter) {
          return entry
        }

        const proposedFlex = !entry.constrained ? freeFlex / freeElements : entry.flex
        const constrainedFlex = Math.min(entry.sizeFlex, Math.min(entry.maxFlex, Math.max(entry.minFlex, proposedFlex)))
        const constrained = (constrainedFlex !== proposedFlex)

        hasContrain = hasContrain || constrained

        return Object.assign({}, entry, {
          flex: constrainedFlex,
          constrained
        })
      })

      return hasContrain ? computeFlexDataRec(flexDataOut) : flexDataOut
    }

    const flexData = computeFlexDataRec(flexDataInit)

    return flexData.map((entry) => {
      return {
          flex: !entry.isSplitter ? entry.flex : 0.0
       }
    })
  }
}
