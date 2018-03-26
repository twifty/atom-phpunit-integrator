/** @babel */
/** @jsx etch.dom */

import etch from 'etch'

import EtchComponent from './etch-component'
import EtchTreeNode from './etch-tree-node'
import symbols from './symbols'

const buildHierarchy = (children, parent) => {
  const childNodes = []

  children.forEach((child) => {
    if (child.tag === EtchTreeNode) {
      child.component[symbols.self].parentNode = parent

      childNodes.push(child.component)
    }
  })

  return childNodes
}

export default class EtchTreeView extends EtchComponent
{
  constructor (props, children, options) {
    super(props, children, options)

    this[symbols.self].childNodes = buildHierarchy(children, this)
  }

  update (props, children) {
    return super.update(props, children).then(() => {
      this[symbols.self].childNodes = buildHierarchy(children, this)
    })
  }

  getChildNodes () {
    return this[symbols.self].childNodes
  }

  getParentNode () {
    return null
  }

  render () {
    const className = this[symbols.getClassName](
      'etch-tree list-tree has-collapsable-children'
    )

    return (
      <ul
        className={ className }
        style={ this[symbols.getStyle]() }
      >{ this[symbols.self].children }</ul>
    )
  }
}
