/** @babel */
/** @jsx etch.dom */
/* global Promise */

import etch from 'etch'
import {Emitter} from 'atom'

export default class PhpUnitStatusBarView
{
  constructor (statusBar) {
    etch.initialize(this)

    this.emitter = new Emitter()
    this.active = false
    this.tile = statusBar.addLeftTile({
      item: this.element,
      priority: -99
    })
  }

  destroy () {
    if (this.tile) {
      this.tile.destroy()
    }
  }

  setActive (active) {
    if (this.tile) {
      let classes = this.refs.tile.classList
      this.active = active
      if (active) {
        classes.add('active')
      } else {
        classes.remove('active')
      }
    }
  }

  isActive () {
    return this.active
  }

  onDidClick (cb) {
    return this.emitter.on('click', cb)
  }

  update () {
    return Promise.resolve()
  }

  render () {
    const onClick = () => {
      this.emitter.emit('click')
    }

    return (
      <div ref='tile' onClick={onClick} className='php-unit-status-bar'>
        <span className='icon icon-terminal'>PHPUnit</span>
      </div>
    )
  }
}
