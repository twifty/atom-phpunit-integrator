/** @babel */
/** @jsx etch.dom */
/* global WeakMap */

import etch from 'etch'

import EtchComponent from './etch-component'
import symbols from './symbols'
import {clone, makeObjectIterable} from './utils'

const defaultComparator = (left, right, sortAsc) => {
  if (typeof left === 'string' && typeof right === 'string') {
    if (sortAsc) {
      return left.localeCompare(right)
    }

    return right.localeCompare(left)
  }

  if (sortAsc) {
    return left > right ? -1 : (left < right ? 1 : 0)
  }

  return left > right ? 1 : (left < right ? -1 : 0)
}

export default class EtchTable extends EtchComponent
{
  update (props, children) {
    super.update(props, children, {
      update: false
    })

    this[symbols.self].properties.data = makeObjectIterable(this[symbols.self].properties.data)

    return etch.update(this)
  }

  [symbols.initialize] () {
    this[symbols.self].properties.data = makeObjectIterable(this[symbols.self].properties.data)
  }

  getCallersContext () {
    if (this[symbols.self].children.length) {
      return this[symbols.self].children[0].context
    }
    return null
  }

  *getColumnTemplates () {
    const context = this.getCallersContext()

    for (const child of this[symbols.self].children) {
      const template = clone(child)

      template.props = Object.assign(template.props || {}, {
        ':context': context
      })

      yield template
    }
  }

  onSort (index, comparator, resolver, dir) {
    const element = this.refs[index]
    const column = index.split('-')[1]
    let sortAsc = dir ? dir === 'asc' : element.classList.contains('etch-table-sort-asc')

    const map = new WeakMap()
    const values = []

    if (!resolver) {
      resolver = (sortColumn) => {
        return sortColumn.dataset.value !== undefined ? sortColumn.dataset.value : sortColumn.innerText.toLowerCase()
      }
    }

    for (const row of this.refs['body'].childNodes) {
      const sortColumn = row.childNodes[column].firstChild
      const sortValue = resolver(sortColumn)

      // make unique by wrapping in an object
      const instance = {sortValue}
      values.push(instance)
      map.set(instance, row)
    }

    values.sort((a, b) => {
      return comparator(a.sortValue, b.sortValue, sortAsc)
    })

    this[symbols.scheduleUpdate](() => {
      if (this.prevSort) {
        this.prevSort.classList.remove('etch-table-sort-asc')
        this.prevSort.classList.remove('etch-table-sort-desc')
      }

      if (sortAsc) {
        element.classList.add('etch-table-sort-desc')
      } else {
        element.classList.add('etch-table-sort-asc')
      }

      this.prevSort = element

      for (const sortValue of values) {
        this.refs['body'].appendChild(map.get(sortValue))
      }
    })
  }

  buildHeader () {
    let column = 0
    const cells = []

    for (const template of this.getColumnTemplates()) {
      const sortable = template.props.sortable
      const events = {}
      const ref = 'col-' + column++

      let child

      if (template.children.length && template.children[0].text) {
        child = <span>{ template.children[0] }</span>
      }
      else if (typeof template.props.value === 'function') {
        child = template.props.value()
      }
      else if (template.props.value) {
        child = <span>{ template.props.value }</span>
      }
      else if (Array.isArray(template.props.field)) {
        child = <span>{ template.props.field.join(',') }</span>
      }
      else {
        throw new Error('Unbale to determine value for etch table header.')
      }

      const classNames = [
        'etch-table-cell',
        template.props.className
      ]

      if (sortable) {
        let comparator = defaultComparator
        if (sortable.comparator && typeof sortable.comparator === 'function') {
          comparator = sortable.comparator
        }

        let resolver = null
        if (sortable.resolver && typeof sortable.resolver === 'function') {
          resolver = sortable.resolver
        }

        classNames.push('etch-table-sort')
        events.click = this.onSort.bind(this, ref, comparator, resolver, null)

        if (sortable.initial) {
          this[symbols.scheduleUpdate](() => {
            this.onSort(ref, comparator, resolver, sortable.initial === 'asc' ? 'desc' : 'asc')
          })
        }
      }

      cells.push(
        <div ref={ ref } className={ classNames.join(' ') } on={ events }>
          { child }
        </div>
      )
    }

    return cells
  }

  buildRows () {
    let count = 0
    const rows = []

    for (const rowData of this[symbols.self].properties.data) {
      const ref = 'row-' + count++
      const cells = []

      for (const template of this.getColumnTemplates()) {
        template.props[':fieldData'] = clone(rowData)

        cells.push(template)
      }

      rows.push(
        <div ref={ ref } className="etch-table-row">
          { cells }
        </div>
      )
    }

    return rows
  }

  render () {
    const header = this.buildHeader()
    const rows = this.buildRows()

    return (
      <div className={ this[symbols.getClassName]('etch-table') }>
        <div ref='header' className='etch-table-header'>{ header }</div>
        <div ref='body' className='etch-table-body'>{ rows }</div>
      </div>
    )
  }
}
