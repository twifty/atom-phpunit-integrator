/** @babel */
/** @jsx etch.dom */
/* global Promise atom document */

import etch from 'etch'
import {CompositeDisposable} from 'atom'

export default class PhpUnitSkelgenView
{
  constructor () {
    this.disposables = new CompositeDisposable()

    etch.initialize(this)

    this.disposables.add(atom.commands.add(this.element, {
      'core:confirm': (e) => {
        this.onConfirm()
        e.stopPropagation()
      },
      'core:cancel': (e) => {
        this.onCancel()
        e.stopPropagation()
      }
    }))

    this.modal = atom.workspace.addModalPanel({
      item: this.element,
      visible: false
    })
  }

  update () {}

  destroy () {
    this.disposables.dispose()
    this.modal.destroy()
    etch.destroy(this)
  }

  open (source, onConfirm) {
    this.source = source
    this.confirmHandler = onConfirm

    return etch.update(this).then(() => {
      this.modal.show()
      this.refs.but2.focus()
    })
  }

  onConfirm () {
    this.modal.hide()
    this.confirmHandler(this.source)
  }

  onCancel () {
    this.modal.hide()
  }


  onKeyPress (event) {
    if ('Tab' === event.key) {
      event.preventDefault()

      if (event.target === this.refs.but1) {
        this.refs.but2.focus()
      } else if (event.target === this.refs.but2) {
        this.refs.but1.focus()
      }
    }
  }

  render () {
    let type = 'class'
    let name = ''

    if (this.source) {
      name = this.source.fqcn

      if (this.source.method) {
        type = 'case'
        name += '::' + this.source.method
      }
    }

    return (
      <div onKeyDown={ this.onKeyPress } className="php-unit-integrator php-unit-skelgen">
        <span>The following test {type} does not exist.</span>
        <span>{ name }</span>
        <span>Would you like to create it?</span>
        <div>
          <button ref="but1" className="btn" onClick={ this.onConfirm } tabIndex="0">Yes</button>
          <button ref="but2" className="btn" onClick={ this.onCancel } tabIndex="1">No</button>
        </div>
      </div>
    )
  }
}
