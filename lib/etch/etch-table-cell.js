/** @babel */
/** @jsx etch.dom */

import etch from 'etch'

import EtchComponent from './etch-component'
import symbols from './symbols'

export default class EtchTableCell extends EtchComponent
{
  getFields () {
    const props = this[symbols.self].properties
    const fields = {}

    if (props[':fieldNames']) {
      for (const name of props[':fieldNames']) {
        fields[name] = props[name]
      }
    }

    return fields
  }

  render () {
    const fields = this.getFields()
    const content = []

    for (const value of Object.values(fields)) {
      content.push(
        <span>{ value }</span>
      )
    }

    if (1 === content.length) {
      return content[0]
    }

    return <span>{ content }</span>
  }
}
