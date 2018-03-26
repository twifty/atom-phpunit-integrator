/** @babel */
/** @jsx etch.dom */

import etch from 'etch'

import EtchComponent from './etch-component'
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

export default class EtchTreeNode extends EtchComponent
{
  constructor (props, children, options) {
    super(props, children, options)

    this[symbols.self].childNodes = buildHierarchy(children, this)

    if (typeof props.onDidSelect === 'function') {
      this.on('select', props.onDidSelect)
    }
  }

  update (props, children) {
    return super.update(props, children).then(() => {
      this[symbols.self].childNodes = buildHierarchy(children, this)
    })
  }

  onDidSelect (cb) {
    return this.on('select', cb)
  }

  getChildNodes () {
    return this[symbols.self].childNodes
  }

  getParentNode () {
    return this[symbols.self].parentNode
  }

  setSelected (selected) {
    if (selected !== this[symbols.self].properties.selected) {
      this[symbols.self].properties.selected = selected

      this[symbols.scheduleUpdate](() => {
        if (selected) {
          this.element.classList.add('selected')
        } else {
          this.element.classList.remove('selected')
        }
      })
    }
  }

  setCollapsed (collapsed) {
    if (collapsed !== this[symbols.self].properties.collapsed) {
      this[symbols.self].properties.collapsed = collapsed

      this[symbols.scheduleUpdate](() => {
        if (this[symbols.self].properties.collapsed) {
          this.element.classList.add('collapsed')
          this.element.classList.remove('expanded')
        } else {
          this.element.classList.add('expanded')
          this.element.classList.remove('collapsed')
        }
      })
    }
  }

  setDisabled (disabled) {
    if (disabled !== this[symbols.self].properties.disabled) {
      this[symbols.self].properties.disabled = disabled

      this[symbols.scheduleUpdate](() => {
        if (this[symbols.self].properties.disabled) {
          this.element.setAttribute('disabled', true)
        } else {
          this.element.removeAttribute('disabled')
        }
      })
    }
  }

  isSelected () {
    return !!this[symbols.self].properties.selected
  }

  isCollapsed () {
    return !!this[symbols.self].properties.collapsed
  }

  isDisabled () {
    return !!this[symbols.self].properties.disabled
  }

  onClick (event) {
    if (event.ctrlKey) {
      this.setSelected(!this[symbols.self].properties.selected)
      this[symbols.emit]('select', this)
    } else {
      this.setCollapsed(!this[symbols.self].properties.collapsed)
    }
  }

  render () {
    var itemData = null
    var children = null

    const itemIcon = this[symbols.self].properties.icon ? (<span className={ 'icon ' + this[symbols.self].properties.icon }></span>) : null

    // If a value was not supplied as a property, use the first child
    if (this[symbols.self].properties.value) {
      children = this[symbols.self].children
      itemData = (
        <span>
          { itemIcon }
          { this[symbols.self].properties.value || '' }
        </span>
      )
    } else if (this[symbols.self].children.length) {
      children = this[symbols.self].children.slice(1)
      itemData = (
        <span>
          { itemIcon }
          { this[symbols.self].children[0] }
        </span>
      )
    } else {
      return (<div />)
    }

    if (children.length) {
      const className = this[symbols.getClassName](
        'list-nested-item',
        this[symbols.self].properties.collapsed ? 'collapsed' : 'expanded',
        this[symbols.self].properties.selected ? 'selected' : null
      )

      return (
        <li className={ className }>
          <div className="list-item" onClick={ this.onClick }>
            { itemData }
          </div>
          <ul className="list-tree">
            { children }
          </ul>
        </li>
      )
    } else {
      const className = this[symbols.getClassName](
        'list-item',
        this[symbols.self].properties.selected ? 'selected' : null
      )

      return (
        <li className={ className } onClick={ this.onClick }>
          { itemData }
        </li>
      )
    }
  }
}
